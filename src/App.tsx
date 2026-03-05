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

interface ProviderConfig {
  provider: string;
  endpoint: string;
  model: string;
  api_key: string;
}

interface AgentConfig {
  name: string;
  profile: string;
  tool_policy: string;
}

interface ChannelConfig {
  channel_type: string;
  enabled: boolean;
  token: string;
  target: string;
}

interface DesktopConfig {
  provider?: ProviderConfig;
  agent?: AgentConfig;
  channels: ChannelConfig[];
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
  const [providerName, setProviderName] = useState("anthropic");

  const [agentName, setAgentName] = useState("default-assistant");
  const [agentProfile, setAgentProfile] = useState("general");
  const [toolPolicy, setToolPolicy] = useState("standard");

  const [channelType, setChannelType] = useState("discord");
  const [channelToken, setChannelToken] = useState("");
  const [channelTarget, setChannelTarget] = useState("");

  // Setup step
  const [setupStep, setSetupStep] = useState(1);

  const [diagRunning, setDiagRunning] = useState(false);
  const [diagResult, setDiagResult] = useState<{
    gateway: "unknown" | "pass" | "fail";
    channel: "unknown" | "pass" | "fail";
    agent: "unknown" | "pass" | "fail";
  }>({ gateway: "unknown", channel: "unknown", agent: "unknown" });

  const providerConfigured = !!apiKey.trim();
  const agentConfigured = !!agentName.trim();
  const channelConfigured = !!channelToken.trim();

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

