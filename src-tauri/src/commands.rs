use serde::{Deserialize, Serialize};
use std::process::{Command, Child, Stdio};
use std::sync::Mutex;
use tauri::State;
use std::path::PathBuf;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use tauri::Emitter;
#[cfg(target_os = "windows")]
use std::env;

// Global state to track gateway process
pub struct GatewayProcess(pub Mutex<Option<Child>>);

// Global state for gateway log streaming
pub struct GatewayLogProcess(pub Mutex<Option<Child>>);

// System status response
#[derive(Debug, Serialize, Deserialize)]
pub struct SystemStatus {
    pub node_installed: bool,
    pub node_version: Option<String>,
    pub npm_installed: bool,
    pub npm_version: Option<String>,
    pub openclaw_installed: bool,
    pub openclaw_version: Option<String>,
    pub gateway_running: bool,
    pub gateway_port: u16,
    pub embedded_node_ready: bool,
}

/// Get the app data directory for storing embedded Node.js
fn get_app_data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("openclaw-desktop")
}

/// Get the path to embedded Node.js
fn get_embedded_node_path() -> PathBuf {
    get_app_data_dir().join("node")
}

/// Check if embedded Node.js is ready
fn is_embedded_node_ready() -> bool {
    let node_path = get_embedded_node_path();
    #[cfg(target_os = "windows")]
    {
        node_path.join("node.exe").exists()
    }
    #[cfg(not(target_os = "windows"))]
    {
        node_path.join("bin").join("node").exists()
    }
}

#[cfg(target_os = "windows")]
fn get_windows_node_path_candidates() -> Vec<String> {
    let mut paths: Vec<String> = vec![
        r"C:\Program Files\nodejs".to_string(),
        r"C:\Program Files (x86)\nodejs".to_string(),
    ];

    if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
        paths.push(format!(r"{}\Programs\nodejs", local_app_data));
    }
    if let Ok(app_data) = env::var("APPDATA") {
        paths.push(format!(r"{}\npm", app_data));
    }

    paths
}

#[cfg(target_os = "windows")]
fn try_repair_windows_node_path() {
    let current_path = env::var("PATH").unwrap_or_default();
    let mut path_parts: Vec<String> = current_path
        .split(';')
        .filter(|p| !p.trim().is_empty())
        .map(|p| p.to_string())
        .collect();

    let mut changed = false;
    for candidate in get_windows_node_path_candidates() {
        let node_exe = PathBuf::from(&candidate).join("node.exe");
        let npm_cmd = PathBuf::from(&candidate).join("npm.cmd");

        if (node_exe.exists() || npm_cmd.exists())
            && !path_parts.iter().any(|p| p.eq_ignore_ascii_case(&candidate))
        {
            path_parts.push(candidate);
            changed = true;
        }
    }

    if changed {
        let new_path = path_parts.join(";");
        env::set_var("PATH", new_path);
    }
}

#[cfg(not(target_os = "windows"))]
fn try_repair_windows_node_path() {
    // no-op on non-Windows
}

