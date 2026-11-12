//! ntfy notifications: commands, snapshot types and the SSE listener service.

mod config;
mod sse;

use config::NtfyConfig;
use serde::Serialize;
use std::{
    collections::HashSet,
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex, OnceLock,
    },
};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

const EVENT_NAME: &str = "ntfy-notifications-changed";
const MAX_ITEMS: usize = 50;
const MAX_SEEN: usize = 2000;

static SERVICE: OnceLock<Arc<NtfyService>> = OnceLock::new();

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NtfyMessage {
    id: String,
    topic: String,
    title: String,
    body: String,
    priority: i32,
    created_at: i64,
    /// Server root this message arrived on, so opening the topic uses the
    /// matching host even when several servers are configured.
    server: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum NtfyStatus {
    Disabled,
    Connecting,
    Listening,
    Error,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NtfySnapshot {
    revision: u64,
    enabled: bool,
    status: NtfyStatus,
    items: Vec<NtfyMessage>,
    error: Option<String>,
    config: NtfyConfig,
}

impl Default for NtfySnapshot {
    fn default() -> Self {
        let config = NtfyConfig::default();
        let enabled = config.enabled;
        Self {
            revision: 0,
            enabled,
            status: if enabled {
                NtfyStatus::Connecting
            } else {
                NtfyStatus::Disabled
            },
            items: Vec::new(),
            error: None,
            config,
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NtfyEvent {
    snapshot: NtfySnapshot,
    newest_id: Option<String>,
    window_visible: bool,
}

struct NtfyState {
    snapshot: NtfySnapshot,
    seen: HashSet<String>,
}

struct NtfyService {
    app: AppHandle,
    state: Mutex<NtfyState>,
    generation: AtomicU64,
    config_path: PathBuf,
}

pub fn init(app: &AppHandle) -> Result<(), String> {
    if SERVICE.get().is_some() {
        return Ok(());
    }
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法定位应用数据目录：{error}"))?;
    fs::create_dir_all(&app_dir)
        .map_err(|error| format!("无法创建应用数据目录：{error}"))?;
    let config_path = app_dir.join("ntfy.json");
    let config = config::load(&config_path);
    if !config_path.exists() {
        config::save(&config_path, &config)?;
    }
    let enabled = config.enabled;
    let snapshot = NtfySnapshot {
        revision: 0,
        enabled,
        status: if enabled {
            NtfyStatus::Connecting
        } else {
            NtfyStatus::Disabled
        },
        items: Vec::new(),
        error: None,
        config,
    };
    let service = Arc::new(NtfyService {
        app: app.clone(),
        state: Mutex::new(NtfyState {
            snapshot,
            seen: HashSet::new(),
        }),
        generation: AtomicU64::new(1),
        config_path,
    });
    SERVICE
        .set(service.clone())
        .map_err(|_| "ntfy 服务已启动。".to_string())?;
    if enabled {
        start_tasks(&service);
    }
    Ok(())
}

fn service() -> Result<&'static Arc<NtfyService>, String> {
    SERVICE
        .get()
        .ok_or_else(|| "ntfy 服务尚未就绪。".to_string())
}

fn start_tasks(service: &Arc<NtfyService>) {
    let generation = service.generation.load(Ordering::SeqCst);
    let config = current_config(service.as_ref());
    if !config.enabled {
        return;
    }
    // Every configured server subscribes to every configured topic.
    for server in config.servers() {
        for topic in &config.topics {
            let service = service.clone();
            let server = server.clone();
            let topic = topic.clone();
            let _ = tauri::async_runtime::spawn(async move {
                sse::run(service, server, topic, generation).await;
            });
        }
    }
}

fn current_config(service: &NtfyService) -> NtfyConfig {
    match service.state.lock() {
        Ok(state) => state.snapshot.config.clone(),
        Err(error) => error.into_inner().snapshot.config.clone(),
    }
}

fn generation(service: &NtfyService) -> u64 {
    service.generation.load(Ordering::SeqCst)
}

fn update_status(service: &Arc<NtfyService>, status: NtfyStatus, error: Option<String>) {
    let snapshot = {
        let mut state = match service.state.lock() {
            Ok(state) => state,
            Err(error) => error.into_inner(),
        };
        if state.snapshot.status == status && state.snapshot.error == error {
            return;
        }
        state.snapshot.status = status;
        state.snapshot.error = error;
        state.snapshot.revision += 1;
        state.snapshot.clone()
    };
    publish(service, snapshot, None);
}

fn push_message(service: &Arc<NtfyService>, message: NtfyMessage) {
    let (snapshot, newest_id) = {
        let mut state = match service.state.lock() {
            Ok(state) => state,
            Err(error) => error.into_inner(),
        };
        if state.seen.contains(&message.id) {
            return;
        }
        state.seen.insert(message.id.clone());
        if state.seen.len() > MAX_SEEN {
            state.seen.clear();
            state.seen.insert(message.id.clone());
        }
        state.snapshot.items.insert(0, message.clone());
        state.snapshot.items.truncate(MAX_ITEMS);
        state.snapshot.revision += 1;
        // Muted topics are still collected in the list, but must not raise the
        // intrusive popup preview.
        let muted = state
            .snapshot
            .config
            .muted
            .iter()
            .any(|topic| topic.eq_ignore_ascii_case(&message.topic));
        let newest_id = if muted { None } else { Some(message.id.clone()) };
        (state.snapshot.clone(), newest_id)
    };
    publish(service, snapshot, newest_id);
}

fn publish(service: &Arc<NtfyService>, snapshot: NtfySnapshot, newest_id: Option<String>) {
    let window_visible = service
        .app
        .get_webview_window("main")
        .is_some_and(|window| window.is_visible().unwrap_or(false));
    let event = NtfyEvent {
        snapshot,
        newest_id,
        window_visible,
    };
    let _ = service.app.emit_to(
        crate::settings_window::WINDOW_LABEL,
        EVENT_NAME,
        event.clone(),
    );
    let _ = service.app.emit_to("main", EVENT_NAME, event);
}

#[tauri::command]
pub fn get_ntfy_state() -> Result<NtfySnapshot, String> {
    let service = service()?;
    let state = service
        .state
        .lock()
        .map_err(|_| "ntfy 状态不可用。".to_string())?;
    Ok(state.snapshot.clone())
}

#[tauri::command]
pub fn set_ntfy_enabled(enabled: bool) -> Result<NtfySnapshot, String> {
    let service = service()?;
    service.generation.fetch_add(1, Ordering::SeqCst);
    let snapshot = {
        let mut state = service
            .state
            .lock()
            .map_err(|_| "ntfy 状态不可用。".to_string())?;
        let mut config = state.snapshot.config.clone();
        config.enabled = enabled;
        config::save(&service.config_path, &config)?;
        state.snapshot = NtfySnapshot {
            revision: state.snapshot.revision + 1,
            enabled,
            status: if enabled {
                NtfyStatus::Connecting
            } else {
                NtfyStatus::Disabled
            },
            items: Vec::new(),
            error: None,
            config,
        };
        state.seen.clear();
        state.snapshot.clone()
    };
    publish(service, snapshot.clone(), None);
    if enabled {
        start_tasks(service);
    }
    Ok(snapshot)
}

#[tauri::command]
pub fn set_ntfy_config(
    server: String,
    topics: Vec<String>,
    token: Option<String>,
) -> Result<NtfySnapshot, String> {
    let service = service()?;
    let enabled = current_config(service.as_ref()).enabled;
    let muted = current_config(service.as_ref()).muted.clone();
    let next = config::normalize(server, topics, token, enabled, muted)?;
    service.generation.fetch_add(1, Ordering::SeqCst);
    let snapshot = {
        let mut state = service
            .state
            .lock()
            .map_err(|_| "ntfy 状态不可用。".to_string())?;
        config::save(&service.config_path, &next)?;
        state.snapshot = NtfySnapshot {
            revision: state.snapshot.revision + 1,
            enabled: next.enabled,
            status: if next.enabled {
                NtfyStatus::Connecting
            } else {
                NtfyStatus::Disabled
            },
            items: Vec::new(),
            error: None,
            config: next,
        };
        state.seen.clear();
        state.snapshot.clone()
    };
    publish(service, snapshot.clone(), None);
    if snapshot.enabled {
        start_tasks(service);
    }
    Ok(snapshot)
}

#[tauri::command]
pub fn clear_ntfy_notifications() -> Result<NtfySnapshot, String> {
    let service = service()?;
    let snapshot = {
        let mut state = service
            .state
            .lock()
            .map_err(|_| "ntfy 状态不可用。".to_string())?;
        state.snapshot.items.clear();
        state.snapshot.revision += 1;
        state.snapshot.clone()
    };
    publish(service, snapshot.clone(), None);
    Ok(snapshot)
}

/// Mute or unmute a single subscribed topic. Muted topics stay in the list but
/// no longer raise the popup alert.
#[tauri::command]
pub fn set_ntfy_topic_muted(topic: String, muted: bool) -> Result<NtfySnapshot, String> {
    let service = service()?;
    let snapshot = {
        let mut state = service
            .state
            .lock()
            .map_err(|_| "ntfy 状态不可用。".to_string())?;
        let mut config = state.snapshot.config.clone();
        let topic = topic.trim().to_string();
        if muted {
            if !config.muted.iter().any(|t| t.eq_ignore_ascii_case(&topic)) {
                config.muted.push(topic);
            }
        } else {
            config.muted.retain(|t| !t.eq_ignore_ascii_case(&topic));
        }
        config::save(&service.config_path, &config)?;
        state.snapshot.config = config;
        state.snapshot.revision += 1;
        state.snapshot.clone()
    };
    publish(service, snapshot.clone(), None);
    Ok(snapshot)
}

#[tauri::command]
pub fn open_ntfy_topic(
    app: AppHandle,
    topic: String,
    server: Option<String>,
) -> Result<(), String> {
    let topic = topic.trim();
    if topic.is_empty()
        || topic.contains('/')
        || topic.contains(',')
        || topic.contains('?')
        || topic.contains('#')
        || topic.contains(' ')
    {
        return Err("无效的 ntfy topic。".to_string());
    }
    let service = service()?;
    let config = current_config(service.as_ref());
    // Only ever open a URL on a server the user configured; a message payload
    // must never be able to make the opener launch an arbitrary address.
    let base = server
        .as_deref()
        .map(|value| config.server_for(value))
        .unwrap_or_else(|| config.servers()[0].clone());
    let url = format!("{}/{}", base.trim_end_matches('/'), topic);
    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|error| format!("无法打开 ntfy topic：{error}"))
}

/// This module's Tauri commands. `lib.rs` chains every module's list into one
/// `generate_handler!`, so adding a command only touches this file.
macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::ntfy::get_ntfy_state,
            crate::ntfy::set_ntfy_enabled,
            crate::ntfy::set_ntfy_config,
            crate::ntfy::clear_ntfy_notifications,
            crate::ntfy::set_ntfy_topic_muted,
            crate::ntfy::open_ntfy_topic,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
