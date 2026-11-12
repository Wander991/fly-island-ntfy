use super::{NtfyMessage, NtfyService, NtfyStatus};
use reqwest::Client;
use serde_json::Value;
use std::{
    cmp::min,
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const CHUNK_TIMEOUT: Duration = Duration::from_secs(35);
const MAX_BACKOFF: Duration = Duration::from_secs(30);

/// One SSE stream: a single (server, topic) pair. With multiple servers the
/// service spawns one of these per server x topic combination.
pub(super) async fn run(
    service: Arc<NtfyService>,
    server: String,
    topic: String,
    generation: u64,
) {
    let client = match build_client() {
        Ok(client) => client,
        Err(error) => {
            super::update_status(&service, NtfyStatus::Error, Some(error));
            return;
        }
    };
    let mut backoff = Duration::from_secs(1);
    loop {
        if super::generation(service.as_ref()) != generation {
            return;
        }
        let config = super::current_config(service.as_ref());
        if !config.enabled {
            return;
        }
        let url = format!("{}/{}/sse", server.trim_end_matches('/'), topic);
        let mut request = client.get(url.as_str());
        if let Some(token) = config.token.as_deref() {
            request = request.bearer_auth(token);
        }
        let response = match request.send().await {
            Ok(response) => response,
            Err(error) => {
                super::update_status(
                    &service,
                    NtfyStatus::Error,
                    Some(format!("无法连接 ntfy：{error}")),
                );
                tokio::time::sleep(backoff).await;
                backoff = min(backoff * 2, MAX_BACKOFF);
                continue;
            }
        };
        if !response.status().is_success() {
            super::update_status(
                &service,
                NtfyStatus::Error,
                Some(format!("ntfy 返回 HTTP {}", response.status())),
            );
            tokio::time::sleep(backoff).await;
            backoff = min(backoff * 2, MAX_BACKOFF);
            continue;
        }
        super::update_status(&service, NtfyStatus::Listening, None);
        backoff = Duration::from_secs(1);
        let mut response = response;
        let mut buffer: Vec<u8> = Vec::new();
        let mut data_lines: Vec<String> = Vec::new();
        loop {
            if super::generation(service.as_ref()) != generation {
                return;
            }
            let chunk = match tokio::time::timeout(CHUNK_TIMEOUT, response.chunk()).await {
                Ok(Ok(Some(bytes))) => bytes,
                Ok(Ok(None)) => break,
                Ok(Err(error)) => {
                    super::update_status(
                        &service,
                        NtfyStatus::Error,
                        Some(format!("ntfy 流读取失败：{error}")),
                    );
                    break;
                }
                Err(_) => continue,
            };
            buffer.extend_from_slice(&chunk);
            while let Some(index) = buffer.iter().position(|byte| *byte == b'\n') {
                let line_bytes: Vec<u8> = buffer.drain(..=index).collect();
                let line = String::from_utf8_lossy(&line_bytes);
                let line = line.trim_end();
                process_line(&service, &server, &topic, line, &mut data_lines);
            }
        }
        super::update_status(
            &service,
            NtfyStatus::Connecting,
            Some("ntfy 连接断开，正在重连".to_string()),
        );
        tokio::time::sleep(backoff).await;
        backoff = min(backoff * 2, MAX_BACKOFF);
    }
}

fn build_client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .user_agent(concat!("fly-island-ntfy/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|error| format!("无法创建 ntfy 客户端：{error}"))
}

fn process_line(
    service: &Arc<NtfyService>,
    server: &str,
    topic: &str,
    line: &str,
    data_lines: &mut Vec<String>,
) {
    if line.is_empty() {
        let payload = data_lines.join("\n");
        data_lines.clear();
        if payload.trim().is_empty() {
            return;
        }
        if let Some(message) = parse_message(&payload, topic, server) {
            super::push_message(service, message);
        }
        return;
    }
    if line.starts_with(':') {
        return;
    }
    if let Some(rest) = line.strip_prefix("data:") {
        data_lines.push(rest.trim_start().to_string());
    }
}

fn parse_message(payload: &str, topic_fallback: &str, server: &str) -> Option<NtfyMessage> {
    let value: Value = serde_json::from_str(payload).ok()?;
    let event = value
        .get("event")
        .and_then(|value| value.as_str())
        .unwrap_or("message");
    if event != "message" {
        return None;
    }
    let id = value
        .get("id")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if id.is_empty() {
        return None;
    }
    let topic = value
        .get("topic")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
        .unwrap_or_else(|| topic_fallback.to_string());
    let title = value
        .get("title")
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|title| !title.is_empty())
        .unwrap_or_else(|| topic.clone());
    let body = value
        .get("message")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    let priority = value
        .get("priority")
        .and_then(|value| value.as_i64())
        .unwrap_or(3)
        .clamp(1, 5) as i32;
    let created_at = value
        .get("time")
        .and_then(|value| value.as_i64())
        .unwrap_or_else(now_seconds);
    Some(NtfyMessage {
        id,
        topic,
        title,
        body,
        priority,
        created_at,
        server: server.to_string(),
    })
}

fn now_seconds() -> i64 {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(duration) => duration.as_secs() as i64,
        Err(_) => 0,
    }
}