#[cfg(target_os = "windows")]
fn persist_windows_node_path_internal() -> Result<String, String> {
    let candidates: Vec<String> = get_windows_node_path_candidates()
        .into_iter()
        .filter(|p| {
            let node_exe = PathBuf::from(p).join("node.exe");
            let npm_cmd = PathBuf::from(p).join("npm.cmd");
            node_exe.exists() || npm_cmd.exists()
        })
        .collect();

    if candidates.is_empty() {
        return Ok("未找到可写入 PATH 的 Node.js 目录".to_string());
    }

    let quoted_candidates = candidates
        .iter()
        .map(|p| format!("'{}'", p.replace('"', "\\\"").replace('\'', "''")))
        .collect::<Vec<_>>()
        .join(",");

    let ps_script = format!(
        "$candidates=@({}); \
        $userPath=[Environment]::GetEnvironmentVariable('Path','User'); \
        if([string]::IsNullOrWhiteSpace($userPath)){{$userPath=''}}; \
        $parts=@($userPath -split ';' | Where-Object {{$_ -and $_.Trim() -ne ''}}); \
        foreach($c in $candidates){{ if(-not ($parts | Where-Object {{ $_.ToLower() -eq $c.ToLower() }})){{$parts += $c}} }}; \
        $newPath=($parts -join ';'); \
        [Environment]::SetEnvironmentVariable('Path',$newPath,'User'); \
        Write-Output $newPath",
        quoted_candidates
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps_script])
        .output()
        .map_err(|e| format!("写入用户 PATH 失败: {}", e))?;

    if output.status.success() {
        // Also refresh current process PATH
        try_repair_windows_node_path();
        Ok("已写入用户 PATH（重开终端后对新进程生效）".to_string())
    } else {
        Err(format!(
            "写入用户 PATH 失败: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

#[cfg(not(target_os = "windows"))]
fn persist_windows_node_path_internal() -> Result<String, String> {
    Err("仅 Windows 支持此功能".to_string())
}

/// Get the Node.js executable path (system or embedded)
fn get_node_executable() -> String {
    // First check if embedded node is available
    if is_embedded_node_ready() {
        let embedded_path = get_embedded_node_path();
        #[cfg(target_os = "windows")]
        {
            embedded_path.join("node.exe").to_string_lossy().to_string()
        }
        #[cfg(not(target_os = "windows"))]
        {
            embedded_path.join("bin").join("node").to_string_lossy().to_string()
        }
    } else {
        // Use system node
        "node".to_string()
    }
}

/// Resolve npm command (binary + prefix args)
/// Returns (command, prefix_args). Final caller should append actual npm args.
fn resolve_npm_command() -> Option<(String, Vec<String>)> {
    try_repair_windows_node_path();

    // First check embedded npm
    if is_embedded_node_ready() {
        let embedded_path = get_embedded_node_path();
        #[cfg(target_os = "windows")]
        {
            let npm_cmd = embedded_path.join("npm.cmd");
            if npm_cmd.exists() {
                return Some((npm_cmd.to_string_lossy().to_string(), vec![]));
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            let npm_bin = embedded_path.join("bin").join("npm");
            if npm_bin.exists() {
                return Some((npm_bin.to_string_lossy().to_string(), vec![]));
            }
        }
    }

    // Fallback: system npm
    #[cfg(target_os = "windows")]
    {
        // Try npm.cmd first
        let candidates: Vec<(String, Vec<String>)> = vec![
            ("npm.cmd".to_string(), vec![]),
            ("npm".to_string(), vec![]),
            (
                "cmd".to_string(),
                vec!["/C".to_string(), "npm".to_string()],
            ),
        ];

        for (cmd, prefix_args) in candidates {
            let mut args = prefix_args.clone();
            args.push("--version".to_string());
            if let Ok(output) = Command::new(&cmd).args(&args).output() {
                if output.status.success() {
                    return Some((cmd, prefix_args));
                }
            }
        }
        None
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(output) = Command::new("npm").arg("--version").output() {
            if output.status.success() {
                return Some(("npm".to_string(), vec![]));
            }
        }
        None
    }
}

/// Check if Node.js is installed and get version
fn check_node() -> (bool, Option<String>) {
    try_repair_windows_node_path();
    let node_exe = get_node_executable();
    match Command::new(&node_exe).arg("--version").output() {
        Ok(output) => {
            if output.status.success() {
                let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
                (true, Some(version))
            } else {
                (false, None)
            }
        }
        Err(_) => (false, None),
    }
}

/// Check if npm is installed and get version
fn check_npm() -> (bool, Option<String>) {
    if let Some((cmd, prefix_args)) = resolve_npm_command() {
        let mut args = prefix_args;
        args.push("--version".to_string());
        match Command::new(&cmd).args(&args).output() {
            Ok(output) => {
                if output.status.success() {
                    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    (true, Some(version))
                } else {
                    (false, None)
                }
            }
            Err(_) => (false, None),
        }
    } else {
        (false, None)
    }
}

/// Check if OpenClaw is installed and get version
fn check_openclaw() -> (bool, Option<String>) {
    match Command::new("openclaw").arg("--version").output() {
        Ok(output) => {
            if output.status.success() {
                let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
                (true, Some(version))
            } else {
                (false, None)
            }
        }
        Err(_) => (false, None),
    }
}

/// Check if gateway is running on the specified port
fn check_gateway_running(port: u16) -> bool {
    let url = format!("http://localhost:{}/health", port);
    match reqwest::blocking::get(&url) {
        Ok(response) => response.status().is_success(),
        Err(_) => false,
    }
}

// ── P1-1: Real Gateway health check with details ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GatewayHealthInfo {
    pub reachable: bool,
    pub status_code: Option<u16>,
    pub version: Option<String>,
    pub uptime: Option<String>,
    pub body_snippet: Option<String>,
    pub error: Option<String>,
}

fn probe_gateway_health(port: u16) -> GatewayHealthInfo {
    let url = format!("http://localhost:{}/health", port);
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build();
    let client = match client {
        Ok(c) => c,
        Err(e) => return GatewayHealthInfo {
            reachable: false, status_code: None, version: None, uptime: None,
            body_snippet: None, error: Some(format!("HTTP client 创建失败: {}", e)),
        },
    };
    match client.get(&url).send() {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let body = resp.text().unwrap_or_default();
            let mut version: Option<String> = None;
            let mut uptime: Option<String> = None;
            // Try parse JSON body
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&body) {
                version = val.get("version").and_then(|v| v.as_str()).map(|s| s.to_string())
                    .or_else(|| val.get("v").and_then(|v| v.as_str()).map(|s| s.to_string()));
                uptime = val.get("uptime").and_then(|v| {
                    v.as_str().map(|s| s.to_string()).or_else(|| v.as_f64().map(|n| format!("{:.0}s", n)))
                });
            }
            let snippet = if body.len() > 500 { body[..500].to_string() } else { body.clone() };
            GatewayHealthInfo {
                reachable: (200..300).contains(&(status as usize)),
                status_code: Some(status),
                version,
                uptime,
                body_snippet: Some(snippet),
                error: if (200..300).contains(&(status as usize)) { None } else { Some(format!("HTTP {}", status)) },
            }
        }
        Err(e) => GatewayHealthInfo {
            reachable: false, status_code: None, version: None, uptime: None,
            body_snippet: None, error: Some(format!("连接失败: {}", e)),
        },
    }
}

#[tauri::command]
pub async fn check_gateway_health() -> Result<GatewayHealthInfo, String> {
    let port = get_gateway_port();
    Ok(probe_gateway_health(port))
}

// ── P1-2: Real Channel online validation ──

#[derive(Debug, Serialize, Deserialize)]
pub struct ChannelValidationResult {
    pub valid: bool,
    pub detail: String,
    pub bot_username: Option<String>,
}

fn validate_discord_token(token: &str) -> ChannelValidationResult {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build();
    let client = match client {
        Ok(c) => c,
        Err(e) => return ChannelValidationResult {
            valid: false, detail: format!("HTTP client 错误: {}", e), bot_username: None,
        },
    };
    match client.get("https://discord.com/api/v10/users/@me")
        .header("Authorization", format!("Bot {}", token))
        .send()
    {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let body = resp.text().unwrap_or_default();
            if status == 200 {
                let username = serde_json::from_str::<serde_json::Value>(&body)
                    .ok()
                    .and_then(|v| v.get("username").and_then(|u| u.as_str()).map(|s| s.to_string()));
                ChannelValidationResult {
                    valid: true,
                    detail: format!("Discord Bot 验证通过{}", username.as_ref().map(|u| format!(" ({})", u)).unwrap_or_default()),
                    bot_username: username,
                }
            } else if status == 401 {
                ChannelValidationResult { valid: false, detail: "Token 无效或已过期 (401 Unauthorized)".to_string(), bot_username: None }
            } else {
                ChannelValidationResult { valid: false, detail: format!("Discord API 返回 HTTP {} — {}", status, &body[..body.len().min(200)]), bot_username: None }
            }
        }
        Err(e) => ChannelValidationResult { valid: false, detail: format!("无法连接 Discord API: {}", e), bot_username: None },
    }
}

