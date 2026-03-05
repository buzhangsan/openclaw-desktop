use serde::{Deserialize, Serialize};
use std::process::{Command, Child};
use std::sync::Mutex;
use tauri::State;
use std::path::PathBuf;
use std::fs;
#[cfg(target_os = "windows")]
use std::env;

// Global state to track gateway process
pub struct GatewayProcess(pub Mutex<Option<Child>>);

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
    // Try to connect to the gateway health endpoint
    let url = format!("http://localhost:{}/health", port);
    match reqwest::blocking::get(&url) {
        Ok(response) => response.status().is_success(),
        Err(_) => false,
    }
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

/// Download and setup embedded Node.js
#[tauri::command]
pub async fn setup_embedded_node() -> Result<String, String> {
    let app_dir = get_app_data_dir();
    let _node_dir = get_embedded_node_path();
    
    // Create app directory if it doesn't exist
    fs::create_dir_all(&app_dir).map_err(|e| format!("Failed to create app directory: {}", e))?;
    
    // For now, just check if already exists
    // In a full implementation, this would download Node.js from nodejs.org
    if is_embedded_node_ready() {
        return Ok("Embedded Node.js is already ready".to_string());
    }
    
    // Return instruction for now - actual download would be implemented here
    Ok("Please download Node.js portable version manually".to_string())
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
        .ok_or_else(|| "npm 未安装或不可用。请先安装 Node.js（含 npm）或启用内嵌 Node.js。".to_string())?;

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
        .map_err(|e| format!("写入配置失败: {}", e))
}

#[tauri::command]
pub async fn load_config() -> Result<DesktopConfig, String> {
    load_desktop_config_file()
}

#[tauri::command]
pub async fn save_provider_config(config: ProviderConfig) -> Result<String, String> {
    if config.provider.trim().is_empty() {
        return Err("provider 不能为空".to_string());
    }
    if config.model.trim().is_empty() {
        return Err("model 不能为空".to_string());
    }
    if config.api_key.trim().is_empty() {
        return Err("api_key 不能为空".to_string());
    }

    let mut cfg = load_desktop_config_file()?;
    cfg.provider = Some(config);
    save_desktop_config_file(&cfg)?;
    Ok("Provider 配置已保存".to_string())
}

#[tauri::command]
pub async fn save_agent_config(config: AgentConfig) -> Result<String, String> {
    if config.name.trim().is_empty() {
        return Err("agent name 不能为空".to_string());
    }
    let mut cfg = load_desktop_config_file()?;
    cfg.agent = Some(config);
    save_desktop_config_file(&cfg)?;
    Ok("Agent 配置已保存".to_string())
}

#[tauri::command]
pub async fn save_channel_config(config: ChannelConfig) -> Result<String, String> {
    if config.channel_type.trim().is_empty() {
        return Err("channel_type 不能为空".to_string());
    }

    let mut cfg = load_desktop_config_file()?;
    if let Some(existing) = cfg
        .channels
        .iter_mut()
        .find(|c| c.channel_type.eq_ignore_ascii_case(&config.channel_type))
    {
        *existing = config;
    } else {
        cfg.channels.push(config);
    }

    save_desktop_config_file(&cfg)?;
    Ok("Channel 配置已保存".to_string())
}

#[tauri::command]
pub async fn validate_channel(config: ChannelConfig) -> Result<String, String> {
    let t = config.channel_type.to_lowercase();
    match t.as_str() {
        "discord" | "telegram" => {
            if config.token.trim().is_empty() {
                return Err("Token 不能为空".to_string());
            }
            Ok("Channel 基础校验通过".to_string())
        }
        _ => {
            if config.enabled {
                Ok("未知 channel 类型，已跳过在线校验".to_string())
            } else {
                Ok("Channel 未启用，跳过校验".to_string())
            }
        }
    }
}
