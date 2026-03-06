import type { DiagResult } from "../types";

interface DiagnosticsPanelProps {
  diagResult: DiagResult;
  diagRunning: boolean;
  onRunDiagnostics: () => void;
  onExportDiagnostics: () => void;
}

const DIAG_KEYS = ["gateway", "channel", "agent"] as const;
const DETAIL_KEYS: Record<string, keyof DiagResult> = {
  gateway: "gatewayDetail",
  channel: "channelDetail",
  agent: "agentDetail",
};

export function DiagnosticsPanel({
  diagResult,
  diagRunning,
  onRunDiagnostics,
  onExportDiagnostics,
}: DiagnosticsPanelProps) {
  return (
    <section className="status-panel">
      <h2>验证中心</h2>
      <div className="button-group" style={{ marginBottom: 12 }}>
        <button className="btn btn-secondary" onClick={onRunDiagnostics} disabled={diagRunning}>
          {diagRunning ? "诊断中..." : "运行完整诊断"}
        </button>
        <button className="btn btn-primary" onClick={onExportDiagnostics} disabled={diagRunning}>
          {diagRunning ? "处理中..." : "导出诊断文件"}
        </button>
      </div>

      <div className="status-grid">
        {DIAG_KEYS.map((key) => {
          const detail = (diagResult[DETAIL_KEYS[key]] as string) || "";
          return (
            <div
              key={key}
              className={`status-item ${diagResult[key] === "pass" ? "ok" : diagResult[key] === "fail" ? "error" : ""}`}
            >
              <span className="icon">
                {diagResult[key] === "pass" ? "✅" : diagResult[key] === "fail" ? "❌" : "➖"}
              </span>
              <span className="label">{key.charAt(0).toUpperCase() + key.slice(1)}</span>
              <span className="value" title={detail}>
                {diagResult[key] === "unknown"
                  ? "未检测"
                  : detail || diagResult[key]}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
