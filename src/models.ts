// Model definitions per provider — dynamically selected based on provider choice
// Task #13: This replaces hardcoded model options. In future, these can be
// fetched from provider APIs at runtime.

export interface ModelOption {
  value: string;
  label: string;
}

const PROVIDER_MODELS: Record<string, ModelOption[]> = {
  anthropic: [
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
    { value: "claude-3-opus-20240229", label: "Claude 3 Opus" },
    { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku" },
  ],
  openai: [
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
    { value: "o1", label: "o1" },
    { value: "o3-mini", label: "o3-mini" },
  ],
  custom: [
    { value: "custom", label: "自定义模型（手动输入）" },
  ],
};

const DEFAULT_ENDPOINTS: Record<string, string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com",
  custom: "",
};

export function getModelsForProvider(provider: string): ModelOption[] {
  return PROVIDER_MODELS[provider] ?? PROVIDER_MODELS.custom;
}

export function getDefaultEndpoint(provider: string): string {
  return DEFAULT_ENDPOINTS[provider] ?? "";
}

export function getDefaultModel(provider: string): string {
  const models = getModelsForProvider(provider);
  return models[0]?.value ?? "";
}
