import { create } from "zustand";
import {
  MOCK_BUGS,
  MOCK_RUNS,
  MOCK_STEPS,
  MOCK_TESTS,
  type Bug,
  type ExecutionStep,
  type RunStatus,
  type RunSummary,
  type StepKind,
  type TestCase,
} from "@/lib/mockData";

interface State {
  status: RunStatus;
  currentRunId: string | null;
  url: string;
  runsHistory: RunSummary[];
  steps: ExecutionStep[];
  testCases: TestCase[];
  bugs: Bug[];
}

interface Actions {
  setUrl: (url: string) => void;
  startRun: (url: string) => void;
  stopRun: () => void;
  selectRun: (id: string) => void;
  newRun: () => void;
  // Mock streaming — appends a synthetic step every tick to demo the live feel.
  pushStep: (kind: StepKind, target: string, reason: string) => void;
}

const initialRun = MOCK_RUNS[0];

export const useStore = create<State & Actions>((set, get) => ({
  status: initialRun?.status ?? "queued",
  currentRunId: initialRun?.id ?? null,
  url: initialRun?.url ?? "",
  runsHistory: MOCK_RUNS,
  steps: MOCK_STEPS,
  testCases: MOCK_TESTS,
  bugs: MOCK_BUGS,

  setUrl: (url) => set({ url }),

  startRun: (url) => {
    if (!url.trim()) return;
    const id = `run_${String(get().runsHistory.length + 1).padStart(3, "0")}`;
    const summary: RunSummary = {
      id,
      url,
      status: "running",
      startedAt: new Date().toISOString(),
      testCount: 0,
      bugCount: 0,
    };
    set((s) => ({
      currentRunId: id,
      status: "running",
      url,
      runsHistory: [summary, ...s.runsHistory],
      steps: [
        {
          id: `${id}_s1`,
          step: 1,
          kind: "navigate",
          target: url,
          reason: "Open the target URL.",
          result: "success",
          detail: "queued",
          timestamp: new Date().toISOString(),
        },
      ],
      testCases: [],
      bugs: [],
    }));
  },

  stopRun: () =>
    set((s) => ({
      status: "completed",
      runsHistory: s.runsHistory.map((r) =>
        r.id === s.currentRunId ? { ...r, status: "completed" as RunStatus } : r
      ),
    })),

  selectRun: (id) =>
    set((s) => {
      const run = s.runsHistory.find((r) => r.id === id);
      if (!run) return s;
      // For the mock we keep the same demo data; real wiring would fetch
      // the run's events / tests / bugs from the backend.
      return {
        currentRunId: id,
        status: run.status,
        url: run.url,
      };
    }),

  newRun: () =>
    set({
      currentRunId: null,
      status: "queued",
      url: "",
      steps: [],
      testCases: [],
      bugs: [],
    }),

  pushStep: (kind, target, reason) =>
    set((s) => {
      const next = s.steps.length + 1;
      const step: ExecutionStep = {
        id: `${s.currentRunId ?? "live"}_s${next}`,
        step: next,
        kind,
        target,
        reason,
        result: Math.random() > 0.15 ? "success" : "failure",
        detail: kind === "extract" ? "discovered new entries" : undefined,
        timestamp: new Date().toISOString(),
      };
      return { steps: [...s.steps, step] };
    }),
}));