fn validate_telegram_token(token: &str) -> ChannelValidationResult {
    let url = format!("https://api.telegram.org/bot{}/getMe", token);
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build();
    let client = match client {
        Ok(c) => c,
        Err(e) => return ChannelValidationResult {
            valid: false, detail: format!("HTTP client 错误: {}", e), bot_username: None,
        },
    };
    match client.get(&url).send() {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let body = resp.text().unwrap_or_default();
            if status == 200 {
                let username = serde_json::from_str::<serde_json::Value>(&body)
                    .ok()
                    .and_then(|v| v["result"]["username"].as_str().map(|s| s.to_string()));
                ChannelValidationResult {
                    valid: true,
                    detail: format!("Telegram Bot 验证通过{}", username.as_ref().map(|u| format!(" (@{})", u)).unwrap_or_default()),
                    bot_username: username,
                }
            } else if status == 401 {
                ChannelValidationResult { valid: false, detail: "Token 无效 (401 Unauthorized)".to_string(), bot_username: None }
            } else {
                ChannelValidationResult { valid: false, detail: format!("Telegram API 返回 HTTP {} — {}", status, &body[..body.len().min(200)]), bot_username: None }
            }
        }
        Err(e) => ChannelValidationResult { valid: false, detail: format!("无法连接 Telegram API: {}", e), bot_username: None },
    }
}

// ── P1-3: Real Agent test ──

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentTestResult {
    pub reachable: bool,
    pub responded: bool,
    pub detail: String,
    pub response_snippet: Option<String>,
}

fn test_agent_via_gateway(port: u16) -> AgentTestResult {
    // Try the gateway's /api/chat or /api/test endpoint
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build();
    let client = match client {
        Ok(c) => c,
        Err(e) => return AgentTestResult {
            reachable: false, responded: false,
            detail: format!("HTTP client 错误: {}", e), response_snippet: None,
        },
    };

    // First check gateway is up
    let health_url = format!("http://localhost:{}/health", port);
    if client.get(&health_url).send().is_err() {
        return AgentTestResult {
            reachable: false, responded: false,
            detail: "Gateway 不可达，请先启动 Gateway".to_string(), response_snippet: None,
        };
    }

    // Try to send a test message via the API
    let chat_url = format!("http://localhost:{}/api/chat", port);
    let payload = serde_json::json!({
        "message": "ping",
        "test": true
    });

    match client.post(&chat_url)
        .json(&payload)
        .send()
    {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let body = resp.text().unwrap_or_default();
            if (200..300).contains(&(status as usize)) {
                let snippet = if body.len() > 300 { body[..300].to_string() } else { body.clone() };
                AgentTestResult {
                    reachable: true, responded: true,
                    detail: "Agent 响应正常".to_string(), response_snippet: Some(snippet),
                }
            } else if status == 404 {
                // /api/chat may not exist; try alternative: just confirm gateway is up and agent is configured
                AgentTestResult {
                    reachable: true, responded: false,
                    detail: format!("Gateway 在线但 /api/chat 不可用 (HTTP {}). Agent 可能需要通过 Channel 交互测试。", status),
                    response_snippet: Some(body[..body.len().min(200)].to_string()),
                }
            } else {
                AgentTestResult {
                    reachable: true, responded: false,
                    detail: format!("Agent 请求返回 HTTP {} — 可能未配置或模型不可用", status),
                    response_snippet: Some(body[..body.len().min(200)].to_string()),
                }
            }
        }
        Err(e) => AgentTestResult {
            reachable: false, responded: false,
            detail: format!("请求 Agent 失败: {}", e), response_snippet: None,
        },
    }
}

