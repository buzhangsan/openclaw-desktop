import type { SystemStatus } from "../types";
import { StatusGrid } from "./StatusGrid";

interface WizardStepEnvProps {
  status: SystemStatus | null;
  installing: boolean;
  onSetupEmbeddedNode: () => void;
  onInstallOpenClaw: () => void;
  onPersistWindowsPath: () => void;
  onNext: () => void;
}

export function WizardStepEnv({
  status,
  installing,
  onSetupEmbeddedNode,
  onInstallOpenClaw,
  onPersistWindowsPath,
  onNext,
}: WizardStepEnvProps) {
  return (
    <section className="wizard-step">
      <h2>步骤 1: 环境检测</h2>
      <StatusGrid status={status} />
      <div className="button-group">
        {!status?.node_installed && !status?.embedded_node_ready && (
          <button className="btn btn-primary" onClick={onSetupEmbeddedNode} disabled={installing}>
            {installing ? "设置中..." : "设置内嵌 Node.js"}
          </button>
        )}
        {!status?.openclaw_installed && (status?.npm_installed || status?.embedded_node_ready) && (
          <button className="btn btn-primary" onClick={onInstallOpenClaw} disabled={installing}>
            {installing ? "安装中..." : "安装 OpenClaw"}
          </button>
        )}
        {!status?.npm_installed && !status?.embedded_node_ready && (
          <button className="btn btn-secondary" onClick={onPersistWindowsPath} disabled={installing}>
            {installing ? "处理中..." : "修复 PATH（Windows）"}
          </button>
        )}
        {status?.openclaw_installed && (
          <button className="btn btn-success" onClick={onNext}>
            下一步 →
          </button>
        )}
      </div>
    </section>
  );
}
