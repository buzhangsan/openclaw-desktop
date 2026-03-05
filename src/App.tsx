import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

// Types
interface SystemStatus {
  node_installed: boolean;
  node_version: string | null;
  npm_installed: boolean;
  npm_version: string | null;
  openclaw_installed: boolean;
  openclaw_version: string | null;
  gateway_running: boolean;
  gateway_port: number;
  embedded_node_ready: boolean;
}

type AppView = "wizard" | "main";

function App() {
  const [view, setView] = useState<AppView>("wizard");
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  
  // Configuration state
  const [apiKey, setApiKey] = useState("");
  const [apiEndpoint, setApiEndpoint] = useState("https://api.anthropic.com");
  const [modelName, setModelName] = useState("claude-3-5-sonnet-20241022");
  
  // Setup step
  const [setupStep, setSetupStep] = useState(1);

  // 检查系统状态
  const checkStatus = async () => {
    try {
      const result = await invoke<SystemStatus>("check_system_status");
      setStatus(result);
      addLog(`状态: Node=${result.node_version || "无"}, npm=${result.npm_version || "无"}, OpenClaw=${result.openclaw_version || "无"}, 内嵌Node=${result.embedded_node_ready ? "就绪" : "未就绪"}`);
      
      // 如果一切就绪，直接进入主界面
      if (result.node_installed && result.openclaw_installed) {
        setView("main");
      }
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
      addLog("✅ OpenClaw 安装完成！");
      await checkStatus();
    } catch (e) {
      addLog(`❌ 安装失败: ${e}`);
    } finally {
      setInstalling(false);
    }
  };

  // 设置内嵌 Node.js
  const setupEmbeddedNode = async () => {
    setInstalling(true);
    addLog("设置内嵌 Node.js...");
    try {
      await invoke("setup_embedded_node");
      addLog("✅ 内嵌 Node.js 设置完成！");
      await checkStatus();
    } catch (e) {
      addLog(`❌ 设置失败: ${e}`);
    } finally {
      setInstalling(false);
    }
  };

  // 启动 Gateway
  const startGateway = async () => {
    addLog("启动 Gateway...");
    try {
      await invoke("start_gateway");
      addLog("✅ Gateway 已启动！");
      await checkStatus();
    } catch (e) {
      addLog(`❌ 启动失败: ${e}`);
    }
  };

  // 停止 Gateway
  const stopGateway = async () => {
    addLog("停止 Gateway...");
    try {
      await invoke("stop_gateway");
      addLog("✅ Gateway 已停止！");
      await checkStatus();
    } catch (e) {
      addLog(`❌ 停止失败: ${e}`);
    }
  };

  // 打开 Web UI
  const openWebUI = () => {
    if (status?.gateway_running) {
      window.open(`http://localhost:${status.gateway_port}`, "_blank");
    }
  };

  // 保存配置
  const saveConfig = () => {
    // TODO: 实际保存配置到文件
    addLog(`配置已保存: ${apiEndpoint}, ${modelName}`);
    setSetupStep(3);
  };

  // 完成设置向导
  const finishWizard = () => {
    setView("main");
  };

  // 添加日志
  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-50), `[${time}] ${msg}`]);
  };

  useEffect(() => {
    checkStatus();
  }, []);

  // 向导界面
  if (view === "wizard" && !loading) {
    return (
      <div className="app wizard">
        <header className="header">
          <h1>🦞 OpenClaw Desktop</h1>
          <p className="subtitle">首次设置向导</p>
        </header>

        <main className="main">
          {/* 进度指示器 */}
          <div className="progress">
            {[1, 2, 3].map((step) => (
              <div key={step} className={`progress-step ${setupStep >= step ? "active" : ""}`}>
                <span className="step-number">{step}</span>
                <span className="step-label">
                  {step === 1 ? "环境检测" : step === 2 ? "配置 API" : "完成"}
                </span>
              </div>
            ))}
          </div>

          {/* 步骤 1: 环境检测 */}
          {setupStep === 1 && (
            <section className="wizard-step">
              <h2>步骤 1: 环境检测</h2>
              
              <div className="status-grid">
                <div className={`status-item ${status?.node_installed || status?.embedded_node_ready ? "ok" : "error"}`}>
                  <span className="icon">{status?.node_installed || status?.embedded_node_ready ? "✅" : "❌"}</span>
                  <span className="label">Node.js</span>
                  <span className="value">{status?.node_version || (status?.embedded_node_ready ? "内嵌版就绪" : "未安装")}</span>
                </div>
                <div className={`status-item ${status?.npm_installed ? "ok" : "error"}`}>
                  <span className="icon">{status?.npm_installed ? "✅" : "❌"}</span>
                  <span className="label">npm</span>
                  <span className="value">{status?.npm_version || "未安装"}</span>
                </div>
                <div className={`status-item ${status?.openclaw_installed ? "ok" : "error"}`}>
                  <span className="icon">{status?.openclaw_installed ? "✅" : "❌"}</span>
                  <span className="label">OpenClaw</span>
                  <span className="value">{status?.openclaw_version || "未安装"}</span>
                </div>
              </div>

              <div className="button-group">
                {!status?.node_installed && !status?.embedded_node_ready && (
                  <button className="btn btn-primary" onClick={setupEmbeddedNode} disabled={installing}>
                    {installing ? "设置中..." : "设置内嵌 Node.js"}
                  </button>
                )}
                {!status?.openclaw_installed && (status?.npm_installed || status?.embedded_node_ready) && (
                  <button className="btn btn-primary" onClick={installOpenClaw} disabled={installing}>
                    {installing ? "安装中..." : "安装 OpenClaw"}
                  </button>
                )}
                {status?.openclaw_installed && (
                  <button className="btn btn-success" onClick={() => setSetupStep(2)}>
                    下一步 →
                  </button>
                )}
              </div>
            </section>
          )}

          {/* 步骤 2: 配置 API */}
          {setupStep === 2 && (
            <section className="wizard-step">
              <h2>步骤 2: 配置 LLM API</h2>
              
              <div className="form-group">
                <label>API 端点</label>
                <select value={apiEndpoint} onChange={(e) => setApiEndpoint(e.target.value)}>
                  <option value="https://api.anthropic.com">Anthropic (官方)</option>
                  <option value="https://api.openai.com">OpenAI</option>
                  <option value="custom">自定义</option>
                </select>
              </div>

              <div className="form-group">
                <label>API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                />
                <small>你的 API Key 只会保存在本地</small>
              </div>

              <div className="form-group">
                <label>模型</label>
                <select value={modelName} onChange={(e) => setModelName(e.target.value)}>
                  <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                  <option value="claude-3-opus-20240229">Claude 3 Opus</option>
                  <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
                </select>
              </div>

              <div className="button-group">
                <button className="btn btn-secondary" onClick={() => setSetupStep(1)}>
                  ← 上一步
                </button>
                <button className="btn btn-success" onClick={saveConfig}>
                  保存配置
                </button>
              </div>
            </section>
          )}

          {/* 步骤 3: 完成 */}
          {setupStep === 3 && (
            <section className="wizard-step success">
              <div className="success-icon">🎉</div>
              <h2>设置完成！</h2>
              <p>OpenClaw Desktop 已准备就绪</p>
              <p className="hint">点击下方按钮开始使用龙虾</p>
              
              <button className="btn btn-primary btn-large" onClick={finishWizard}>
                开始使用 →
              </button>
            </section>
          )}
        </main>
      </div>
    );
  }

  // 主界面
  return (
    <div className="app">
      <header className="header">
        <h1>🦞 OpenClaw Desktop</h1>
        <p className="subtitle">一键使用龙虾</p>
      </header>

      <main className="main">
        {loading ? (
          <p>加载中...</p>
        ) : (
          <>
            {/* 状态面板 */}
            <section className="status-panel">
              <h2>系统状态</h2>
              <div className="status-grid">
                <div className={`status-item ${status?.node_installed || status?.embedded_node_ready ? "ok" : "error"}`}>
                  <span className="icon">{status?.node_installed || status?.embedded_node_ready ? "✅" : "❌"}</span>
                  <span className="label">Node.js</span>
                  <span className="value">{status?.node_version || (status?.embedded_node_ready ? "内嵌版" : "未安装")}</span>
                </div>
                <div className={`status-item ${status?.npm_installed ? "ok" : "error"}`}>
                  <span className="icon">{status?.npm_installed ? "✅" : "❌"}</span>
                  <span className="label">npm</span>
                  <span className="value">{status?.npm_version || "未安装"}</span>
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
            </section>

            {/* 操作面板 */}
            <section className="action-panel">
              <h2>操作</h2>
              <div className="button-group">
                {!status?.openclaw_installed && (
                  <button
                    className="btn btn-primary"
                    onClick={installOpenClaw}
                    disabled={installing || (!status?.npm_installed && !status?.embedded_node_ready)}
                    title={!status?.npm_installed && !status?.embedded_node_ready ? "需要 npm 或内嵌 Node.js" : ""}
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
                    <button className="btn btn-primary" onClick={openWebUI}>
                      打开 Web UI
                    </button>
                    <button className="btn btn-danger" onClick={stopGateway}>
                      停止 Gateway
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
          </>
        )}
      </main>

      <footer className="footer">
        <p>OpenClaw Desktop v0.2.0 | 专注小白一键使用</p>
      </footer>
    </div>
  );
}

export default App;
