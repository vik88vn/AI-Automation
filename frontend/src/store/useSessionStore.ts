import { create } from "zustand";
import { MOCK_ACTIVE_RUN, MOCK_RUN_HISTORY } from "@/lib/mockData";
import { startRun as apiStartRun, subscribeToRun } from "@/lib/api";
import { routeAgentEvent } from "@/lib/eventRouter";
import {
  RunStatuses,
  Views,
  type Run,
  type RunStatus,
  type View,
} from "@/types";
import { useStore } from "./useStore";

// ─────────────────────────────────────────────────────────────────────────────
// useSessionStore — multi-session lifecycle.
//
// Owns: run history (Run[]), active run id, current view (Home or Dashboard),
// and the live SSE subscription. Coordinates with `useStore` (live-display)
// via `getState()` reads and `hydrate()` calls; coordinates with the backend
// via `lib/api`.
// ─────────────────────────────────────────────────────────────────────────────

interface SessionState {
  view: View;
  runs: Run[];                    // history, newest-first
  activeRunId: string | null;
  // Tracks any open SSE subscription so we can close it on session change.
  // Module-private — exposed via the store so getState() can reach it from
  // actions, but never read by components.
  _closeStream: (() => void) | null;
  // Surfaces backend-side failures (e.g. provider unhealthy) to UI.
  lastError: string | null;
}

interface SessionActions {
  goHome(): void;
  goToDashboard(): void;
  startNewRun(url: string): Promise<void>;
  selectRun(id: string): void;
  endActiveRun(status?: RunStatus): void;
  clearHistory(): void;
  clearError(): void;
}

type SessionStore = SessionState & SessionActions;

function snapshotActiveIntoHistory(
  runs: Run[],
  activeRunId: string | null
): Run[] {
  if (!activeRunId) return runs;
  const live = useStore.getState();
  return runs.map((r) =>
    r.id === activeRunId
      ? {
          ...r,
          status: live.status,
          url: live.url || r.url,
          snapshot: {
            steps: live.steps,
            testCases: live.testCases,
            bugs: live.bugs,
            appModel: live.appModel,
          },
        }
      : r
  );
}

function buildEmptyRun(id: string, url: string): Run {
  return {
    id,
    url,
    startedAt: new Date().toISOString(),
    endedAt: null,
    status: RunStatuses.Running,
    snapshot: {
      steps: [],
      testCases: [],
      bugs: [],
      appModel: {
        startUrl: url,
        routes: [],
        auth: {
          hasLogin: false,
          hasSignup: false,
          hasLogout: false,
          loggedIn: false,
          notes: "",
        },
        entities: [],
        flows: [],
        forms: [],
      },
    },
  };
}

const initialActiveRun: Run = MOCK_ACTIVE_RUN;
const initialHistory: Run[] = [initialActiveRun, ...MOCK_RUN_HISTORY];

export const useSessionStore = create<SessionStore>((set, get) => ({
  view: Views.Home,
  runs: initialHistory,
  activeRunId: initialActiveRun.id,
  _closeStream: null,
  lastError: null,

  goHome: () => {
    // Cancel any open stream — the user is leaving the dashboard.
    get()._closeStream?.();
    const { runs, activeRunId } = get();
    set({
      view: Views.Home,
      runs: snapshotActiveIntoHistory(runs, activeRunId),
      _closeStream: null,
    });
  },

  goToDashboard: () => set({ view: Views.Dashboard }),

  /**
   * Create a new run. Tries the backend first; if reachable, hooks the SSE
   * stream into the event router so live data flows in. If the backend is
   * down, falls back to a local-only run (mock-style) so the UI still works.
   */
  startNewRun: async (rawUrl) => {
    const url = rawUrl.trim();
    if (!url) return;

    // Close any prior stream BEFORE we touch state.
    get()._closeStream?.();

    const persisted = snapshotActiveIntoHistory(get().runs, get().activeRunId);

    // Optimistic local run — we'll swap the id once the backend confirms.
    const localId = `local_${Date.now()}`;
    const localRun = buildEmptyRun(localId, url);
    useStore.getState().hydrate(localRun);
    set({
      runs: [localRun, ...persisted],
      activeRunId: localId,
      view: Views.Dashboard,
      _closeStream: null,
      lastError: null,
    });

    // Attempt to start the run on the backend.
    let backendId: string | null = null;
    try {
      const resp = await apiStartRun({ url });
      backendId = resp.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Stay in local-only mode so the UI doesn't break — surface the error.
      set({
        lastError: `Backend unavailable — running in offline preview mode. ${message}`,
      });
      return;
    }

    // Backend accepted. Reconcile id and start streaming events.
    set((s) => ({
      runs: s.runs.map((r) =>
        r.id === localId ? { ...r, id: backendId! } : r
      ),
      activeRunId: backendId,
    }));

    // Session-level callbacks the router invokes on terminal events.
    // Passing them in keeps eventRouter from importing this store
    // (which would create a circular dependency).
    const routerCallbacks = {
      onError: (message: string) => set({ lastError: message }),
      onEnd: (finalStatus: RunStatus) => {
        const { runs, activeRunId } = get();
        if (!activeRunId) return;
        const synced = snapshotActiveIntoHistory(runs, activeRunId);
        set({
          runs: synced.map((r) =>
            r.id === activeRunId
              ? { ...r, status: finalStatus, endedAt: r.endedAt ?? new Date().toISOString() }
              : r
          ),
        });
      },
    };

    const close = subscribeToRun(backendId, {
      onEvent: (event) => routeAgentEvent(event, routerCallbacks),
      onDone: () => {
        // Final sync into history; status was set by `run_end` already.
        set((s) => ({
          runs: snapshotActiveIntoHistory(s.runs, s.activeRunId),
          _closeStream: null,
        }));
      },
      onError: () => {
        // EventSource auto-reconnects unless we close it; api.ts already
        // closes on error. We just clear the closer reference.
        set({ _closeStream: null });
      },
    });
    set({ _closeStream: close });
  },

  selectRun: (id) => {
    const { runs, activeRunId, _closeStream } = get();
    if (id === activeRunId) {
      set({ view: Views.Dashboard });
      return;
    }
    // Switching sessions — drop the active stream (the prior run keeps
    // streaming on the backend; we just stop displaying it).
    _closeStream?.();
    const persisted = snapshotActiveIntoHistory(runs, activeRunId);
    const target = persisted.find((r) => r.id === id);
    if (!target) return;

    useStore.getState().hydrate(target);
    set({
      runs: persisted,
      activeRunId: id,
      view: Views.Dashboard,
      _closeStream: null,
    });
  },

  endActiveRun: (status = RunStatuses.Completed) => {
    const { runs, activeRunId } = get();
    if (!activeRunId) return;
    const synced = snapshotActiveIntoHistory(runs, activeRunId);
    set({
      runs: synced.map((r) =>
        r.id === activeRunId
          ? { ...r, status, endedAt: r.endedAt ?? new Date().toISOString() }
          : r
      ),
    });
    useStore.getState().setStatus(status);
  },

  clearHistory: () => {
    const { activeRunId } = get();
    set((s) => ({
      runs: s.runs.filter((r) => r.id === activeRunId),
    }));
  },

  clearError: () => set({ lastError: null }),
}));

// Convenience selector hooks — single-purpose subscriptions.
export const useView = () => useSessionStore((s) => s.view);
export const useActiveRunId = () => useSessionStore((s) => s.activeRunId);
export const useRunHistory = () => useSessionStore((s) => s.runs);
export const useSessionError = () => useSessionStore((s) => s.lastError);