  // 持久化写入 Windows 用户 PATH
  const persistWindowsPath = async () => {
    setInstalling(true);
    addLog("正在写入用户 PATH...");
    try {
      const msg = await invoke<string>("persist_windows_node_path");
      addLog(`✅ ${msg}`);
      await checkStatus();
    } catch (e) {
      addLog(`❌ 写入 PATH 失败: ${e}`);
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

  // 加载已有配置
  const loadConfig = async () => {
    try {
      const cfg = await invoke<DesktopConfig>("load_config");

      const hasProvider = !!cfg.provider?.api_key?.trim();
      const hasAgent = !!cfg.agent?.name?.trim();
      const hasChannel = !!cfg.channels?.[0]?.token?.trim();

      if (cfg.provider) {
        setProviderName(cfg.provider.provider);
        setApiEndpoint(cfg.provider.endpoint);
        setModelName(cfg.provider.model);
        setApiKey(cfg.provider.api_key || "");
      }
      if (cfg.agent) {
        setAgentName(cfg.agent.name);
        setAgentProfile(cfg.agent.profile);
        setToolPolicy(cfg.agent.tool_policy);
      }
      if (cfg.channels && cfg.channels.length > 0) {
        const c = cfg.channels[0];
        setChannelType(c.channel_type);
        setChannelToken(c.token || "");
        setChannelTarget(c.target || "");
      }

      // 根据已存在配置自动定位向导步骤，支持中断后续跑
      if (hasProvider && hasAgent && hasChannel) {
        setSetupStep(5);
      } else if (hasProvider && hasAgent) {
        setSetupStep(4);
      } else if (hasProvider) {
        setSetupStep(3);
      } else {
        setSetupStep(2);
      }
    } catch {
      // ignore if first run
    }
  };

  const saveProviderConfig = async () => {
    setInstalling(true);
    try {
      await invoke("save_provider_config", {
        config: {
          provider: providerName,
          endpoint: apiEndpoint,
          model: modelName,
          api_key: apiKey,
        },
      });
      addLog("✅ Provider 配置已保存");
      setSetupStep(3);
    } catch (e) {
      addLog(`❌ Provider 配置保存失败: ${e}`);
    } finally {
      setInstalling(false);
    }
  };

  const saveAgentConfig = async () => {
    setInstalling(true);
    try {
      await invoke("save_agent_config", {
        config: {
          name: agentName,
          profile: agentProfile,
          tool_policy: toolPolicy,
        },
      });
      addLog("✅ Agent 配置已保存");
      setSetupStep(4);
    } catch (e) {
      addLog(`❌ Agent 配置保存失败: ${e}`);
    } finally {
      setInstalling(false);
    }
  };

  const saveChannelConfig = async () => {
    setInstalling(true);
    try {
      await invoke("validate_channel", {
        config: {
          channel_type: channelType,
          enabled: true,
          token: channelToken,
          target: channelTarget,
        },
      });

      await invoke("save_channel_config", {
        config: {
          channel_type: channelType,
          enabled: true,
          token: channelToken,
          target: channelTarget,
        },
      });
      addLog("✅ Channel 配置已保存并校验通过");
      setSetupStep(5);
    } catch (e) {
      addLog(`❌ Channel 配置失败: ${e}`);
    } finally {
      setInstalling(false);
    }
  };

  const runDiagnostics = async () => {
    setDiagRunning(true);
    try {
      // 1) gateway
      let gatewayPass = false;
      try {
        const running = await invoke<boolean>("get_gateway_status");
        gatewayPass = !!running;
      } catch {
        gatewayPass = false;
      }

      // 2) channel (basic: token exists)
      const channelPass = !!channelToken.trim();

      // 3) agent (basic: name exists)
      const agentPass = !!agentName.trim();

      setDiagResult({
        gateway: gatewayPass ? "pass" : "fail",
        channel: channelPass ? "pass" : "fail",
        agent: agentPass ? "pass" : "fail",
      });

      addLog(
        `诊断结果: gateway=${gatewayPass ? "pass" : "fail"}, channel=${
          channelPass ? "pass" : "fail"
        }, agent=${agentPass ? "pass" : "fail"}`
      );
    } finally {
      setDiagRunning(false);
    }
  };

  const exportDiagnostics = async () => {
    setDiagRunning(true);
    try {
      const filePath = await invoke<string>("export_diagnostics");
      addLog(`✅ 已导出诊断文件: ${filePath}`);
    } catch (e) {
      addLog(`❌ 导出诊断失败: ${e}`);
    } finally {
      setDiagRunning(false);
    }
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
    loadConfig();
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
            {[1, 2, 3, 4, 5].map((step) => (
              <div key={step} className={`progress-step ${setupStep >= step ? "active" : ""}`}>
                <span className="step-number">{step}</span>
                <span className="step-label">
                  {step === 1
                    ? "环境检测"
                    : step === 2
                      ? "Provider"
                      : step === 3
                        ? "Agent"
                        : step === 4
                          ? "Channel"
                          : "完成"}
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
                {!status?.npm_installed && !status?.embedded_node_ready && (
                  <button className="btn btn-secondary" onClick={persistWindowsPath} disabled={installing}>
                    {installing ? "处理中..." : "修复 PATH（Windows）"}
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
                <label>Provider</label>
                <select value={providerName} onChange={(e) => setProviderName(e.target.value)}>
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div className="form-group">
                <label>API 端点</label>
                <select value={apiEndpoint} onChange={(e) => setApiEndpoint(e.target.value)}>
                  <option value="https://api.anthropic.com">Anthropic (官方)</option>
                  <option value="https://api.openai.com">OpenAI</option>
                  <option value="https://api.openrouter.ai/api/v1">OpenRouter</option>
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
                <button className="btn btn-success" onClick={saveProviderConfig} disabled={installing || !apiKey.trim()}>
                  保存并下一步
                </button>
              </div>
            </section>
          )}

          {/* 步骤 3: Agent 配置 */}
          {setupStep === 3 && (
            <section className="wizard-step">
              <h2>步骤 3: 配置 Agent</h2>

              <div className="form-group">
                <label>Agent 名称</label>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="default-assistant"
                />
              </div>

              <div className="form-group">
                <label>Agent Profile</label>
                <select value={agentProfile} onChange={(e) => setAgentProfile(e.target.value)}>
                  <option value="general">General（推荐）</option>
                  <option value="safe">Safe</option>
                  <option value="builder">Builder</option>
                </select>
              </div>

              <div className="form-group">
                <label>工具权限</label>
                <select value={toolPolicy} onChange={(e) => setToolPolicy(e.target.value)}>
                  <option value="standard">Standard</option>
                  <option value="safe">Safe</option>
                  <option value="elevated">Elevated</option>
                </select>
              </div>

              <div className="button-group">
                <button className="btn btn-secondary" onClick={() => setSetupStep(2)}>
                  ← 上一步
                </button>
                <button className="btn btn-success" onClick={saveAgentConfig} disabled={installing || !agentName.trim()}>
                  保存并下一步
                </button>
              </div>
            </section>
          )}

          {/* 步骤 4: Channel 配置 */}
          {setupStep === 4 && (
            <section className="wizard-step">
              <h2>步骤 4: 配置 Channel</h2>

              <div className="form-group">
                <label>Channel 类型</label>
                <select value={channelType} onChange={(e) => setChannelType(e.target.value)}>
                  <option value="discord">Discord</option>
                  <option value="telegram">Telegram</option>
                </select>
              </div>

              <div className="form-group">
                <label>Token</label>
                <input
                  type="password"
                  value={channelToken}
                  onChange={(e) => setChannelToken(e.target.value)}
                  placeholder="Bot token"
                />
              </div>

              <div className="form-group">
                <label>Target（可选）</label>
                <input
                  type="text"
                  value={channelTarget}
                  onChange={(e) => setChannelTarget(e.target.value)}
                  placeholder="channel id / user id"
                />
              </div>

              <div className="button-group">
                <button className="btn btn-secondary" onClick={() => setSetupStep(3)}>
                  ← 上一步
                </button>
                <button className="btn btn-success" onClick={saveChannelConfig} disabled={installing || !channelToken.trim()}>
                  保存并下一步
                </button>
              </div>
            </section>
          )}

          {/* 步骤 5: 完成 */}
          {setupStep === 5 && (
            <section className="wizard-step success">
              <div className="success-icon">🎉</div>
              <h2>设置完成！</h2>
              <p>OpenClaw Desktop 已准备就绪</p>
              <p className="hint">已完成 Provider / Agent / Channel 基础配置</p>
              <ul style={{ textAlign: "left", margin: "10px auto", maxWidth: 360 }}>
                <li>{providerConfigured ? "✅" : "❌"} Provider 配置</li>
                <li>{agentConfigured ? "✅" : "❌"} Agent 配置</li>
                <li>{channelConfigured ? "✅" : "❌"} Channel 配置</li>
              </ul>

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
                {!status?.npm_installed && !status?.embedded_node_ready && (
                  <button className="btn btn-secondary" onClick={persistWindowsPath} disabled={installing}>
                    {installing ? "处理中..." : "修复 PATH（Windows）"}
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

            {/* 验证中心 */}
            <section className="status-panel">
              <h2>验证中心</h2>
              <div className="button-group" style={{ marginBottom: 12 }}>
                <button className="btn btn-secondary" onClick={runDiagnostics} disabled={diagRunning}>
                  {diagRunning ? "诊断中..." : "运行完整诊断"}
                </button>
                <button className="btn btn-primary" onClick={exportDiagnostics} disabled={diagRunning}>
                  {diagRunning ? "处理中..." : "导出诊断文件"}
                </button>
              </div>

              <div className="status-grid">
                <div className={`status-item ${diagResult.gateway === "pass" ? "ok" : diagResult.gateway === "fail" ? "error" : ""}`}>
                  <span className="icon">{diagResult.gateway === "pass" ? "✅" : diagResult.gateway === "fail" ? "❌" : "➖"}</span>
                  <span className="label">Gateway</span>
                  <span className="value">{diagResult.gateway}</span>
                </div>
                <div className={`status-item ${diagResult.channel === "pass" ? "ok" : diagResult.channel === "fail" ? "error" : ""}`}>
                  <span className="icon">{diagResult.channel === "pass" ? "✅" : diagResult.channel === "fail" ? "❌" : "➖"}</span>
                  <span className="label">Channel</span>
                  <span className="value">{diagResult.channel}</span>
                </div>
                <div className={`status-item ${diagResult.agent === "pass" ? "ok" : diagResult.agent === "fail" ? "error" : ""}`}>
                  <span className="icon">{diagResult.agent === "pass" ? "✅" : diagResult.agent === "fail" ? "❌" : "➖"}</span>
                  <span className="label">Agent</span>
                  <span className="value">{diagResult.agent}</span>
                </div>
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
