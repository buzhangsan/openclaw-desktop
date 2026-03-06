interface WizardStepChannelProps {
  channelType: string;
  setChannelType: (v: string) => void;
  channelToken: string;
  setChannelToken: (v: string) => void;
  channelTarget: string;
  setChannelTarget: (v: string) => void;
  installing: boolean;
  onSave: () => void;
  onBack: () => void;
}

export function WizardStepChannel({
  channelType,
  setChannelType,
  channelToken,
  setChannelToken,
  channelTarget,
  setChannelTarget,
  installing,
  onSave,
  onBack,
}: WizardStepChannelProps) {
  return (
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
        <button className="btn btn-secondary" onClick={onBack}>
          ← 上一步
        </button>
        <button className="btn btn-success" onClick={onSave} disabled={installing || !channelToken.trim()}>
          保存并下一步
        </button>
      </div>
    </section>
  );
}
