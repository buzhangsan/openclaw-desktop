interface LogPanelProps {
  logs: string[];
}

export function LogPanel({ logs }: LogPanelProps) {
  return (
    <section className="log-panel">
      <h2>日志</h2>
      <div className="log-container">
        {logs.length === 0 ? (
          <p className="no-logs">暂无日志</p>
        ) : (
          logs.map((log, i) => <div key={i} className="log-item">{log}</div>)
        )}
      </div>
    </section>
  );
}
