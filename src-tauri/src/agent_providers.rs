//! A small local bridge for extra AI Agents (WorkBuddy, 豆包, Marvis, ...).
//!
//! Built-in Codex / Claude Code statuses come from their hooks. Anything else can
//! POST a JSON status to `http://127.0.0.1:<port>/agent-status`; the island shows
//! one tab per provider, with quota, task phase and a completion note. Local-only,
//! no command execution: the payload is display data and is size limited.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    fs,
    io::{BufRead, BufReader, Read, Seek, SeekFrom, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
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
    spawn_workbuddy_poller();
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

// ---------------------------------------------------------------------------
// WorkBuddy 内置状态源
// ---------------------------------------------------------------------------
// 本机 WorkBuddy 的会话记录是结构化 JSONL（%USERPROFILE%\.workbuddy\projects），
// 直接读它就能得到任务标题、最近动作、token 用量与是否在等待确认。这样用户
// 不必安装额外脚本或配置开机自启：岛一启动，WorkBuddy 选项卡就有真实状态。

const WORKBUDDY_POLL: Duration = Duration::from_secs(8);
const WORKBUDDY_TAIL_BYTES: u64 = 900 * 1024;
const WORKBUDDY_RUNNING_SECONDS: f64 = 25.0;
const WORKBUDDY_COMPLETED_SECONDS: f64 = 180.0;

fn workbuddy_projects_dir() -> Option<PathBuf> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok()?;
    Some(PathBuf::from(home).join(".workbuddy").join("projects"))
}

fn collect_jsonl(dir: &Path, depth: u8, out: &mut Vec<(PathBuf, SystemTime)>) {
    if depth > 3 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_jsonl(&path, depth + 1, out);
        } else if path.extension().and_then(|ext| ext.to_str()) == Some("jsonl") {
            if let Ok(modified) = entry.metadata().and_then(|meta| meta.modified()) {
                out.push((path, modified));
            }
        }
    }
}

fn latest_session() -> Option<PathBuf> {
    let dir = workbuddy_projects_dir()?;
    let mut files = Vec::new();
    collect_jsonl(&dir, 0, &mut files);
    files.sort_by(|left, right| right.1.cmp(&left.1));
    files.into_iter().next().map(|(path, _)| path)
}

fn session_tail(path: &Path) -> String {
    let Ok(mut file) = fs::File::open(path) else {
        return String::new();
    };
    let length = file.metadata().map(|meta| meta.len()).unwrap_or(0);
    let start = length.saturating_sub(WORKBUDDY_TAIL_BYTES);
    if file.seek(SeekFrom::Start(start)).is_err() {
        return String::new();
    }
    let mut bytes = Vec::new();
    if file.read_to_end(&mut bytes).is_err() {
        return String::new();
    }
    let text = String::from_utf8_lossy(&bytes).into_owned();
    if start > 0 {
        // 尾部定位大概率落在某一行中间，丢掉第一行。
        return text
            .split_once('\n')
            .map(|(_, rest)| rest.to_string())
            .unwrap_or_default();
    }
    text
}

fn message_text(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Array(items) => items
            .iter()
            .filter_map(|item| item.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join(" "),
        _ => String::new(),
    }
}

fn looks_like_path(word: &str) -> bool {
    let bytes = word.as_bytes();
    bytes.len() > 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
}

fn clean_title(input: &str) -> String {
    let mut text = input.to_string();
    // 系统提醒整块抹掉（内容比标签本身更吵）。
    while let Some(start) = text.find("<system-reminder") {
        let Some(relative_end) = text[start..].find("</system-reminder>") else {
            break;
        };
        let end = start + relative_end + "</system-reminder>".len();
        text.replace_range(start..end, " ");
    }
    let mut plain = String::new();
    let mut in_tag = false;
    for ch in text.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => plain.push(ch),
            _ => {}
        }
    }
    let joined = plain
        .split_whitespace()
        .filter(|word| !word.starts_with("@image") && !looks_like_path(word))
        .collect::<Vec<_>>()
        .join(" ");
    joined.chars().take(70).collect()
}

