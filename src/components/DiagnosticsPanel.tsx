import type { DiagResult } from "../types";

interface DiagnosticsPanelProps {
  diagResult: DiagResult;
  diagRunning: boolean;
  onRunDiagnostics: () => void;
  onExportDiagnostics: () => void;
}

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
        {(["gateway", "channel", "agent"] as const).map((key) => (
          <div
            key={key}
            className={`status-item ${diagResult[key] === "pass" ? "ok" : diagResult[key] === "fail" ? "error" : ""}`}
          >
            <span className="icon">
              {diagResult[key] === "pass" ? "✅" : diagResult[key] === "fail" ? "❌" : "➖"}
            </span>
            <span className="label">{key.charAt(0).toUpperCase() + key.slice(1)}</span>
            <span className="value">{diagResult[key]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
