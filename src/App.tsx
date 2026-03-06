import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SystemStatus, DesktopConfig, AppView, DiagResult } from "./types";
import { getModelsForProvider, getDefaultEndpoint, getDefaultModel } from "./models";
import { useLogs } from "./hooks/useLogs";
import { StatusGrid } from "./components/StatusGrid";
import { LogPanel } from "./components/LogPanel";
import { DiagnosticsPanel } from "./components/DiagnosticsPanel";
import { ProgressBar } from "./components/ProgressBar";
import { WizardStepEnv } from "./components/WizardStepEnv";
import { WizardStepProvider } from "./components/WizardStepProvider";
import { WizardStepAgent } from "./components/WizardStepAgent";
import { WizardStepChannel } from "./components/WizardStepChannel";
import { WizardStepComplete } from "./components/WizardStepComplete";

const WIZARD_STEPS = [
  { label: "环境检测" },
  { label: "Provider" },
  { label: "Agent" },
  { label: "Channel" },
  { label: "完成" },
];

function App() {
  const [view, setView] = useState<AppView>("wizard");
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const { logs, addLog } = useLogs();

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

  const [setupStep, setSetupStep] = useState(1);
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagResult, setDiagResult] = useState<DiagResult>({
    gateway: "unknown",
    channel: "unknown",
    agent: "unknown",
  });

  const providerConfigured = !!apiKey.trim();
  const agentConfigured = !!agentName.trim();
  const channelConfigured = !!channelToken.trim();

  // Dynamic model list based on provider
  const modelOptions = getModelsForProvider(providerName);

  // When provider changes, update endpoint and model defaults
  const handleProviderChange = (newProvider: string) => {
    setProviderName(newProvider);
    setApiEndpoint(getDefaultEndpoint(newProvider));
    setModelName(getDefaultModel(newProvider));
  };

  // --- Actions ---

  const checkStatus = async () => {
    try {
      const result = await invoke<SystemStatus>("check_system_status");
      setStatus(result);
      addLog(`状态: Node=${result.node_version || "无"}, npm=${result.npm_version || "无"}, OpenClaw=${result.openclaw_version || "无"}`);
      if (result.node_installed && result.openclaw_installed) {
        setView("main");
      }
    } catch (e) {
      addLog(`错误: ${e}`);
    } finally {
      setLoading(false);
    }
  };

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

  const openWebUI = () => {
    if (status?.gateway_running) {
      window.open(`http://localhost:${status.gateway_port}`, "_blank");
    }
  };

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

      if (hasProvider && hasAgent && hasChannel) setSetupStep(5);
      else if (hasProvider && hasAgent) setSetupStep(4);
      else if (hasProvider) setSetupStep(3);
      else setSetupStep(2);
    } catch {
      // ignore first run
    }
  };

  const saveProviderConfig = async () => {
    setInstalling(true);
    try {
      await invoke("save_provider_config", {
        config: { provider: providerName, endpoint: apiEndpoint, model: modelName, api_key: apiKey },
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
        config: { name: agentName, profile: agentProfile, tool_policy: toolPolicy },
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
        config: { channel_type: channelType, enabled: true, token: channelToken, target: channelTarget },
      });
      await invoke("save_channel_config", {
        config: { channel_type: channelType, enabled: true, token: channelToken, target: channelTarget },
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
      let gatewayPass = false;
      try {
        gatewayPass = !!(await invoke<boolean>("get_gateway_status"));
      } catch { /* */ }
      setDiagResult({
        gateway: gatewayPass ? "pass" : "fail",
        channel: channelToken.trim() ? "pass" : "fail",
        agent: agentName.trim() ? "pass" : "fail",
      });
      addLog(`诊断结果: gateway=${gatewayPass ? "pass" : "fail"}, channel=${channelToken.trim() ? "pass" : "fail"}, agent=${agentName.trim() ? "pass" : "fail"}`);
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

  useEffect(() => {
    checkStatus();
    loadConfig();
  }, []);

  // --- Wizard View ---
  if (view === "wizard" && !loading) {
    return (
      <div className="app wizard">
        <header className="header">
          <h1>🦞 OpenClaw Desktop</h1>
          <p className="subtitle">首次设置向导</p>
        </header>
        <main className="main">
          <ProgressBar currentStep={setupStep} steps={WIZARD_STEPS} />

          {setupStep === 1 && (
            <WizardStepEnv
              status={status}
              installing={installing}
              onSetupEmbeddedNode={setupEmbeddedNode}
              onInstallOpenClaw={installOpenClaw}
              onPersistWindowsPath={persistWindowsPath}
              onNext={() => setSetupStep(2)}
            />
          )}

          {setupStep === 2 && (
            <WizardStepProvider
              providerName={providerName}
              setProviderName={handleProviderChange}
              apiEndpoint={apiEndpoint}
              setApiEndpoint={setApiEndpoint}
              apiKey={apiKey}
              setApiKey={setApiKey}
              modelName={modelName}
              setModelName={setModelName}
              modelOptions={modelOptions}
              installing={installing}
              onSave={saveProviderConfig}
              onBack={() => setSetupStep(1)}
            />
          )}

          {setupStep === 3 && (
            <WizardStepAgent
              agentName={agentName}
              setAgentName={setAgentName}
              agentProfile={agentProfile}
              setAgentProfile={setAgentProfile}
              toolPolicy={toolPolicy}
              setToolPolicy={setToolPolicy}
              installing={installing}
              onSave={saveAgentConfig}
              onBack={() => setSetupStep(2)}
            />
          )}

          {setupStep === 4 && (
            <WizardStepChannel
              channelType={channelType}
              setChannelType={setChannelType}
              channelToken={channelToken}
              setChannelToken={setChannelToken}
              channelTarget={channelTarget}
              setChannelTarget={setChannelTarget}
              installing={installing}
              onSave={saveChannelConfig}
              onBack={() => setSetupStep(3)}
            />
          )}

          {setupStep === 5 && (
            <WizardStepComplete
              providerConfigured={providerConfigured}
              agentConfigured={agentConfigured}
              channelConfigured={channelConfigured}
              onFinish={() => setView("main")}
            />
          )}
        </main>
      </div>
    );
  }

  // --- Main View ---
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
            <section className="status-panel">
              <h2>系统状态</h2>
              <StatusGrid status={status} showGateway />
            </section>

            <section className="action-panel">
              <h2>操作</h2>
              <div className="button-group">
                {!status?.openclaw_installed && (
                  <button
                    className="btn btn-primary"
                    onClick={installOpenClaw}
                    disabled={installing || (!status?.npm_installed && !status?.embedded_node_ready)}
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

            <DiagnosticsPanel
              diagResult={diagResult}
              diagRunning={diagRunning}
              onRunDiagnostics={runDiagnostics}
              onExportDiagnostics={exportDiagnostics}
            />

            <LogPanel logs={logs} />
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
