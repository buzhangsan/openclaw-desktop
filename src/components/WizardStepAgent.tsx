interface WizardStepAgentProps {
  agentName: string;
  setAgentName: (v: string) => void;
  agentProfile: string;
  setAgentProfile: (v: string) => void;
  toolPolicy: string;
  setToolPolicy: (v: string) => void;
  installing: boolean;
  onSave: () => void;
  onBack: () => void;
}

export function WizardStepAgent({
  agentName,
  setAgentName,
  agentProfile,
  setAgentProfile,
  toolPolicy,
  setToolPolicy,
  installing,
  onSave,
  onBack,
}: WizardStepAgentProps) {
  return (
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
        <button className="btn btn-secondary" onClick={onBack}>
          ← 上一步
        </button>
        <button className="btn btn-success" onClick={onSave} disabled={installing || !agentName.trim()}>
          保存并下一步
        </button>
      </div>
    </section>
  );
}
