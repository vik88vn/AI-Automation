import { create } from "zustand";
import { persist } from "zustand/middleware";
import { MOCK_ACTIVE_RUN } from "@/lib/mockData";
import {
  RunStatuses,
  StepKinds,
  StepResults,
  emptyAppModel,
  type AppModel,
  type AppModelAuth,
  type AppModelEntity,
  type AppModelFlow,
  type AppModelForm,
  type AppModelRoute,
  type Bug,
  type ExecutionStep,
  type Run,
  type RunStatus,
  type StepKind,
  type StepResult,
  type TestCase,
} from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// useStore — live-display state.
//
// What the dashboard renders for whichever run is active right now. Owned by
// `useSessionStore`, which calls `hydrate()` when the user picks a run and
// `reset()` when they leave the dashboard. The event router (`lib/eventRouter`)
// drives the granular actions when SSE events arrive from the backend.
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
  // Bulk
  hydrate(run: Run): void;
  reset(): void;

  // Top-level setters
  setUrl(url: string): void;
  setStatus(status: RunStatus): void;
  setApiKey(key: string): void;

  // Granular event-driven actions
  addStep(step: ExecutionStep): void;
  updateLastStepResult(result: StepResult, detail?: string): void;
  addOrUpdateTest(test: TestCase): void;
  addBug(bug: Bug): void;
  mergeAppModelEntry(
    domain: "routes" | "auth" | "entities" | "flows" | "forms",
    entry: unknown
  ): void;

  // Mock-mode passthrough kept for back-compat with the prototype.
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

      // ── Bulk ──────────────────────────────────────────────────────────────
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

      // ── Setters ───────────────────────────────────────────────────────────
      setUrl: (url) => set({ url }),
      setStatus: (status) => set({ status }),
      setApiKey: (key) => set({ apiKey: key }),

      // ── Event-driven granular actions ─────────────────────────────────────
      addStep: (step) => set((s) => ({ steps: [...s.steps, step] })),

      updateLastStepResult: (result, detail) =>
        set((s) => {
          if (s.steps.length === 0) return s;
          const last = s.steps[s.steps.length - 1];
          const updated: ExecutionStep = {
            ...last,
            result,
            detail: detail ?? last.detail,
          };
          return { steps: [...s.steps.slice(0, -1), updated] };
        }),

      addOrUpdateTest: (test) =>
        set((s) => {
          const idx = s.testCases.findIndex((t) => t.id === test.id);
          if (idx === -1) return { testCases: [...s.testCases, test] };
          const next = s.testCases.slice();
          next[idx] = { ...next[idx], ...test };
          return { testCases: next };
        }),

      addBug: (bug) =>
        set((s) => {
          // Idempotent — same bug id is a no-op (analyzer + agent can both report).
          if (s.bugs.some((b) => b.id === bug.id)) return s;
          return { bugs: [...s.bugs, bug] };
        }),

      mergeAppModelEntry: (domain, entry) =>
        set((s) => {
          const m = s.appModel;
          switch (domain) {
            case "routes": {
              const r = entry as AppModelRoute;
              const idx = m.routes.findIndex((x) => x.url === r.url);
              const routes =
                idx === -1
                  ? [...m.routes, r]
                  : m.routes.map((x, i) => (i === idx ? { ...x, ...r } : x));
              return { appModel: { ...m, routes } };
            }
            case "auth": {
              const a = entry as Partial<AppModelAuth>;
              return { appModel: { ...m, auth: { ...m.auth, ...a } } };
            }
            case "entities": {
              const e = entry as AppModelEntity;
              const idx = m.entities.findIndex((x) => x.name === e.name);
              const entities =
                idx === -1
                  ? [...m.entities, e]
                  : m.entities.map((x, i) => (i === idx ? { ...x, ...e } : x));
              return { appModel: { ...m, entities } };
            }
            case "flows": {
              const f = entry as AppModelFlow;
              const idx = m.flows.findIndex((x) => x.name === f.name);
              const flows =
                idx === -1
                  ? [...m.flows, f]
                  : m.flows.map((x, i) => (i === idx ? { ...x, ...f } : x));
              return { appModel: { ...m, flows } };
            }
            case "forms": {
              const f = entry as AppModelForm;
              const idx = m.forms.findIndex(
                (x) => x.url === f.url && x.selector === f.selector
              );
              const forms =
                idx === -1
                  ? [...m.forms, f]
                  : m.forms.map((x, i) => (i === idx ? { ...x, ...f } : x));
              return { appModel: { ...m, forms } };
            }
            default:
              return s;
          }
        }),

      // ── Mock pushStep — kept for the offline prototype path ────────────────
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
      name: "qa-engineer-storage",
      partialize: (s) => ({ apiKey: s.apiKey }),
    }
  )
);