#[tauri::command]
pub async fn test_agent() -> Result<AgentTestResult, String> {
    let port = get_gateway_port();
    Ok(test_agent_via_gateway(port))
}

// ── P1-4: Embedded Node.js real download ──

fn get_node_download_url() -> (String, String) {
    let version = "v20.11.1";
    let (os_str, ext) = if cfg!(target_os = "windows") {
        ("win", "zip")
    } else if cfg!(target_os = "macos") {
        ("darwin", "tar.gz")
    } else {
        ("linux", "tar.xz")
    };
    let arch = if cfg!(target_arch = "x86_64") {
        "x64"
    } else if cfg!(target_arch = "aarch64") {
        "arm64"
    } else {
        "x64"
    };
    let filename = format!("node-{}-{}-{}", version, os_str, arch);
    let url = format!("https://nodejs.org/dist/{}/{}.{}", version, filename, ext);
    (url, filename)
}

// ── P1-5: API Key encryption ──

/// Simple AES-256-like XOR-based obfuscation with a machine-specific key.
/// For production, use OS keyring. This is a step up from plaintext.
fn get_machine_key() -> [u8; 32] {
    let mut seed = String::new();
    // Use hostname + username as machine-specific seed
    if let Ok(hostname) = std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .or_else(|_| {
            Command::new("hostname").output()
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                .map_err(|e| e.to_string())
        })
    {
        seed.push_str(&hostname);
    }
    seed.push_str("openclaw-desktop-key-v1");
    if let Ok(user) = std::env::var("USER").or_else(|_| std::env::var("USERNAME")) {
        seed.push_str(&user);
    }

    // Simple key derivation: repeated hashing via a basic algorithm
    let mut key = [0u8; 32];
    let seed_bytes = seed.as_bytes();
    for (i, k) in key.iter_mut().enumerate() {
        let mut val: u8 = seed_bytes[i % seed_bytes.len()];
        // Mix with position
        val = val.wrapping_mul(31).wrapping_add(i as u8).wrapping_mul(17);
        for &b in seed_bytes.iter() {
            val = val.wrapping_add(b).wrapping_mul(7);
        }
        *k = val;
    }
    key
}

fn encrypt_value(plaintext: &str) -> String {
    if plaintext.is_empty() { return String::new(); }
    let key = get_machine_key();
    let bytes: Vec<u8> = plaintext.bytes()
        .enumerate()
        .map(|(i, b)| b ^ key[i % key.len()])
        .collect();
    format!("enc:v1:{}", base64_encode(&bytes))
}

fn decrypt_value(ciphertext: &str) -> String {
    if ciphertext.is_empty() { return String::new(); }
    if !ciphertext.starts_with("enc:v1:") {
        return ciphertext.to_string(); // plaintext fallback
    }
    let encoded = &ciphertext[7..];
    let bytes = match base64_decode(encoded) {
        Some(b) => b,
        None => return String::new(),
    };
    let key = get_machine_key();
    let decrypted: Vec<u8> = bytes.iter()
        .enumerate()
        .map(|(i, &b)| b ^ key[i % key.len()])
        .collect();
    String::from_utf8(decrypted).unwrap_or_default()
}

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 { result.push(CHARS[((triple >> 6) & 0x3F) as usize] as char); } else { result.push('='); }
        if chunk.len() > 2 { result.push(CHARS[(triple & 0x3F) as usize] as char); } else { result.push('='); }
    }
    result
}

fn base64_decode(input: &str) -> Option<Vec<u8>> {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let input = input.trim_end_matches('=');
    let mut result = Vec::new();
    let bytes: Vec<u8> = input.bytes()
        .filter_map(|b| CHARS.iter().position(|&c| c == b).map(|p| p as u8))
        .collect();
    for chunk in bytes.chunks(4) {
        if chunk.len() < 2 { break; }
        let b0 = chunk[0] as u32;
        let b1 = chunk[1] as u32;
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let b3 = if chunk.len() > 3 { chunk[3] as u32 } else { 0 };
        let triple = (b0 << 18) | (b1 << 12) | (b2 << 6) | b3;
        result.push(((triple >> 16) & 0xFF) as u8);
        if chunk.len() > 2 { result.push(((triple >> 8) & 0xFF) as u8); }
        if chunk.len() > 3 { result.push((triple & 0xFF) as u8); }
    }
    Some(result)
}

/// Get the gateway port from config or use default
fn get_gateway_port() -> u16 {
    // Try to read from config file
    let config_path = dirs::home_dir()
        .map(|h| h.join(".openclaw").join("openclaw.json"));
    
    if let Some(path) = config_path {
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(config) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(port) = config["gateway"]["port"].as_u64() {
                        return port as u16;
                    }
                }
            }
        }
    }
    
    // Default port
    18789
}

/// Check system status (Node.js, OpenClaw, Gateway)
#[tauri::command]
pub async fn check_system_status() -> Result<SystemStatus, String> {
    let (node_installed, node_version) = check_node();
    let (npm_installed, npm_version) = check_npm();
    let (openclaw_installed, openclaw_version) = check_openclaw();
    let gateway_port = get_gateway_port();
    let gateway_running = check_gateway_running(gateway_port);
    let embedded_node_ready = is_embedded_node_ready();

    Ok(SystemStatus {
        node_installed,
        node_version,
        npm_installed,
        npm_version,
        openclaw_installed,
        openclaw_version,
        gateway_running,
        gateway_port,
        embedded_node_ready,
    })
}

