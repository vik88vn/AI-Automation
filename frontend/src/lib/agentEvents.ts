// ─────────────────────────────────────────────────────────────────────────────
// Backend agent event shapes — mirrors src/agent/types.ts on the backend.
// Defined separately from the frontend's domain types because the wire
// format is the agent's, not the dashboard's. The eventRouter is the
// translation layer.
// ─────────────────────────────────────────────────────────────────────────────

export type AgentEventType =
  | "run_start"
  | "step_start"
  | "tool_call"
  | "tool_result"
  | "model_update"
  | "test_added"
  | "test_started"
  | "test_passed"
  | "test_failed"
  | "test_retry"
  | "bug_reported"
  | "test_issue_identified"
  | "corrected_test_generated"
  | "analysis_complete"
  | "log"
  | "run_end"
  | "run_error";

export interface AgentEvent {
  type: AgentEventType;
  timestamp: string;
  step: number;
  // Payload shape varies by event type. Treated as `unknown` here; the
  // router narrows per-case.
  payload: Record<string, unknown>;
}

export type BackendToolName =
  | "browser_action"
  | "record_observation"
  | "add_test"
  | "run_test"
  | "report_bug"
  | "finish";

export type BackendBrowserAction =
  | "navigate"
  | "click"
  | "type"
  | "extract"
  | "screenshot";

export interface BackendToolCallPayload {
  id: string;
  name: BackendToolName;
  input: Record<string, unknown>;
}

export interface BackendToolResultPayload {
  id: string;
  name: BackendToolName;
  payload: { ok?: boolean; error?: string; data?: unknown; durationMs?: number; url?: string };
}

export interface BackendTest {
  id: string;
  title: string;
  type: string;
  priority: "high" | "medium" | "low";
  status: "queued" | "running" | "passed" | "failed";
  attempts: number;
  expected?: string;
  lastError?: string;
}

export interface BackendBug {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  impact?: string;
  reproSteps?: string[];
  expected?: string;
  actual?: string;
  url?: string;
  testId?: string;
}
