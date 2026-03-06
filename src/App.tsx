import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { I18nContext, Locale, createT } from "./i18n";

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
type ThemeMode = "light" | "dark" | "system";

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(mode: ThemeMode) {
  const effective = mode === "system" ? getSystemTheme() : mode;
  document.documentElement.setAttribute("data-theme", effective);
}

function App() {
  // Theme
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    return (localStorage.getItem("theme") as ThemeMode) || "system";
  });

  // i18n
  const [locale, setLocaleState] = useState<Locale>(() => {
    return (localStorage.getItem("locale") as Locale) || "zh";
  });
  const t = createT(locale);
  const setLocale = (l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("locale", l);
  };

  useEffect(() => {
    applyTheme(themeMode);
    localStorage.setItem("theme", themeMode);
    if (themeMode === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => applyTheme("system");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [themeMode]);

  const [view, setView] = useState<AppView>("wizard");
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

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
  const [diagResult, setDiagResult] = useState<{
    gateway: "unknown" | "pass" | "fail";
    gatewayDetail?: string;
    channel: "unknown" | "pass" | "fail";
    channelDetail?: string;
    agent: "unknown" | "pass" | "fail";
    agentDetail?: string;
  }>({ gateway: "unknown", channel: "unknown", agent: "unknown" });

  // Gateway log stream
  const [gatewayLogs, setGatewayLogs] = useState<string[]>([]);
  const [logStreaming, setLogStreaming] = useState(false);
  const logUnlisten = useRef<UnlistenFn | null>(null);
  const gatewayLogRef = useRef<HTMLDivElement>(null);

  // Update check
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "up-to-date" | "available" | "failed">("idle");
  const [latestVersion, setLatestVersion] = useState("");

  const providerConfigured = !!apiKey.trim();
  const agentConfigured = !!agentName.trim();
  const channelConfigured = !!channelToken.trim();

  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-50), `[${time}] ${msg}`]);
  }, []);

  const checkStatus = async () => {
    try {
      const result = await invoke<SystemStatus>("check_system_status");
      setStatus(result);
      addLog(t("log.status", {
        node: result.node_version || t("step1.notInstalled"),
        npm: result.npm_version || t("step1.notInstalled"),
        openclaw: result.openclaw_version || t("step1.notInstalled"),
        embedded: result.embedded_node_ready ? "✅" : "❌",
      }));
      if (result.node_installed && result.openclaw_installed) setView("main");
    } catch (e) {
      addLog(`Error: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  const installOpenClaw = async () => {
    setInstalling(true);
    addLog(t("log.installStart"));
    try {
      await invoke("install_openclaw");
      addLog(t("log.installDone"));
      await checkStatus();
    } catch (e) {
      addLog(t("log.installFail", { error: String(e) }));
    } finally {
      setInstalling(false);
    }
  };

  const setupEmbeddedNode = async () => {
    setInstalling(true);
    addLog(t("log.embeddedStart"));
    try {
      await invoke("setup_embedded_node");
      addLog(t("log.embeddedDone"));
      await checkStatus();
    } catch (e) {
      addLog(t("log.embeddedFail", { error: String(e) }));
    } finally {
      setInstalling(false);
    }
  };

  const persistWindowsPath = async () => {
    setInstalling(true);
    addLog(t("log.pathStart"));
    try {
      const msg = await invoke<string>("persist_windows_node_path");
      addLog(t("log.pathDone", { msg }));
      await checkStatus();
    } catch (e) {
      addLog(t("log.pathFail", { error: String(e) }));
    } finally {
      setInstalling(false);
    }
  };

  const startGateway = async () => {
    addLog(t("log.gatewayStart"));
    try {
      await invoke("start_gateway");
      addLog(t("log.gatewayStarted"));
      await checkStatus();
    } catch (e) {
      addLog(t("log.gatewayStartFail", { error: String(e) }));
    }
  };

  const stopGateway = async () => {
    addLog(t("log.gatewayStop"));
    try {
      await invoke("stop_gateway");
      addLog(t("log.gatewayStopped"));
      await checkStatus();
    } catch (e) {
      addLog(t("log.gatewayStopFail", { error: String(e) }));
    }
  };

  const openWebUI = () => {
    if (status?.gateway_running) window.open(`http://localhost:${status.gateway_port}`, "_blank");
  };

  // Gateway log stream
  const startLogStream = async () => {
    try {
      const unlisten = await listen<string>("gateway-log", (event) => {
        setGatewayLogs((prev) => [...prev.slice(-200), event.payload]);
        setTimeout(() => {
          gatewayLogRef.current?.scrollTo(0, gatewayLogRef.current.scrollHeight);
        }, 50);
      });
      logUnlisten.current = unlisten;
      await invoke("start_gateway_log_stream");
      setLogStreaming(true);
    } catch (e) {
      addLog(`Log stream error: ${e}`);
    }
  };

  const stopLogStream = async () => {
    try { await invoke("stop_gateway_log_stream"); } catch { /* ignore */ }
    logUnlisten.current?.();
    logUnlisten.current = null;
    setLogStreaming(false);
  };

  // Update check
  const checkUpdate = async () => {
    setUpdateStatus("checking");
    try {
      const result = await invoke<string>("check_openclaw_update");
      if (result === "up-to-date") {
        setUpdateStatus("up-to-date");
      } else if (result.startsWith("update-available:")) {
        setLatestVersion(result.split(":")[1]);
        setUpdateStatus("available");
      }
    } catch {
      setUpdateStatus("failed");
    }
  };

  const performUpdate = async () => {
    setUpdateStatus("checking");
    try {
      await invoke("perform_openclaw_update");
      addLog("✅ OpenClaw updated!");
      setUpdateStatus("up-to-date");
      await checkStatus();
    } catch (e) {
      addLog(`❌ Update failed: ${e}`);
      setUpdateStatus("failed");
    }
  };

  const loadConfig = async () => {
    try {
      const cfg = await invoke<DesktopConfig>("load_config");
      const hasProvider = !!cfg.provider?.api_key?.trim();
      const hasAgent = !!cfg.agent?.name?.trim();
      const hasChannel = !!cfg.channels?.[0]?.token?.trim();
      if (cfg.provider) { setProviderName(cfg.provider.provider); setApiEndpoint(cfg.provider.endpoint); setModelName(cfg.provider.model); setApiKey(cfg.provider.api_key || ""); }
      if (cfg.agent) { setAgentName(cfg.agent.name); setAgentProfile(cfg.agent.profile); setToolPolicy(cfg.agent.tool_policy); }
      if (cfg.channels?.length) { const c = cfg.channels[0]; setChannelType(c.channel_type); setChannelToken(c.token || ""); setChannelTarget(c.target || ""); }
      if (hasProvider && hasAgent && hasChannel) setSetupStep(5);
      else if (hasProvider && hasAgent) setSetupStep(4);
      else if (hasProvider) setSetupStep(3);
      else setSetupStep(2);
    } catch { /* first run */ }
  };

  const saveProviderConfig = async () => {
    setInstalling(true);
    try {
      await invoke("save_provider_config", { config: { provider: providerName, endpoint: apiEndpoint, model: modelName, api_key: apiKey } });
      addLog(t("log.providerSaved"));
      setSetupStep(3);
    } catch (e) { addLog(t("log.providerFail", { error: String(e) })); }
    finally { setInstalling(false); }
  };

  const saveAgentConfig = async () => {
    setInstalling(true);
    try {
      await invoke("save_agent_config", { config: { name: agentName, profile: agentProfile, tool_policy: toolPolicy } });
      addLog(t("log.agentSaved"));
      setSetupStep(4);
    } catch (e) { addLog(t("log.agentFail", { error: String(e) })); }
    finally { setInstalling(false); }
  };

  const saveChannelConfig = async () => {
    setInstalling(true);
    try {
      const result = await invoke<{ valid: boolean; detail: string; bot_username: string | null }>("validate_channel", { config: { channel_type: channelType, enabled: true, token: channelToken, target: channelTarget } });
      if (!result.valid) {
        addLog(`❌ Channel 验证失败: ${result.detail}`);
        setInstalling(false);
        return;
      }
      await invoke("save_channel_config", { config: { channel_type: channelType, enabled: true, token: channelToken, target: channelTarget } });
      addLog(`✅ ${t("log.channelSaved")}${result.bot_username ? ` (Bot: ${result.bot_username})` : ""}`);
      setSetupStep(5);
    } catch (e) { addLog(t("log.channelFail", { error: String(e) })); }
    finally { setInstalling(false); }
  };

  const runDiagnostics = async () => {
    setDiagRunning(true);
    try {
      // 1) Gateway: real /health probe
      let gatewayPass = false;
      let gatewayDetail = "";
      try {
        const health = await invoke<{ reachable: boolean; version: string | null; uptime: string | null; error: string | null }>("check_gateway_health");
        gatewayPass = health.reachable;
        gatewayDetail = health.reachable
          ? `在线${health.version ? ` v${health.version}` : ""}${health.uptime ? ` uptime=${health.uptime}` : ""}`
          : (health.error || "不可达");
      } catch (e) { gatewayDetail = `检查失败: ${e}`; }

      // 2) Channel: real API validation
      let channelPass = false;
      let channelDetail = "";
      if (!channelToken.trim()) {
        channelDetail = "未配置 Token";
      } else {
        try {
          const result = await invoke<{ valid: boolean; detail: string }>("validate_channel", {
            config: { channel_type: channelType, enabled: true, token: channelToken, target: channelTarget },
          });
          channelPass = result.valid;
          channelDetail = result.detail;
        } catch (e) { channelDetail = `验证失败: ${e}`; }
      }

      // 3) Agent: real test via gateway
      let agentPass = false;
      let agentDetail = "";
      try {
        const result = await invoke<{ reachable: boolean; responded: boolean; detail: string }>("test_agent");
        agentPass = result.responded;
        agentDetail = result.detail;
      } catch (e) { agentDetail = `测试失败: ${e}`; }

      setDiagResult({
        gateway: gatewayPass ? "pass" : "fail", gatewayDetail,
        channel: channelPass ? "pass" : "fail", channelDetail,
        agent: agentPass ? "pass" : "fail", agentDetail,
      });
      addLog(`诊断: gw=${gatewayPass ? "✅" : "❌"} ch=${channelPass ? "✅" : "❌"} agent=${agentPass ? "✅" : "❌"}`);
    } finally { setDiagRunning(false); }
  };

  const exportDiagnostics = async () => {
    setDiagRunning(true);
    try {
      const filePath = await invoke<string>("export_diagnostics");
      addLog(t("log.diagExported", { path: filePath }));
    } catch (e) { addLog(t("log.diagExportFail", { error: String(e) })); }
    finally { setDiagRunning(false); }
  };

  const finishWizard = () => setView("main");

  useEffect(() => { checkStatus(); loadConfig(); return () => { logUnlisten.current?.(); }; }, []);

  // Toolbar
  const Toolbar = () => (
    <div className="toolbar">
      <div className="theme-switcher">
        {(["light", "dark", "system"] as ThemeMode[]).map((m) => (
          <button key={m} className={`btn-icon ${themeMode === m ? "active" : ""}`} onClick={() => setThemeMode(m)} title={t(`theme.${m}`)}>
            {m === "light" ? "☀️" : m === "dark" ? "🌙" : "🖥️"}
          </button>
        ))}
      </div>
      <button className="btn-icon lang-btn" onClick={() => setLocale(locale === "zh" ? "en" : "zh")}>
        {t("lang.switch")}
      </button>
    </div>
  );

  // Wizard
  if (view === "wizard" && !loading) {
    return (
      <I18nContext.Provider value={{ locale, setLocale, t }}>
        <div className="app wizard">
          <header className="header">
            <Toolbar />
            <h1>{t("app.title")}</h1>
            <p className="subtitle">{t("wizard.title")}</p>
          </header>
          <main className="main">
            <div className="progress">
              {[1, 2, 3, 4, 5].map((step) => (
                <div key={step} className={`progress-step ${setupStep >= step ? "active" : ""}`}>
                  <span className="step-number">{step}</span>
                  <span className="step-label">{t(`wizard.step${step}`)}</span>
                </div>
              ))}
            </div>

            {setupStep === 1 && (
              <section className="wizard-step">
                <h2>{t("step1.title")}</h2>
                <div className="status-grid">
                  <div className={`status-item ${status?.node_installed || status?.embedded_node_ready ? "ok" : "error"}`}>
                    <span className="icon">{status?.node_installed || status?.embedded_node_ready ? "✅" : "❌"}</span>
                    <span className="label">{t("step1.nodejs")}</span>
                    <span className="value">{status?.node_version || (status?.embedded_node_ready ? t("step1.embeddedReady") : t("step1.notInstalled"))}</span>
                  </div>
                  <div className={`status-item ${status?.npm_installed ? "ok" : "error"}`}>
                    <span className="icon">{status?.npm_installed ? "✅" : "❌"}</span>
                    <span className="label">{t("step1.npm")}</span>
                    <span className="value">{status?.npm_version || t("step1.notInstalled")}</span>
                  </div>
                  <div className={`status-item ${status?.openclaw_installed ? "ok" : "error"}`}>
                    <span className="icon">{status?.openclaw_installed ? "✅" : "❌"}</span>
                    <span className="label">{t("step1.openclaw")}</span>
                    <span className="value">{status?.openclaw_version || t("step1.notInstalled")}</span>
                  </div>
                </div>
                <div className="button-group">
                  {!status?.node_installed && !status?.embedded_node_ready && (
                    <button className="btn btn-primary" onClick={setupEmbeddedNode} disabled={installing}>{installing ? t("step1.settingUp") : t("step1.setupEmbedded")}</button>
                  )}
                  {!status?.openclaw_installed && (status?.npm_installed || status?.embedded_node_ready) && (
                    <button className="btn btn-primary" onClick={installOpenClaw} disabled={installing}>{installing ? t("step1.installing") : t("step1.installOpenclaw")}</button>
                  )}
                  {!status?.npm_installed && !status?.embedded_node_ready && (
                    <button className="btn btn-secondary" onClick={persistWindowsPath} disabled={installing}>{installing ? t("step1.processing") : t("step1.fixPath")}</button>
                  )}
                  {status?.openclaw_installed && (
                    <button className="btn btn-success" onClick={() => setSetupStep(2)}>{t("step1.next")}</button>
                  )}
                </div>
              </section>
            )}

            {setupStep === 2 && (
              <section className="wizard-step">
                <h2>{t("step2.title")}</h2>
                <div className="form-group"><label>{t("step2.provider")}</label>
                  <select value={providerName} onChange={(e) => setProviderName(e.target.value)}>
                    <option value="anthropic">Anthropic</option><option value="openai">OpenAI</option><option value="custom">Custom</option>
                  </select>
                </div>
                <div className="form-group"><label>{t("step2.endpoint")}</label>
                  <select value={apiEndpoint} onChange={(e) => setApiEndpoint(e.target.value)}>
                    <option value="https://api.anthropic.com">Anthropic</option><option value="https://api.openai.com">OpenAI</option><option value="https://api.openrouter.ai/api/v1">OpenRouter</option>
                  </select>
                </div>
                <div className="form-group"><label>{t("step2.apiKey")}</label>
                  <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-ant-..." />
                  <small>{t("step2.apiKeyHint")}</small>
                </div>
                <div className="form-group"><label>{t("step2.model")}</label>
                  <select value={modelName} onChange={(e) => setModelName(e.target.value)}>
                    <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option><option value="claude-3-opus-20240229">Claude 3 Opus</option><option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
                  </select>
                </div>
                <div className="button-group">
                  <button className="btn btn-secondary" onClick={() => setSetupStep(1)}>{t("step2.prev")}</button>
                  <button className="btn btn-success" onClick={saveProviderConfig} disabled={installing || !apiKey.trim()}>{t("step2.saveNext")}</button>
                </div>
              </section>
            )}

            {setupStep === 3 && (
              <section className="wizard-step">
                <h2>{t("step3.title")}</h2>
                <div className="form-group"><label>{t("step3.name")}</label><input type="text" value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="default-assistant" /></div>
                <div className="form-group"><label>{t("step3.profile")}</label>
                  <select value={agentProfile} onChange={(e) => setAgentProfile(e.target.value)}>
                    <option value="general">{t("step3.profileGeneral")}</option><option value="safe">Safe</option><option value="builder">Builder</option>
                  </select>
                </div>
                <div className="form-group"><label>{t("step3.toolPolicy")}</label>
                  <select value={toolPolicy} onChange={(e) => setToolPolicy(e.target.value)}>
                    <option value="standard">Standard</option><option value="safe">Safe</option><option value="elevated">Elevated</option>
                  </select>
                </div>
                <div className="button-group">
                  <button className="btn btn-secondary" onClick={() => setSetupStep(2)}>{t("step2.prev")}</button>
                  <button className="btn btn-success" onClick={saveAgentConfig} disabled={installing || !agentName.trim()}>{t("step2.saveNext")}</button>
                </div>
              </section>
            )}

            {setupStep === 4 && (
              <section className="wizard-step">
                <h2>{t("step4.title")}</h2>
                <div className="form-group"><label>{t("step4.type")}</label>
                  <select value={channelType} onChange={(e) => setChannelType(e.target.value)}>
                    <option value="discord">Discord</option><option value="telegram">Telegram</option>
                  </select>
                </div>
                <div className="form-group"><label>{t("step4.token")}</label><input type="password" value={channelToken} onChange={(e) => setChannelToken(e.target.value)} placeholder="Bot token" /></div>
                <div className="form-group"><label>{t("step4.target")}</label><input type="text" value={channelTarget} onChange={(e) => setChannelTarget(e.target.value)} placeholder="channel id / user id" /></div>
                <div className="button-group">
                  <button className="btn btn-secondary" onClick={() => setSetupStep(3)}>{t("step2.prev")}</button>
                  <button className="btn btn-success" onClick={saveChannelConfig} disabled={installing || !channelToken.trim()}>{t("step2.saveNext")}</button>
                </div>
              </section>
            )}

            {setupStep === 5 && (
              <section className="wizard-step success">
                <div className="success-icon">🎉</div>
                <h2>{t("step5.title")}</h2>
                <p>{t("step5.ready")}</p>
                <p className="hint">{t("step5.hint")}</p>
                <ul style={{ textAlign: "left", margin: "10px auto", maxWidth: 360 }}>
                  <li>{providerConfigured ? "✅" : "❌"} {t("step5.providerConfig")}</li>
                  <li>{agentConfigured ? "✅" : "❌"} {t("step5.agentConfig")}</li>
                  <li>{channelConfigured ? "✅" : "❌"} {t("step5.channelConfig")}</li>
                </ul>
                <button className="btn btn-primary btn-large" onClick={finishWizard}>{t("step5.start")}</button>
              </section>
            )}
          </main>
        </div>
      </I18nContext.Provider>
    );
  }

  // Main view
  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      <div className="app">
        <header className="header">
          <Toolbar />
          <h1>{t("app.title")}</h1>
          <p className="subtitle">{t("app.subtitle")}</p>
        </header>
        <main className="main">
          {loading ? <p>{t("main.loading")}</p> : (
            <>
              <section className="status-panel">
                <h2>{t("main.systemStatus")}</h2>
                <div className="status-grid">
                  <div className={`status-item ${status?.node_installed || status?.embedded_node_ready ? "ok" : "error"}`}>
                    <span className="icon">{status?.node_installed || status?.embedded_node_ready ? "✅" : "❌"}</span>
                    <span className="label">{t("step1.nodejs")}</span>
                    <span className="value">{status?.node_version || (status?.embedded_node_ready ? t("main.embedded") : t("step1.notInstalled"))}</span>
                  </div>
                  <div className={`status-item ${status?.npm_installed ? "ok" : "error"}`}>
                    <span className="icon">{status?.npm_installed ? "✅" : "❌"}</span>
                    <span className="label">{t("step1.npm")}</span>
                    <span className="value">{status?.npm_version || t("step1.notInstalled")}</span>
                  </div>
                  <div className={`status-item ${status?.openclaw_installed ? "ok" : "error"}`}>
                    <span className="icon">{status?.openclaw_installed ? "✅" : "❌"}</span>
                    <span className="label">{t("step1.openclaw")}</span>
                    <span className="value">{status?.openclaw_version || t("step1.notInstalled")}</span>
                  </div>
                  <div className={`status-item ${status?.gateway_running ? "ok" : "error"}`}>
                    <span className="icon">{status?.gateway_running ? "🟢" : "⚪"}</span>
                    <span className="label">{t("main.gateway")}</span>
                    <span className="value">{status?.gateway_running ? `${t("main.running")} (:${status.gateway_port})` : t("main.stopped")}</span>
                  </div>
                </div>
              </section>

              <section className="action-panel">
                <h2>{t("main.actions")}</h2>
                <div className="button-group">
                  {!status?.openclaw_installed && (
                    <button className="btn btn-primary" onClick={installOpenClaw} disabled={installing || (!status?.npm_installed && !status?.embedded_node_ready)}>
                      {installing ? t("step1.installing") : t("step1.installOpenclaw")}
                    </button>
                  )}
                  {status?.openclaw_installed && !status?.gateway_running && (
                    <button className="btn btn-success" onClick={startGateway}>{t("main.startGateway")}</button>
                  )}
                  {status?.gateway_running && (
                    <>
                      <button className="btn btn-primary" onClick={openWebUI}>{t("main.openWebUI")}</button>
                      <button className="btn btn-danger" onClick={stopGateway}>{t("main.stopGateway")}</button>
                    </>
                  )}
                  <button className="btn btn-secondary" onClick={updateStatus === "available" ? performUpdate : checkUpdate} disabled={updateStatus === "checking"}>
                    {updateStatus === "checking" ? t("main.checking") :
                     updateStatus === "available" ? t("main.updateAvailable", { version: latestVersion }) :
                     updateStatus === "up-to-date" ? t("main.upToDate") :
                     updateStatus === "failed" ? t("main.updateFailed") :
                     t("main.checkUpdate")}
                  </button>
                </div>
              </section>

              <section className="status-panel">
                <h2>{t("main.validation")}</h2>
                <div className="button-group" style={{ marginBottom: 12 }}>
                  <button className="btn btn-secondary" onClick={runDiagnostics} disabled={diagRunning}>{diagRunning ? t("main.diagRunning") : t("main.runDiag")}</button>
                  <button className="btn btn-primary" onClick={exportDiagnostics} disabled={diagRunning}>{diagRunning ? t("main.diagRunning") : t("main.exportDiag")}</button>
                </div>
                <div className="status-grid">
                  {(["gateway", "channel", "agent"] as const).map((key) => {
                    const detailKey = `${key}Detail` as keyof typeof diagResult;
                    const detail = (diagResult[detailKey] as string) || "";
                    return (
                      <div key={key} className={`status-item ${diagResult[key] === "pass" ? "ok" : diagResult[key] === "fail" ? "error" : ""}`}>
                        <span className="icon">{diagResult[key] === "pass" ? "✅" : diagResult[key] === "fail" ? "❌" : "➖"}</span>
                        <span className="label">{key === "gateway" ? t("main.gateway") : key === "channel" ? "Channel" : "Agent"}</span>
                        <span className="value" title={detail}>{diagResult[key] === "unknown" ? "未检测" : detail || diagResult[key]}</span>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Gateway Log Stream */}
              <section className="log-panel">
                <h2>{t("main.gatewayLogs")}</h2>
                <div className="button-group" style={{ marginBottom: 12 }}>
                  {!logStreaming ? (
                    <button className="btn btn-success btn-sm" onClick={startLogStream}>{t("main.startLogStream")}</button>
                  ) : (
                    <button className="btn btn-danger btn-sm" onClick={stopLogStream}>{t("main.stopLogStream")}</button>
                  )}
                </div>
                <div className="log-container gateway-log" ref={gatewayLogRef}>
                  {gatewayLogs.length === 0 ? (
                    <p className="no-logs">{t("main.noLogs")}</p>
                  ) : (
                    gatewayLogs.map((log, i) => <div key={i} className="log-item">{log}</div>)
                  )}
                </div>
              </section>

              {/* App Logs */}
              <section className="log-panel">
                <h2>{t("main.logs")}</h2>
                <div className="log-container">
                  {logs.length === 0 ? (
                    <p className="no-logs">{t("main.noLogs")}</p>
                  ) : (
                    logs.map((log, i) => <div key={i} className="log-item">{log}</div>)
                  )}
                </div>
              </section>
            </>
          )}
        </main>
        <footer className="footer">
          <p>{t("app.version")}</p>
        </footer>
      </div>
    </I18nContext.Provider>
  );
}

export default App;