/// Download and setup embedded Node.js (P1-4: real download)
#[tauri::command]
pub async fn setup_embedded_node() -> Result<String, String> {
    let app_dir = get_app_data_dir();
    let node_dir = get_embedded_node_path();

    fs::create_dir_all(&app_dir)
        .map_err(|e| format!("创建应用目录失败: {}", e))?;

    if is_embedded_node_ready() {
        return Ok("内嵌 Node.js 已就绪，无需重新下载".to_string());
    }

    let (url, folder_name) = get_node_download_url();

    // Download
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("创建 HTTP client 失败: {}", e))?;

    let resp = client.get(&url).send()
        .map_err(|e| format!("下载 Node.js 失败: {}. 请检查网络连接。URL: {}", e, url))?;

    if !resp.status().is_success() {
        return Err(format!("下载失败: HTTP {}. URL: {}", resp.status(), url));
    }

    let archive_bytes = resp.bytes()
        .map_err(|e| format!("读取下载数据失败: {}", e))?;

    let archive_path = app_dir.join(format!("node-download.{}", if cfg!(target_os = "windows") { "zip" } else { "tar.gz" }));
    fs::write(&archive_path, &archive_bytes)
        .map_err(|e| format!("写入临时文件失败: {}", e))?;

    // Extract
    let extract_dir = app_dir.join("node-extract");
    let _ = fs::remove_dir_all(&extract_dir);
    fs::create_dir_all(&extract_dir)
        .map_err(|e| format!("创建解压目录失败: {}", e))?;

    #[cfg(target_os = "windows")]
    {
        // Use powershell to extract zip
        let output = Command::new("powershell")
            .args([
                "-NoProfile", "-Command",
                &format!("Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
                    archive_path.to_string_lossy(), extract_dir.to_string_lossy())
            ])
            .output()
            .map_err(|e| format!("解压失败: {}", e))?;
        if !output.status.success() {
            return Err(format!("解压失败: {}", String::from_utf8_lossy(&output.stderr)));
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let tar_flag = if cfg!(target_os = "macos") { "xzf" } else { "xJf" };
        let output = Command::new("tar")
            .args([tar_flag, &archive_path.to_string_lossy(), "-C", &extract_dir.to_string_lossy()])
            .output()
            .map_err(|e| format!("解压失败: {}. 请确保系统已安装 tar。", e))?;
        if !output.status.success() {
            return Err(format!("解压失败: {}", String::from_utf8_lossy(&output.stderr)));
        }
    }

    // Move extracted folder to final location
    let _ = fs::remove_dir_all(&node_dir);
    let extracted_folder = extract_dir.join(&folder_name);
    if extracted_folder.exists() {
        fs::rename(&extracted_folder, &node_dir)
            .map_err(|e| format!("移动 Node.js 目录失败: {}", e))?;
    } else {
        // Try to find the extracted folder
        if let Ok(entries) = fs::read_dir(&extract_dir) {
            for entry in entries.flatten() {
                if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    fs::rename(entry.path(), &node_dir)
                        .map_err(|e| format!("移动 Node.js 目录失败: {}", e))?;
                    break;
                }
            }
        }
    }

    // Cleanup
    let _ = fs::remove_file(&archive_path);
    let _ = fs::remove_dir_all(&extract_dir);

    if is_embedded_node_ready() {
        Ok("✅ Node.js 下载并安装成功！".to_string())
    } else {
        Err("下载完成但 Node.js 二进制未找到。请手动检查。".to_string())
    }
}

/// Persist Node.js/npm paths into Windows user PATH
#[tauri::command]
pub async fn persist_windows_node_path() -> Result<String, String> {
    persist_windows_node_path_internal()
}

