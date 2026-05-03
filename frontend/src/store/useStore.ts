import { create } from "zustand";
import { persist } from "zustand/middleware";
import { MOCK_ACTIVE_RUN } from "@/lib/mockData";
import {
  RunStatuses,
  StepKinds,
  StepResults,
  emptyAppModel,
  type AppModel,
  type Bug,
  type ExecutionStep,
  type Run,
  type RunStatus,
  type StepKind,
  type TestCase,
} from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// useStore
//
// Live-display state: what the dashboard renders for whichever run is active
// right now. Owned exclusively by `useSessionStore`, which calls `hydrate()`
// when the user picks a run and `reset()` when they leave the dashboard.
//
// This store deliberately does NOT track run history, view, or active id —
// those are session concerns. Keeping them separate prevents render churn:
// switching tabs doesn't notify history-list subscribers, and vice versa.
// ─────────────────────────────────────────────────────────────────────────────

interface DisplayState {
  url: string;
  status: RunStatus;
  steps: ExecutionStep[];
  testCases: TestCase[];
  bugs: Bug[];
  appModel: AppModel;
  apiKey: string;
}

interface DisplayActions {
  setUrl(url: string): void;
  setStatus(status: RunStatus): void;
  setApiKey(key: string): void;
  hydrate(run: Run): void;
  reset(): void;
  pushStep(kind: StepKind, target: string, reason: string): void;
}

type DisplayStore = DisplayState & DisplayActions;

const initialFromActive = (): DisplayState => ({
  url: MOCK_ACTIVE_RUN.url,
  status: MOCK_ACTIVE_RUN.status,
  steps: MOCK_ACTIVE_RUN.snapshot.steps,
  testCases: MOCK_ACTIVE_RUN.snapshot.testCases,
  bugs: MOCK_ACTIVE_RUN.snapshot.bugs,
  appModel: MOCK_ACTIVE_RUN.snapshot.appModel,
  apiKey: "",
});

const emptyDisplay = (url = ""): DisplayState => ({
  url,
  status: RunStatuses.Queued,
  steps: [],
  testCases: [],
  bugs: [],
  appModel: { ...emptyAppModel(), startUrl: url },
  apiKey: "",
});

export const useStore = create<DisplayStore>()(
  persist(
    (set, get) => ({
      ...initialFromActive(),
      setUrl: (url) => set({ url }),
      setStatus: (status) => set({ status }),
      setApiKey: (key) => set({ apiKey: key }),
      hydrate: (run) =>
        set({
          url: run.url,
          status: run.status,
          steps: run.snapshot.steps,
          testCases: run.snapshot.testCases,
          bugs: run.snapshot.bugs,
          appModel: run.snapshot.appModel,
        }),
      reset: () => set(emptyDisplay()),
      pushStep: (kind, target, reason) => {
        const next = get().steps.length + 1;
        const step: ExecutionStep = {
          id: `live_s${next}_${Date.now()}`,
          step: next,
          kind,
          target,
          reason,
          result: Math.random() > 0.15 ? StepResults.Success : StepResults.Failure,
          detail: kind === StepKinds.Extract ? "discovered new entries" : undefined,
          timestamp: new Date().toISOString(),
        };
        set((s) => ({ steps: [...s.steps, step] }));
      },
    }),
    {
      name: "qa-engineer-storage", // This is the key in LocalStorage
    }
  )
);
