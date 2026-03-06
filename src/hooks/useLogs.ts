import { useState, useCallback } from "react";

export function useLogs() {
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-50), `[${time}] ${msg}`]);
  }, []);

  return { logs, addLog };
}