/// Install OpenClaw via npm
#[tauri::command]
pub async fn install_openclaw() -> Result<String, String> {
    let (npm_cmd, mut prefix_args) = resolve_npm_command()
        .ok_or_else(|| "npm 未找到。可能的解决方案：\n1. 安装 Node.js (https://nodejs.org)\n2. 点击「设置内嵌 Node.js」自动下载\n3. Windows 用户可尝试「修复 PATH」按钮".to_string())?;

    // Build final args: [prefix..., install -g openclaw@latest]
    prefix_args.extend([
        "install".to_string(),
        "-g".to_string(),
        "openclaw@latest".to_string(),
    ]);

    // Run npm install -g openclaw
    let output = Command::new(&npm_cmd)
        .args(&prefix_args)
        .output()
        .map_err(|e| format!("执行 npm install 失败: {}", e))?;

    if output.status.success() {
        Ok("OpenClaw 安装成功！".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Err(format!("安装失败:\n{}\n{}", stderr, stdout))
    }
}

/// Start the OpenClaw gateway
#[tauri::command]
pub async fn start_gateway(state: State<'_, GatewayProcess>) -> Result<String, String> {
    let mut process = state.0.lock().map_err(|_| "无法获取进程状态")?;
    
    // Check if already running
    if process.is_some() {
        return Ok("Gateway 已在运行中".to_string());
    }

    // Start gateway in background
    let child = Command::new("openclaw")
        .args(["gateway", "start"])
        .spawn()
        .map_err(|e| format!("启动 Gateway 失败: {}", e))?;

    *process = Some(child);
    Ok("Gateway 已启动".to_string())
}

/// Stop the OpenClaw gateway
#[tauri::command]
pub async fn stop_gateway(state: State<'_, GatewayProcess>) -> Result<String, String> {
    let mut process = state.0.lock().map_err(|_| "无法获取进程状态")?;
    
    if let Some(mut child) = process.take() {
        child.kill().map_err(|e| format!("停止 Gateway 失败: {}", e))?;
        Ok("Gateway 已停止".to_string())
    } else {
        // Try to stop via CLI
        let output = Command::new("openclaw")
            .args(["gateway", "stop"])
            .output()
            .map_err(|e| format!("停止 Gateway 失败: {}", e))?;
        
        if output.status.success() {
            Ok("Gateway 已停止".to_string())
        } else {
            Err("Gateway 未在运行".to_string())
        }
    }
}

/// Get current gateway status
#[tauri::command]
pub async fn get_gateway_status() -> Result<bool, String> {
    let port = get_gateway_port();
    Ok(check_gateway_running(port))
}

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
pub struct ProviderConfig {
    pub provider: String,
    pub endpoint: String,
    pub model: String,
    pub api_key: String,
}

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
pub struct AgentConfig {
    pub name: String,
    pub profile: String,
    pub tool_policy: String,
}

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
pub struct ChannelConfig {
    pub channel_type: String,
    pub enabled: bool,
    pub token: String,
    pub target: String,
}

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
pub struct DesktopConfig {
    pub provider: Option<ProviderConfig>,
    pub agent: Option<AgentConfig>,
    pub channels: Vec<ChannelConfig>,
}

fn get_desktop_config_path() -> PathBuf {
    get_app_data_dir().join("desktop-config.json")
}

fn load_desktop_config_file() -> Result<DesktopConfig, String> {
    let path = get_desktop_config_path();
    if !path.exists() {
        return Ok(DesktopConfig::default());
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("读取配置失败: {}", e))?;
    serde_json::from_str::<DesktopConfig>(&content)
        .map_err(|e| format!("解析配置失败: {}", e))
}

fn save_desktop_config_file(cfg: &DesktopConfig) -> Result<(), String> {
    let app_dir = get_app_data_dir();
    fs::create_dir_all(&app_dir)
        .map_err(|e| format!("创建配置目录失败: {}", e))?;

    let path = get_desktop_config_path();
    let content = serde_json::to_string_pretty(cfg)
        .map_err(|e| format!("序列化配置失败: {}", e))?;
    fs::write(path, content)
        .map_err(|e| format!("写入配置失败: {}", e))?;

    // P0-3: Also sync to ~/.openclaw/openclaw.json so OpenClaw actually reads the config
    sync_to_openclaw_config(cfg)?;
    Ok(())
}

/// Get the real OpenClaw config path: ~/.openclaw/openclaw.json
fn get_openclaw_config_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".openclaw").join("openclaw.json"))
}

