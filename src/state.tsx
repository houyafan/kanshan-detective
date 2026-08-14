import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import type { CaseConfig, RunState } from "./types";

interface AppContextValue {
  caseConfig: CaseConfig | null;
  run: RunState | null;
  loading: boolean;
  error: string | null;
  toast: string | null;
  setToast: (message: string | null) => void;
  createRun: () => Promise<RunState>;
  startRun: () => Promise<RunState>;
  refreshRun: () => Promise<void>;
  updateRun: (state: RunState) => void;
  completeTask: (taskId: string, payload: Record<string, unknown>) => Promise<RunState>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [caseConfig, setCaseConfig] = useState<CaseConfig | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        const config = await api.case();
        if (!active) return;
        setCaseConfig(config);
        const activeRunId = localStorage.getItem("kanshan_active_run");
        if (activeRunId) {
          try {
            const currentRun = await api.getRun(activeRunId);
            if (active) setRun(currentRun);
          } catch {
            localStorage.removeItem("kanshan_active_run");
          }
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "案件加载失败");
      } finally {
        if (active) setLoading(false);
      }
    }
    void bootstrap();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const createRun = useCallback(async () => {
    const created = await api.createRun();
    localStorage.setItem("kanshan_active_run", created.runId);
    setRun(created);
    return created;
  }, []);

  const startRun = useCallback(async () => {
    if (!run) throw new Error("尚未接案");
    const started = await api.startRun(run.runId);
    setRun(started);
    return started;
  }, [run]);

  const refreshRun = useCallback(async () => {
    if (!run) return;
    setRun(await api.getRun(run.runId));
  }, [run]);

  const completeTask = useCallback(
    async (taskId: string, payload: Record<string, unknown>) => {
      if (!run) throw new Error("尚未接案");
      const updated = await api.completeTask(run.runId, taskId, payload);
      setRun(updated);
      return updated;
    },
    [run]
  );

  const value = useMemo(
    () => ({
      caseConfig,
      run,
      loading,
      error,
      toast,
      setToast,
      createRun,
      startRun,
      refreshRun,
      updateRun: setRun,
      completeTask
    }),
    [caseConfig, run, loading, error, toast, createRun, startRun, refreshRun, completeTask]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used within AppProvider");
  return value;
}
