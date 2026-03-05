use serde::{Deserialize, Serialize};
use std::process::{Command, Child};
use std::sync::Mutex;
use tauri::State;
use std::path::PathBuf;
use std::fs;

// Global state to track gateway process
pub struct GatewayProcess(pub Mutex<Option<Child>>);

// System status response
#[derive(Debug, Serialize, Deserialize)]
pub struct SystemStatus {
    pub node_installed: bool,
    pub node_version: Option<String>,
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

/// Get the npm executable path (system or embedded)
fn get_npm_executable() -> String {
    // First check if embedded node is available
    if is_embedded_node_ready() {
        let embedded_path = get_embedded_node_path();
        #[cfg(target_os = "windows")]
        {
            embedded_path.join("npm.cmd").to_string_lossy().to_string()
        }
        #[cfg(not(target_os = "windows"))]
        {
            embedded_path.join("bin").join("npm").to_string_lossy().to_string()
        }
    } else {
        // Use system npm
        "npm".to_string()
    }
}

/// Check if Node.js is installed and get version
fn check_node() -> (bool, Option<String>) {
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
    let (openclaw_installed, openclaw_version) = check_openclaw();
    let gateway_port = get_gateway_port();
    let gateway_running = check_gateway_running(gateway_port);
    let embedded_node_ready = is_embedded_node_ready();

    Ok(SystemStatus {
        node_installed,
        node_version,
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

/// Install OpenClaw via npm
#[tauri::command]
pub async fn install_openclaw() -> Result<String, String> {
    let npm_exe = get_npm_executable();
    
    // Check if npm is available
    let npm_check = Command::new(&npm_exe).arg("--version").output();
    if npm_check.is_err() {
        return Err("npm 未安装。请先安装 Node.js 或使用内嵌版本。".to_string());
    }

    // Run npm install -g openclaw
    let output = Command::new(&npm_exe)
        .args(["install", "-g", "openclaw@latest"])
        .output()
        .map_err(|e| format!("执行 npm install 失败: {}", e))?;

    if output.status.success() {
        Ok("OpenClaw 安装成功！".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("安装失败: {}", stderr))
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