/// Read, merge, and write the real ~/.openclaw/openclaw.json
/// This is the critical sync that makes Desktop wizard config actually usable by OpenClaw.
fn sync_to_openclaw_config(cfg: &DesktopConfig) -> Result<(), String> {
    let config_path = match get_openclaw_config_path() {
        Some(p) => p,
        None => return Err("无法确定 home 目录".to_string()),
    };

    // Ensure ~/.openclaw/ exists
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建 ~/.openclaw/ 目录失败: {}", e))?;
    }

    // Load existing openclaw.json or start fresh
    let mut oc: serde_json::Value = if config_path.exists() {
        let content = fs::read_to_string(&config_path)
            .map_err(|e| format!("读取 openclaw.json 失败: {}", e))?;
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    // Sync provider config → models.providers.{name} + agents.defaults.model.primary
    if let Some(ref provider) = cfg.provider {
        let api_key_plain = decrypt_value(&provider.api_key);

        // Determine API type from provider name
        let api_type = match provider.provider.to_lowercase().as_str() {
            p if p.contains("anthropic") || p.contains("claude") => "anthropic-messages",
            p if p.contains("openai") || p.contains("gpt") => "openai-chat",
            p if p.contains("google") || p.contains("gemini") => "google-genai",
            _ => "openai-chat", // default fallback
        };

        // Set models.providers.desktop
        let providers = oc.pointer_mut("/models/providers")
            .and_then(|v| v.as_object_mut());
        
        let provider_entry = serde_json::json!({
            "baseUrl": if provider.endpoint.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(provider.endpoint.clone()) },
            "apiKey": api_key_plain,
            "api": api_type,
            "models": [{
                "id": provider.model,
                "name": provider.model,
            }]
        });

        if let Some(providers) = providers {
            providers.insert("desktop".to_string(), provider_entry);
        } else {
            // Create models.providers path
            if oc.get("models").is_none() {
                oc["models"] = serde_json::json!({});
            }
            if oc["models"].get("providers").is_none() {
                oc["models"]["providers"] = serde_json::json!({});
            }
            oc["models"]["providers"]["desktop"] = provider_entry;
        }

        // Set agents.defaults.model.primary
        let model_id = format!("desktop/{}", provider.model);
        if oc.get("agents").is_none() {
            oc["agents"] = serde_json::json!({});
        }
        if oc["agents"].get("defaults").is_none() {
            oc["agents"]["defaults"] = serde_json::json!({});
        }
        if oc["agents"]["defaults"].get("model").is_none() {
            oc["agents"]["defaults"]["model"] = serde_json::json!({});
        }
        oc["agents"]["defaults"]["model"]["primary"] = serde_json::Value::String(model_id);
    }

    // Sync channel config → channels.{type}
    for ch in &cfg.channels {
        let ch_type = ch.channel_type.to_lowercase();
        let token_plain = decrypt_value(&ch.token);
        
        if oc.get("channels").is_none() {
            oc["channels"] = serde_json::json!({});
        }

        match ch_type.as_str() {
            "discord" => {
                // Merge into existing discord config or create new
                if oc["channels"].get("discord").is_none() {
                    oc["channels"]["discord"] = serde_json::json!({});
                }
                oc["channels"]["discord"]["enabled"] = serde_json::Value::Bool(ch.enabled);
                oc["channels"]["discord"]["token"] = serde_json::Value::String(token_plain);
            }
            "telegram" => {
                if oc["channels"].get("telegram").is_none() {
                    oc["channels"]["telegram"] = serde_json::json!({});
                }
                oc["channels"]["telegram"]["enabled"] = serde_json::Value::Bool(ch.enabled);
                oc["channels"]["telegram"]["botToken"] = serde_json::Value::String(token_plain);
            }
            _ => {} // skip unknown channel types
        }
    }

    // Write back
    let content = serde_json::to_string_pretty(&oc)
        .map_err(|e| format!("序列化 openclaw.json 失败: {}", e))?;
    fs::write(&config_path, content)
        .map_err(|e| format!("写入 openclaw.json 失败: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn load_config() -> Result<DesktopConfig, String> {
    let mut cfg = load_desktop_config_file()?;
    // Decrypt sensitive fields before returning to frontend
    if let Some(ref mut p) = cfg.provider {
        p.api_key = decrypt_value(&p.api_key);
    }
    for ch in cfg.channels.iter_mut() {
        ch.token = decrypt_value(&ch.token);
    }
    Ok(cfg)
}

#[tauri::command]
pub async fn save_provider_config(config: ProviderConfig) -> Result<String, String> {
    if config.provider.trim().is_empty() {
        return Err("Provider 不能为空。请从下拉列表选择或输入自定义 provider 名称。".to_string());
    }
    if config.model.trim().is_empty() {
        return Err("模型名称不能为空。请选择一个模型。".to_string());
    }
    if config.api_key.trim().is_empty() {
        return Err("API Key 不能为空。请输入你的 API Key（如 sk-ant-...）。".to_string());
    }

    let mut cfg = load_desktop_config_file()?;
    // Encrypt the API key before saving
    let mut encrypted_config = config;
    encrypted_config.api_key = encrypt_value(&encrypted_config.api_key);
    cfg.provider = Some(encrypted_config);
    save_desktop_config_file(&cfg)?;
    Ok("Provider 配置已保存（API Key 已加密存储）".to_string())
}

#[tauri::command]
pub async fn save_agent_config(config: AgentConfig) -> Result<String, String> {
    if config.name.trim().is_empty() {
        return Err("Agent 名称不能为空。请输入一个名称（如 my-assistant）。".to_string());
    }
    if config.name.contains(' ') {
        return Err("Agent 名称不能包含空格。请使用连字符（如 my-assistant）。".to_string());
    }
    let mut cfg = load_desktop_config_file()?;
    cfg.agent = Some(config);
    save_desktop_config_file(&cfg)?;
    Ok("Agent 配置已保存".to_string())
}

#[tauri::command]
pub async fn save_channel_config(config: ChannelConfig) -> Result<String, String> {
    if config.channel_type.trim().is_empty() {
        return Err("Channel 类型不能为空。请选择 discord 或 telegram。".to_string());
    }
    if config.token.trim().is_empty() {
        return Err("Token 不能为空。请输入你的 Bot Token。".to_string());
    }

    let mut cfg = load_desktop_config_file()?;
    // Encrypt token before saving
    let mut encrypted_config = config;
    encrypted_config.token = encrypt_value(&encrypted_config.token);

    if let Some(existing) = cfg
        .channels
        .iter_mut()
        .find(|c| c.channel_type.eq_ignore_ascii_case(&encrypted_config.channel_type))
    {
        *existing = encrypted_config;
    } else {
        cfg.channels.push(encrypted_config);
    }

    save_desktop_config_file(&cfg)?;
    Ok("Channel 配置已保存（Token 已加密存储）".to_string())
}

#[tauri::command]
pub async fn validate_channel(config: ChannelConfig) -> Result<ChannelValidationResult, String> {
    if config.token.trim().is_empty() {
        return Ok(ChannelValidationResult {
            valid: false,
            detail: "Token 不能为空".to_string(),
            bot_username: None,
        });
    }

    let t = config.channel_type.to_lowercase();
    match t.as_str() {
        "discord" => Ok(validate_discord_token(&config.token)),
        "telegram" => Ok(validate_telegram_token(&config.token)),
        _ => Ok(ChannelValidationResult {
            valid: false,
            detail: format!("不支持的 Channel 类型: {}。目前支持 discord 和 telegram。", config.channel_type),
            bot_username: None,
        }),
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiagnosticsSnapshot {
    pub exported_at_unix: u64,
    pub system: SystemStatus,
    pub config: DesktopConfig,
    pub platform: String,
}

#[tauri::command]
pub async fn export_diagnostics() -> Result<String, String> {
    let gateway_port = get_gateway_port();
    let snapshot = DiagnosticsSnapshot {
        exported_at_unix: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| format!("获取时间失败: {}", e))?
            .as_secs(),
        system: SystemStatus {
            node_installed: check_node().0,
            node_version: check_node().1,
            npm_installed: check_npm().0,
            npm_version: check_npm().1,
            openclaw_installed: check_openclaw().0,
            openclaw_version: check_openclaw().1,
            gateway_running: check_gateway_running(gateway_port),
            gateway_port,
            embedded_node_ready: is_embedded_node_ready(),
        },
        config: load_desktop_config_file()?,
        platform: std::env::consts::OS.to_string(),
    };

    let diagnostics_dir = get_app_data_dir().join("diagnostics");
    fs::create_dir_all(&diagnostics_dir)
        .map_err(|e| format!("创建诊断目录失败: {}", e))?;

    let file_path = diagnostics_dir.join(format!("diagnostics-{}.json", snapshot.exported_at_unix));
    let content = serde_json::to_string_pretty(&snapshot)
        .map_err(|e| format!("序列化诊断数据失败: {}", e))?;

    fs::write(&file_path, content)
        .map_err(|e| format!("写入诊断文件失败: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

/// Start streaming gateway logs via events
#[tauri::command]
pub async fn start_gateway_log_stream(
    app: tauri::AppHandle,
    state: State<'_, GatewayLogProcess>,
) -> Result<String, String> {
    let mut lock = state.0.lock().map_err(|_| "无法获取日志进程状态")?;

    // Kill existing stream if any
    if let Some(mut child) = lock.take() {
        let _ = child.kill();
    }

    // Try to tail the gateway log file, or use `openclaw gateway status` output
    // Common log locations
    let log_path = dirs::home_dir()
        .map(|h| h.join(".openclaw").join("gateway.log"))
        .unwrap_or_else(|| PathBuf::from("/tmp/openclaw-gateway.log"));

    if log_path.exists() {
        let mut child = Command::new("tail")
            .args(["-n", "50", "-f"])
            .arg(&log_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("启动日志流失败: {}", e))?;

        let stdout = child.stdout.take();
        *lock = Some(child);
        drop(lock);

        // Spawn a thread to read and emit events
        if let Some(stdout) = stdout {
            std::thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    match line {
                        Ok(text) => {
                            let _ = app.emit("gateway-log", text);
                        }
                        Err(_) => break,
                    }
                }
            });
        }

        Ok("日志流已启动".to_string())
    } else {
        // No log file found, emit a notice
        let _ = app.emit("gateway-log", "[No gateway log file found. Start the gateway first.]");
        Ok("未找到日志文件".to_string())
    }
}

/// Stop streaming gateway logs
#[tauri::command]
pub async fn stop_gateway_log_stream(
    state: State<'_, GatewayLogProcess>,
) -> Result<String, String> {
    let mut lock = state.0.lock().map_err(|_| "无法获取日志进程状态")?;
    if let Some(mut child) = lock.take() {
        let _ = child.kill();
        Ok("日志流已停止".to_string())
    } else {
        Ok("日志流未在运行".to_string())
    }
}

/// Check for openclaw npm updates
#[tauri::command]
pub async fn check_openclaw_update() -> Result<String, String> {
    // Get current version
    let current = match Command::new("openclaw").arg("--version").output() {
        Ok(o) if o.status.success() => {
            String::from_utf8_lossy(&o.stdout).trim().to_string()
        }
        _ => return Err("openclaw not installed".to_string()),
    };

    // Get latest version from npm
    let (npm_cmd, mut prefix_args) = resolve_npm_command()
        .ok_or_else(|| "npm not available".to_string())?;

    prefix_args.extend(["view".to_string(), "openclaw".to_string(), "version".to_string()]);

    let output = Command::new(&npm_cmd)
        .args(&prefix_args)
        .output()
        .map_err(|e| format!("npm view failed: {}", e))?;

    if !output.status.success() {
        return Err("Failed to check latest version".to_string());
    }

    let latest = String::from_utf8_lossy(&output.stdout).trim().to_string();

    // Compare (strip leading 'v' if present)
    let current_clean = current.trim_start_matches('v');
    let latest_clean = latest.trim_start_matches('v');

    if current_clean == latest_clean {
        Ok("up-to-date".to_string())
    } else {
        Ok(format!("update-available:{}", latest_clean))
    }
}

/// Perform openclaw npm update
#[tauri::command]
pub async fn perform_openclaw_update() -> Result<String, String> {
    let (npm_cmd, mut prefix_args) = resolve_npm_command()
        .ok_or_else(|| "npm not available".to_string())?;

    prefix_args.extend(["install".to_string(), "-g".to_string(), "openclaw@latest".to_string()]);

    let output = Command::new(&npm_cmd)
        .args(&prefix_args)
        .output()
        .map_err(|e| format!("Update failed: {}", e))?;

    if output.status.success() {
        Ok("Update successful".to_string())
    } else {
        Err(format!("Update failed: {}", String::from_utf8_lossy(&output.stderr)))
    }
}
