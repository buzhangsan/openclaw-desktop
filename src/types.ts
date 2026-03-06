export interface SystemStatus {
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

export interface ProviderConfig {
  provider: string;
  endpoint: string;
  model: string;
  api_key: string;
}

export interface AgentConfig {
  name: string;
  profile: string;
  tool_policy: string;
}

export interface ChannelConfig {
  channel_type: string;
  enabled: boolean;
  token: string;
  target: string;
}

export interface DesktopConfig {
  provider?: ProviderConfig;
  agent?: AgentConfig;
  channels: ChannelConfig[];
}

export type AppView = "wizard" | "main";

export type DiagStatus = "unknown" | "pass" | "fail";

export interface DiagResult {
  gateway: DiagStatus;
  gatewayDetail?: string;
  channel: DiagStatus;
  channelDetail?: string;
  agent: DiagStatus;
  agentDetail?: string;
}

export interface GatewayHealthInfo {
  reachable: boolean;
  status_code: number | null;
  version: string | null;
  uptime: string | null;
  body_snippet: string | null;
  error: string | null;
}

export interface ChannelValidationResult {
  valid: boolean;
  detail: string;
  bot_username: string | null;
}

export interface AgentTestResult {
  reachable: boolean;
  responded: boolean;
  detail: string;
  response_snippet: string | null;
}
