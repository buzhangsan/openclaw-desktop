interface WizardStepCompleteProps {
  providerConfigured: boolean;
  agentConfigured: boolean;
  channelConfigured: boolean;
  onFinish: () => void;
}

export function WizardStepComplete({
  providerConfigured,
  agentConfigured,
  channelConfigured,
  onFinish,
}: WizardStepCompleteProps) {
  return (
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

      <button className="btn btn-primary btn-large" onClick={onFinish}>
        开始使用 →
      </button>
    </section>
  );
}
