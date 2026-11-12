//! A small local bridge for extra AI Agents (WorkBuddy, 豆包, Marvis, ...).
//!
//! Built-in Codex / Claude Code statuses come from their hooks. Anything else can
//! POST a JSON status to `http://127.0.0.1:<port>/agent-status`; the island shows
//! one tab per provider, with quota, task phase and a completion note. Local-only,
//! no command execution: the payload is display data and is size limited.

use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    io::{BufRead, BufReader, Read, Write},
    net::{TcpListener, TcpStream},
    sync::{Mutex, OnceLock},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter};

/// Preferred port; a free port is used when something already owns it.
const PREFERRED_PORT: u16 = 27182;
const MAX_BODY: usize = 16 * 1024;
const EVENT: &str = "agent-providers-changed";
/// Statuses not refreshed for this long are reported as idle/stale.
const STALE_AFTER: Duration = Duration::from_secs(180);

static SERVICE: OnceLock<Service> = OnceLock::new();
static PORT: OnceLock<u16> = OnceLock::new();

/// The JSON an external agent POSTs. Unknown fields are ignored.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Incoming {
    #[serde(default)]
    provider: String,
    #[serde(default)]
    phase: String,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    task: Option<String>,
    #[serde(default)]
    quota_used: Option<f64>,
    #[serde(default)]
    quota_total: Option<f64>,
    #[serde(default)]
    quota_label: Option<String>,
    #[serde(default)]
    needs_approval: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    pub provider: String,
    pub phase: String,
    pub title: Option<String>,
    pub task: Option<String>,
    pub quota_used: Option<f64>,
    pub quota_total: Option<f64>,
    pub quota_label: Option<String>,
    pub needs_approval: bool,
    pub updated_at: u64,
}

struct Stored {
    status: ProviderStatus,
    seen_at: Instant,
}

struct Service {
    app: AppHandle,
    statuses: Mutex<BTreeMap<String, Stored>>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn init(app: &AppHandle) -> Result<(), String> {
    if SERVICE.get().is_some() {
        return Ok(());
    }
    let listener = TcpListener::bind(("127.0.0.1", PREFERRED_PORT))
        .or_else(|_| TcpListener::bind(("127.0.0.1", 0)))
        .map_err(|error| format!("无法启动 AI Agent 接入端口：{error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("无法读取 AI Agent 接入端口：{error}"))?
        .port();
    let service = Service {
        app: app.clone(),
        statuses: Mutex::new(BTreeMap::new()),
    };
    SERVICE
        .set(service)
        .map_err(|_| "AI Agent 接入服务已启动。".to_string())?;
    let _ = PORT.set(port);
    thread::Builder::new()
        .name("agent-providers".into())
        .spawn(move || {
            for stream in listener.incoming().flatten() {
                let _ = thread::Builder::new()
                    .name("agent-provider-request".into())
                    .spawn(move || handle(stream));
            }
        })
        .map_err(|error| format!("无法启动 AI Agent 接入线程：{error}"))?;
    Ok(())
}

fn handle(stream: TcpStream) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut reader = BufReader::new(&stream);
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).is_err() {
        return;
    }
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let path = parts.next().unwrap_or_default();
    let mut length = 0usize;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).is_err() || line == "\r\n" || line == "\n" || line.is_empty() {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            if name.eq_ignore_ascii_case("content-length") {
                length = value.trim().parse().unwrap_or(0);
            }
        }
    }
    let ok = method == "POST" && path.split('?').next() == Some("/agent-status") && length <= MAX_BODY;
    if !ok {
        respond(&stream, 404, r#"{"error":"POST /agent-status expected"}"#);
        return;
    }
    let mut body = vec![0u8; length];
    if reader.read_exact(&mut body).is_err() {
        return;
    }
    let incoming: Incoming = match serde_json::from_slice(&body) {
        Ok(value) => value,
        Err(_) => {
            respond(&stream, 400, r#"{"error":"invalid JSON"}"#);
            return;
        }
    };
    let provider = incoming.provider.trim().to_string();
    if provider.is_empty() || provider.chars().count() > 32 {
        respond(&stream, 400, r#"{"error":"provider required"}"#);
        return;
    }
    let phase = match incoming.phase.as_str() {
        "running" | "waiting" | "completed" | "failed" => incoming.phase,
        _ => "idle".to_string(),
    };
    let status = ProviderStatus {
        provider: provider.clone(),
        phase,
        title: incoming.title.map(|value| value.chars().take(120).collect()),
        task: incoming.task.map(|value| value.chars().take(200).collect()),
        quota_used: incoming.quota_used,
        quota_total: incoming.quota_total,
        quota_label: incoming.quota_label.map(|value| value.chars().take(40).collect()),
        needs_approval: incoming.needs_approval,
        updated_at: now_ms(),
    };
    if let Some(service) = SERVICE.get() {
        let mut statuses = service
            .statuses
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        statuses.insert(provider, Stored { status, seen_at: Instant::now() });
        let snapshot = snapshot_from(&statuses);
        drop(statuses);
        let _ = service.app.emit_to("main", EVENT, snapshot.clone());
        let _ = service
            .app
            .emit_to(crate::settings_window::WINDOW_LABEL, EVENT, snapshot);
    }
    respond(&stream, 200, r#"{"ok":true}"#);
}

fn respond(stream: &TcpStream, status: u16, body: &str) {
    let mut stream = stream;
    let reason = if status == 200 { "OK" } else { "Bad Request" };
    let header = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(body.as_bytes());
}

fn snapshot_from(statuses: &BTreeMap<String, Stored>) -> Vec<ProviderStatus> {
    statuses
        .values()
        .map(|stored| {
            let mut status = stored.status.clone();
            if stored.seen_at.elapsed() > STALE_AFTER && status.phase == "running" {
                status.phase = "idle".into();
            }
            status
        })
        .collect()
}

#[tauri::command]
pub fn get_agent_provider_statuses() -> Vec<ProviderStatus> {
    SERVICE
        .get()
        .map(|service| {
            let statuses = service
                .statuses
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            snapshot_from(&statuses)
        })
        .unwrap_or_default()
}

#[tauri::command]
pub fn get_agent_bridge_port() -> u16 {
    PORT.get().copied().unwrap_or(PREFERRED_PORT)
}

#[tauri::command]
pub fn clear_agent_provider(provider: String) {
    if let Some(service) = SERVICE.get() {
        let mut statuses = service
            .statuses
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        statuses.remove(&provider);
    }
}

/// This module's Tauri commands, chained by `lib.rs`.
macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::agent_providers::get_agent_provider_statuses,
            crate::agent_providers::get_agent_bridge_port,
            crate::agent_providers::clear_agent_provider,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
