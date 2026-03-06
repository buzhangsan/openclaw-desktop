interface WizardStepProviderProps {
  providerName: string;
  setProviderName: (v: string) => void;
  apiEndpoint: string;
  setApiEndpoint: (v: string) => void;
  apiKey: string;
  setApiKey: (v: string) => void;
  modelName: string;
  setModelName: (v: string) => void;
  modelOptions: { value: string; label: string }[];
  installing: boolean;
  onSave: () => void;
  onBack: () => void;
}

export function WizardStepProvider({
  providerName,
  setProviderName,
  apiEndpoint,
  setApiEndpoint,
  apiKey,
  setApiKey,
  modelName,
  setModelName,
  modelOptions,
  installing,
  onSave,
  onBack,
}: WizardStepProviderProps) {
  return (
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
          {modelOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="button-group">
        <button className="btn btn-secondary" onClick={onBack}>
          ← 上一步
        </button>
        <button className="btn btn-success" onClick={onSave} disabled={installing || !apiKey.trim()}>
          保存并下一步
        </button>
      </div>
    </section>
  );
}
