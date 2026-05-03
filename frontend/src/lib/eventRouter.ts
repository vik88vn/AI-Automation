// ─────────────────────────────────────────────────────────────────────────────
// eventRouter — backend AgentEvent → frontend store mutations.
//
// Translates the wire format into the dashboard's data model. Lives here so
// UI components stay decoupled from the agent's event shapes; they just
// subscribe to store fields.
//
// Architecture: this module deliberately does NOT import `useSessionStore`.
// Session-level effects (lastError, endActiveRun) are passed in by the
// caller as `RouterCallbacks`. That keeps the dependency graph one-way:
//
//     useSessionStore  ──uses──►  eventRouter  ──uses──►  useStore
//
// (previously useSessionStore ↔ eventRouter were a cycle — broken now)
// ─────────────────────────────────────────────────────────────────────────────

import { useStore } from "@/store/useStore";
import {
  RunStatuses,
  StepKinds,
  StepResults,
  Severities,
  type ExecutionStep,
  type RunStatus,
  type StepKind,
  type TestCase,
  type Bug,
} from "@/types";
import type {
  AgentEvent,
  BackendBrowserAction,
  BackendBug,
  BackendTest,
  BackendToolCallPayload,
  BackendToolResultPayload,
} from "./agentEvents";

// Session-level callbacks invoked by terminal events. Owner (the session
// store) supplies these at subscription time so this module stays
// store-agnostic.
export interface RouterCallbacks {
  onError(message: string): void;
  onEnd(status: RunStatus): void;
}

// ── Map backend tool calls onto the frontend's StepKind enum ──────────────
const BROWSER_ACTION_TO_KIND: Record<BackendBrowserAction, StepKind> = {
  navigate: StepKinds.Navigate,
  click: StepKinds.Click,
  type: StepKinds.Type,
  extract: StepKinds.Extract,
  screenshot: StepKinds.Screenshot,
};

function buildStep(stepNumber: number, payload: BackendToolCallPayload, timestamp: string): ExecutionStep | null {
  const id = `live_${stepNumber}_${Date.now()}`;
  const base = {
    id,
    step: stepNumber,
    timestamp,
    // Optimistic — `tool_result` will downgrade to failure if needed.
    result: StepResults.Success,
  };

  const input = payload.input ?? {};
  const reason = typeof input.reason === "string" ? input.reason : "";

  switch (payload.name) {
    case "browser_action": {
      const action = input.action as BackendBrowserAction | undefined;
      const target = typeof input.target === "string" ? input.target : "";
      const value = typeof input.value === "string" ? input.value : undefined;
      if (!action || !(action in BROWSER_ACTION_TO_KIND)) return null;
      return {
        ...base,
        kind: BROWSER_ACTION_TO_KIND[action],
        target,
        reason,
        detail: value !== undefined ? `value="${value}"` : undefined,
      };
    }
    case "record_observation": {
      const domain = typeof input.domain === "string" ? input.domain : "?";
      return {
        ...base,
        kind: StepKinds.RecordObservation,
        target: domain,
        reason,
        detail: previewJson(input.data),
      };
    }
    case "add_test": {
      const title = typeof input.title === "string" ? input.title : "untitled test";
      const type = typeof input.type === "string" ? input.type : "smoke";
      const priority = typeof input.priority === "string" ? input.priority : "medium";
      return {
        ...base,
        kind: StepKinds.AddTest,
        target: title,
        reason,
        detail: `${type} · ${priority}`,
      };
    }
    case "run_test": {
      const id = typeof input.test_id === "string" ? input.test_id : "?";
      return {
        ...base,
        kind: StepKinds.RunTest,
        target: id,
        reason,
      };
    }
    case "report_bug": {
      const title = typeof input.title === "string" ? input.title : "untitled bug";
      const severity = typeof input.severity === "string" ? input.severity : "medium";
      return {
        ...base,
        kind: StepKinds.ReportBug,
        target: title,
        reason,
        detail: `severity=${severity}`,
      };
    }
    case "finish": {
      const summary = typeof input.summary === "string" ? input.summary : "finished";
      return {
        ...base,
        kind: StepKinds.Finish,
        target: summary.slice(0, 80),
        reason,
      };
    }
    default:
      return null;
  }
}

function previewJson(value: unknown, max = 100): string {
  try {
    const s = JSON.stringify(value);
    return s.length > max ? s.slice(0, max) + "…" : s;
  } catch {
    return "";
  }
}

