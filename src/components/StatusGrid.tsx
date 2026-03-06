import type { SystemStatus } from "../types";

interface StatusGridProps {
  status: SystemStatus | null;
  showGateway?: boolean;
}

export function StatusGrid({ status, showGateway = false }: StatusGridProps) {
  return (
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
      {showGateway && (
        <div className={`status-item ${status?.gateway_running ? "ok" : "error"}`}>
          <span className="icon">{status?.gateway_running ? "🟢" : "⚪"}</span>
          <span className="label">Gateway</span>
          <span className="value">
            {status?.gateway_running ? `运行中 (:${status.gateway_port})` : "已停止"}
          </span>
        </div>
      )}
    </div>
  );
}
