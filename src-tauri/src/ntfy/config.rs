use serde::{Deserialize, Serialize};
use std::{collections::HashSet, fs, path::Path};

const DEFAULT_SERVER: &str = "https://ntfy.ccnas.top:47777";

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub(super) struct NtfyConfig {
    pub(super) enabled: bool,
    pub(super) server: String,
    pub(super) topics: Vec<String>,
    pub(super) token: Option<String>,
}

impl Default for NtfyConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            server: DEFAULT_SERVER.to_string(),
            topics: vec![
                "chat-bridge-huang".to_string(),
                "suricata-alert".to_string(),
                "hfish-alert".to_string(),
                "monitor-10001".to_string(),
            ],
            token: None,
        }
    }
}

pub(super) fn load(path: &Path) -> NtfyConfig {
    let parsed = fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<NtfyConfig>(&text).ok());
    match parsed {
        Some(config) => match normalize(config.server, config.topics, config.token, config.enabled) {
            Ok(config) => config,
            Err(_) => NtfyConfig::default(),
        },
        None => NtfyConfig::default(),
    }
}

pub(super) fn save(path: &Path, config: &NtfyConfig) -> Result<(), String> {
    let json = serde_json::to_string_pretty(config)
        .map_err(|error| format!("无法序列化 ntfy 配置：{error}"))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("无法创建 ntfy 配置目录：{error}"))?;
    }
    fs::write(path, json).map_err(|error| format!("无法写入 ntfy 配置：{error}"))
}

pub(super) fn normalize(
    server: String,
    topics: Vec<String>,
    token: Option<String>,
    enabled: bool,
) -> Result<NtfyConfig, String> {
    let server = server.trim().trim_end_matches('/').to_string();
    if !server.starts_with("http://") && !server.starts_with("https://") {
        return Err("ntfy 服务器地址必须以 http:// 或 https:// 开头。".to_string());
    }
    let mut seen = HashSet::new();
    let topics: Vec<String> = topics
        .into_iter()
        .flat_map(|entry| {
            entry
                .split(|character: char| {
                    character == ',' || character == '\n' || character == '\r'
                })
                .map(|part| part.to_string())
                .collect::<Vec<String>>()
        })
        .map(|topic| topic.trim().to_string())
        .filter(|topic| !topic.is_empty())
        .filter(|topic| {
            !topic.contains('/')
                && !topic.contains('?')
                && !topic.contains('#')
                && !topic.contains(' ')
        })
        .filter(|topic| seen.insert(topic.clone()))
        .collect();
    if topics.is_empty() {
        return Err("至少填写一个 ntfy topic。".to_string());
    }
    let token = token
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let mut config = NtfyConfig::default();
    config.enabled = enabled;
    config.server = server;
    config.topics = topics;
    config.token = token;
    Ok(config)
}