/// 从最近一份会话记录推断 WorkBuddy 的当前状态；读不到时返回 None。
fn read_workbuddy_status() -> Option<ProviderStatus> {
    let path = latest_session()?;
    let tail = session_tail(&path);
    if tail.is_empty() {
        return None;
    }

    let mut last_ts = 0u64;
    let mut last_kind = String::new();
    let mut last_user = String::new();
    let mut last_assistant = String::new();
    let mut last_tool = String::new();
    let mut pending_call: Option<String> = None;
    let mut open_calls: BTreeMap<String, String> = BTreeMap::new();
    let mut used_tokens = 0.0f64;

    for line in tail.lines() {
        let Ok(record) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let kind = record.get("type").and_then(Value::as_str).unwrap_or("");
        if let Some(timestamp) = record.get("timestamp").and_then(Value::as_u64) {
            if timestamp >= last_ts {
                last_ts = timestamp;
                last_kind = kind.to_string();
            }
        }

        let usage = record
            .get("message")
            .and_then(|message| message.get("usage"))
            .or_else(|| record.get("rawUsage"));
        if let Some(total) = usage
            .and_then(|value| value.get("total_tokens").or_else(|| value.get("totalTokens")))
            .and_then(Value::as_f64)
        {
            // 每次请求的 total_tokens 是累计上下文，取最后一次即可；累加会翻倍。
            used_tokens = total;
        }

        match kind {
            "message" => {
                let body = record.get("content").map(message_text).unwrap_or_default();
                if body.is_empty() {
                    continue;
                }
                let title = clean_title(&body);
                match record.get("role").and_then(Value::as_str) {
                    Some("user") => last_user = title,
                    Some("assistant") => last_assistant = title,
                    _ => {}
                }
            }
            "function_call" => {
                let name = record
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("工具")
                    .to_string();
                last_tool = name.clone();
                if let Some(id) = record.get("callId").and_then(Value::as_str) {
                    open_calls.insert(id.to_string(), name.clone());
                }
                pending_call = Some(name);
            }
            "function_call_result" => {
                if let Some(id) = record.get("callId").and_then(Value::as_str) {
                    open_calls.remove(id);
                }
                pending_call = open_calls.values().next_back().cloned();
            }
            _ => {}
        }
    }

    let now = now_ms();
    let age_seconds = if last_ts > 0 {
        (now.saturating_sub(last_ts) as f64) / 1000.0
    } else {
        f64::MAX
    };
    let needs_approval = pending_call.as_deref().is_some_and(|name| {
        let lower = name.to_ascii_lowercase();
        ["ask", "question", "confirm", "permission", "approve"]
            .iter()
            .any(|key| lower.contains(key))
    });
    let phase = if age_seconds <= WORKBUDDY_RUNNING_SECONDS {
        if needs_approval {
            "waiting"
        } else {
            "running"
        }
    } else if age_seconds <= WORKBUDDY_COMPLETED_SECONDS && last_kind == "message" {
        "completed"
    } else {
        "idle"
    };

    let task = if phase == "completed" && !last_assistant.is_empty() {
        format!("已完成：{}", last_assistant.chars().take(60).collect::<String>())
    } else if needs_approval {
        format!("等待确认：{}", pending_call.unwrap_or_default())
    } else if !last_tool.is_empty() {
        format!("最近动作：{}", last_tool)
    } else {
        String::new()
    };

    Some(ProviderStatus {
        provider: "workbuddy".into(),
        phase: phase.into(),
        title: Some(if last_user.is_empty() {
            "WorkBuddy".into()
        } else {
            last_user
        }),
        task: if task.is_empty() {
            None
        } else {
            Some(task.chars().take(180).collect())
        },
        quota_used: (used_tokens > 0.0).then_some(used_tokens.round()),
        quota_total: None,
        quota_label: (used_tokens > 0.0).then(|| "tokens".into()),
        needs_approval,
        updated_at: now,
    })
}

fn publish_builtin(service: &Service, status: ProviderStatus) {
    let mut statuses = service
        .statuses
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    statuses.insert(
        status.provider.clone(),
        Stored {
            status,
            seen_at: Instant::now(),
        },
    );
    let snapshot = snapshot_from(&statuses);
    drop(statuses);
    let _ = service.app.emit_to("main", EVENT, snapshot.clone());
    let _ = service
        .app
        .emit_to(crate::settings_window::WINDOW_LABEL, EVENT, snapshot);
}

fn spawn_workbuddy_poller() {
    let _ = thread::Builder::new()
        .name("workbuddy-status".into())
        .spawn(|| loop {
            if let Some(service) = SERVICE.get() {
                if let Some(status) = read_workbuddy_status() {
                    publish_builtin(service, status);
                }
            }
            thread::sleep(WORKBUDDY_POLL);
        });
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