// ── Coerce backend tests/bugs into frontend types ─────────────────────────
function toFrontendTest(t: BackendTest): TestCase {
  return {
    id: t.id,
    title: t.title,
    type: (t.type as TestCase["type"]) ?? "smoke",
    priority: (t.priority as TestCase["priority"]) ?? "medium",
    status: (t.status as TestCase["status"]) ?? "queued",
    attempts: t.attempts ?? 0,
    expected: t.expected ?? "",
  };
}

function toFrontendBug(b: BackendBug): Bug {
  return {
    id: b.id,
    title: b.title,
    severity: (b.severity as Bug["severity"]) ?? Severities.Medium,
    description: b.impact ?? "",
    reproSteps: b.reproSteps ?? [],
    expected: b.expected ?? "",
    actual: b.actual ?? "",
    testId: b.testId,
    url: b.url ?? "",
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Main entry — single switch over event types. Side-effects only.
// ──────────────────────────────────────────────────────────────────────────
export function routeAgentEvent(event: AgentEvent, callbacks: RouterCallbacks): void {
  const store = useStore.getState();

  switch (event.type) {
    case "run_start":
      store.setStatus(RunStatuses.Running);
      break;

    case "tool_call": {
      const p = event.payload as unknown as BackendToolCallPayload;
      const step = buildStep(event.step, p, event.timestamp);
      if (step) store.addStep(step);
      break;
    }

    case "tool_result": {
      const p = event.payload as unknown as BackendToolResultPayload;
      const ok = p.payload?.ok !== false;
      const result = ok ? StepResults.Success : StepResults.Failure;
      const detail = p.payload?.error
        ? p.payload.error.slice(0, 160)
        : describeToolResult(p);
      store.updateLastStepResult(result, detail);
      break;
    }

    case "model_update": {
      const domain = (event.payload.domain ?? "") as
        | "routes"
        | "auth"
        | "entities"
        | "flows"
        | "forms";
      if (
        domain === "routes" ||
        domain === "auth" ||
        domain === "entities" ||
        domain === "flows" ||
        domain === "forms"
      ) {
        store.mergeAppModelEntry(domain, event.payload.entry);
      }
      break;
    }

    case "test_added":
    case "test_started":
    case "test_passed":
    case "test_failed":
    case "test_retry": {
      const test = event.payload.test as BackendTest | undefined;
      if (test) store.addOrUpdateTest(toFrontendTest(test));
      break;
    }

    case "bug_reported": {
      const bug = event.payload.bug as BackendBug | undefined;
      if (bug) store.addBug(toFrontendBug(bug));
      break;
    }

    case "analysis_complete":
      // Could surface a banner with summary in a future iteration.
      break;

    case "run_end": {
      const ok = event.payload.ok !== false;
      const finalStatus = ok ? RunStatuses.Completed : RunStatuses.Failed;
      store.setStatus(finalStatus);
      const stoppedReason =
        typeof event.payload.stoppedReason === "string"
          ? event.payload.stoppedReason
          : "";
      if (!ok || /^(error|provider_unhealthy)/i.test(stoppedReason)) {
        callbacks.onError(stoppedReason || "Run failed (no reason provided)");
      }
      callbacks.onEnd(finalStatus);
      break;
    }

    case "run_error": {
      const message =
        typeof event.payload.error === "string"
          ? event.payload.error
          : "Unknown agent error";
      callbacks.onError(message);
      store.setStatus(RunStatuses.Failed);
      callbacks.onEnd(RunStatuses.Failed);
      break;
    }

    case "step_start":
    case "log":
    case "test_issue_identified":
    case "corrected_test_generated":
    default:
      // No-op: feed already updates from tool_call/result; banners TBD.
      break;
  }
}

function describeToolResult(p: BackendToolResultPayload): string | undefined {
  const data = p.payload?.data as Record<string, unknown> | undefined;
  if (!data) {
    if (typeof p.payload?.url === "string") return p.payload.url;
    return undefined;
  }
  const status = data.status;
  const finalUrl = data.finalUrl;
  if (status && finalUrl) return `${status} · ${finalUrl}`;
  if (data.headings || data.links) {
    const h = (data.headings as unknown[] | undefined)?.length ?? 0;
    const l = (data.links as unknown[] | undefined)?.length ?? 0;
    const f = (data.forms as unknown[] | undefined)?.length ?? 0;
    return `headings=${h} · links=${l} · forms=${f}`;
  }
  return previewJson(data, 120);
}
