use serde::{Deserialize, Serialize};
use std::process::{Command, Child};
use std::sync::Mutex;
use tauri::State;

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
}

/// Check if Node.js is installed and get version
fn check_node() -> (bool, Option<String>) {
    match Command::new("node").arg("--version").output() {
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

    Ok(SystemStatus {
        node_installed,
        node_version,
        openclaw_installed,
        openclaw_version,
        gateway_running,
        gateway_port,
    })
}

/// Install OpenClaw via npm
#[tauri::command]
pub async fn install_openclaw() -> Result<String, String> {
    // Check if npm is available
    let npm_check = Command::new("npm").arg("--version").output();
    if npm_check.is_err() {
        return Err("npm 未安装。请先安装 Node.js。".to_string());
    }

    // Run npm install -g openclaw
    let output = Command::new("npm")
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
