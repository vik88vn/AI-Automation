import { create } from "zustand";
import { MOCK_ACTIVE_RUN, MOCK_RUN_HISTORY } from "@/lib/mockData";
import {
  RunStatuses,
  Views,
  type Run,
  type RunStatus,
  type View,
} from "@/types";
import { useStore } from "./useStore";

// ─────────────────────────────────────────────────────────────────────────────
// useSessionStore
//
// Owns the multi-session lifecycle:
//   - the in-memory run history (typed `Run[]`)
//   - the active run id
//   - the current `view` (Home or Dashboard)
//
// Coordinates with `useStore` (the live-display store) via getState() reads
// and direct hydrate/reset calls. The architectural rule: this store decides
// WHICH run is active; useStore decides WHAT the dashboard renders for that
// run. They never duplicate fields.
// ─────────────────────────────────────────────────────────────────────────────

interface SessionState {
  view: View;
  runs: Run[];                    // history, newest-first
  activeRunId: string | null;
}

interface SessionActions {
  // View transitions ------------------------------------------------
  goHome(): void;
  goToDashboard(): void;

  // Run lifecycle ---------------------------------------------------
  /**
   * Create a new run from a target URL, push the previously-active run's
   * snapshot to history (if any), hydrate the live store with an empty
   * shell, and transition to the Dashboard view.
   *
   * This is the single atomic action invoked by both the Home page's URL
   * input and the left sidebar's "New Run" button.
   */
  startNewRun(url: string): void;

  /**
   * Hydrate the dashboard with a historical run's snapshot.
   * Writes any in-progress live state back to the active run's history
   * entry first so we don't lose work when switching.
   */
  selectRun(id: string): void;

  /**
   * End the currently-active run, sync its final snapshot into history.
   * Status defaults to Completed; pass Failed when the agent errors out.
   */
  endActiveRun(status?: RunStatus): void;

  /** Wipe history (keeps the active run). */
  clearHistory(): void;
}

type SessionStore = SessionState & SessionActions;

// Snapshot the live useStore into a Run record.
// Pulled out so both `startNewRun` and `selectRun` use identical logic.
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

const initialActiveRun: Run = MOCK_ACTIVE_RUN;
const initialHistory: Run[] = [initialActiveRun, ...MOCK_RUN_HISTORY];

export const useSessionStore = create<SessionStore>((set, get) => ({
  view: Views.Home,
  runs: initialHistory,
  activeRunId: initialActiveRun.id,

  goHome: () => {
    // Persist current live state back to history before leaving the dashboard.
    const { runs, activeRunId } = get();
    set({
      view: Views.Home,
      runs: snapshotActiveIntoHistory(runs, activeRunId),
    });
  },

  goToDashboard: () => set({ view: Views.Dashboard }),

  startNewRun: (rawUrl) => {
    const url = rawUrl.trim();
    if (!url) return;

    const { runs, activeRunId } = get();
    const persisted = snapshotActiveIntoHistory(runs, activeRunId);

    const id = `run_${Date.now()}`;
    const newRun: Run = {
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

    // Hydrate the live store with the new (empty) run, then flip view.
    useStore.getState().hydrate(newRun);

    set({
      runs: [newRun, ...persisted],
      activeRunId: id,
      view: Views.Dashboard,
    });
  },

  selectRun: (id) => {
    const { runs, activeRunId } = get();
    if (id === activeRunId) {
      // Already active — just make sure we're on the dashboard.
      set({ view: Views.Dashboard });
      return;
    }
    const persisted = snapshotActiveIntoHistory(runs, activeRunId);
    const target = persisted.find((r) => r.id === id);
    if (!target) return;

    useStore.getState().hydrate(target);
    set({
      runs: persisted,
      activeRunId: id,
      view: Views.Dashboard,
    });
  },

  endActiveRun: (status = RunStatuses.Completed) => {
    const { runs, activeRunId } = get();
    if (!activeRunId) return;
    // Sync live state then flip the status.
    const synced = snapshotActiveIntoHistory(runs, activeRunId);
    set({
      runs: synced.map((r) =>
        r.id === activeRunId
          ? { ...r, status, endedAt: r.endedAt ?? new Date().toISOString() }
          : r
      ),
    });
    // Also reflect the status change in the live display.
    useStore.getState().setStatus(status);
  },

  clearHistory: () => {
    const { activeRunId } = get();
    set((s) => ({
      runs: s.runs.filter((r) => r.id === activeRunId),
    }));
  },
}));

// Convenience selector hooks — encourage single-purpose subscriptions so
// components don't re-render on unrelated state changes.
export const useView = () => useSessionStore((s) => s.view);
export const useActiveRunId = () => useSessionStore((s) => s.activeRunId);
export const useRunHistory = () => useSessionStore((s) => s.runs);
