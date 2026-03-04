import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

// Types
interface SystemStatus {
  node_installed: boolean;
  node_version: string | null;
  openclaw_installed: boolean;
  openclaw_version: string | null;
  gateway_running: boolean;
  gateway_port: number;
}

function App() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // 检查系统状态
  const checkStatus = async () => {
    try {
      const result = await invoke<SystemStatus>("check_system_status");
      setStatus(result);
      addLog(`状态检查完成: Node=${result.node_version}, OpenClaw=${result.openclaw_version}`);
    } catch (e) {
      addLog(`错误: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  // 安装 OpenClaw
  const installOpenClaw = async () => {
    setInstalling(true);
    addLog("开始安装 OpenClaw...");
    try {
      await invoke("install_openclaw");
      addLog("OpenClaw 安装完成！");
      await checkStatus();
    } catch (e) {
      addLog(`安装失败: ${e}`);
    } finally {
      setInstalling(false);
    }
  };

  // 启动 Gateway
  const startGateway = async () => {
    addLog("启动 Gateway...");
    try {
      await invoke("start_gateway");
      addLog("Gateway 已启动！");
      await checkStatus();
    } catch (e) {
      addLog(`启动失败: ${e}`);
    }
  };

  // 停止 Gateway
  const stopGateway = async () => {
    addLog("停止 Gateway...");
    try {
      await invoke("stop_gateway");
      addLog("Gateway 已停止！");
      await checkStatus();
    } catch (e) {
      addLog(`停止失败: ${e}`);
    }
  };

  // 打开 Web UI
  const openWebUI = () => {
    if (status?.gateway_running) {
      window.open(`http://localhost:${status.gateway_port}`, "_blank");
    }
  };

  // 添加日志
  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${time}] ${msg}`]);
  };

  useEffect(() => {
    checkStatus();
  }, []);

  return (
    <div className="app">
      <header className="header">
        <h1>🦞 OpenClaw Desktop</h1>
        <p className="subtitle">一键使用龙虾</p>
      </header>

      <main className="main">
        {/* 状态面板 */}
        <section className="status-panel">
          <h2>系统状态</h2>
          {loading ? (
            <p>检测中...</p>
          ) : (
            <div className="status-grid">
              <div className={`status-item ${status?.node_installed ? "ok" : "error"}`}>
                <span className="icon">{status?.node_installed ? "✅" : "❌"}</span>
                <span className="label">Node.js</span>
                <span className="value">{status?.node_version || "未安装"}</span>
              </div>
              <div className={`status-item ${status?.openclaw_installed ? "ok" : "error"}`}>
                <span className="icon">{status?.openclaw_installed ? "✅" : "❌"}</span>
                <span className="label">OpenClaw</span>
                <span className="value">{status?.openclaw_version || "未安装"}</span>
              </div>
              <div className={`status-item ${status?.gateway_running ? "ok" : "error"}`}>
                <span className="icon">{status?.gateway_running ? "🟢" : "⚪"}</span>
                <span className="label">Gateway</span>
                <span className="value">
                  {status?.gateway_running ? `运行中 (:${status.gateway_port})` : "已停止"}
                </span>
              </div>
            </div>
          )}
        </section>

        {/* 操作面板 */}
        <section className="action-panel">
          <h2>操作</h2>
          <div className="button-group">
            {!status?.node_installed && (
              <button className="btn btn-primary" disabled>
                安装 Node.js (内嵌)
              </button>
            )}
            {!status?.openclaw_installed && (
              <button
                className="btn btn-primary"
                onClick={installOpenClaw}
                disabled={installing}
              >
                {installing ? "安装中..." : "安装 OpenClaw"}
              </button>
            )}
            {status?.openclaw_installed && !status?.gateway_running && (
              <button className="btn btn-success" onClick={startGateway}>
                启动 Gateway
              </button>
            )}
            {status?.gateway_running && (
              <>
                <button className="btn btn-danger" onClick={stopGateway}>
                  停止 Gateway
                </button>
                <button className="btn btn-primary" onClick={openWebUI}>
                  打开 Web UI
                </button>
              </>
            )}
          </div>
        </section>

        {/* 日志面板 */}
        <section className="log-panel">
          <h2>日志</h2>
          <div className="log-container">
            {logs.length === 0 ? (
              <p className="no-logs">暂无日志</p>
            ) : (
              logs.map((log, i) => <div key={i} className="log-item">{log}</div>)
            )}
          </div>
        </section>
      </main>

      <footer className="footer">
        <p>OpenClaw Desktop v0.1.0 | 专注小白一键使用</p>
      </footer>
    </div>
  );
}

export default App;
