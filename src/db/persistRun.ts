// Persist a completed agent run (run + bugs + test cases) to the database.
//
// Called after a run finishes when a projectId/userId context is supplied
// (i.e. the run was started by an authenticated SaaS user against one of their
// projects). For anonymous/dashboard runs this is simply skipped.

import { prisma } from "./client.js";
import {
  type Severity as PrismaSeverity,
  type BugType as PrismaBugType,
  type RunStatus,
} from "@prisma/client";
import type { AgentRunResult, BugReport, TestCase, Severity, BugType } from "../agent/types.js";

// Map the agent's lowercase severity to the Prisma enum.
function mapSeverity(s: Severity): PrismaSeverity {
  return s.toUpperCase() as PrismaSeverity;
}

// Map the agent's BugType (lowercase) to the Prisma enum, defaulting to OTHER.
const BUG_TYPE_MAP: Record<BugType, PrismaBugType> = {
  network_error: "NETWORK_ERROR",
  authentication: "AUTHENTICATION",
  race_condition: "RACE_CONDITION",
  performance: "PERFORMANCE",
  validation_gap: "VALIDATION_GAP",
  accessibility: "ACCESSIBILITY",
  security: "SECURITY",
  seo: "SEO",
};
function mapBugType(t: BugType | undefined): PrismaBugType {
  return (t && BUG_TYPE_MAP[t]) || "OTHER";
}

export interface PersistRunInput {
  projectId: string;
  userId: string;
  url: string;
  result: AgentRunResult;
  provider?: string;
  model?: string;
  status?: RunStatus;
}

// Returns the created run id. Throws if the project doesn't exist (FK).
export async function persistRun(input: PersistRunInput): Promise<string> {
  const { result } = input;
  const tests = result.tests ?? [];
  const bugs = result.bugs ?? [];

  const passed = tests.filter((t: TestCase) => t.status === "passed").length;
  const failed = tests.filter((t: TestCase) => t.status === "failed").length;

  const run = await prisma.run.create({
    data: {
      projectId: input.projectId,
      userId: input.userId,
      url: input.url,
      status: input.status ?? (result.ok ? "COMPLETED" : "FAILED"),
      provider: input.provider ?? null,
      model: input.model ?? null,
      endedAt: new Date(),
      testsTotal: tests.length,
      testsPassed: passed,
      testsFailed: failed,
      // Nested create for bugs + test cases in a single transaction.
      bugs: {
        create: bugs.map((b: BugReport) => ({
          title: b.title,
          description: b.impact || b.title,
          severity: mapSeverity(b.severity),
          type: mapBugType(b.type),
          reproSteps: b.reproSteps ?? [],
          expected: b.expected ?? "",
          actual: b.actual ?? "",
          url: b.url ?? input.url,
          // evidence is stored as JSON; cast through unknown for Prisma.Json.
          evidence: (b.evidence ?? undefined) as object | undefined,
          screenshot: b.screenshot ?? null,
        })),
      },
      testCases: {
        create: tests
          .filter((t: TestCase) => t.status === "passed" || t.status === "failed")
          .map((t: TestCase) => ({
            title: t.title,
            steps: t.steps.map((s) => `${s.action} ${s.target}${s.value ? ` = ${s.value}` : ""}`),
            status: t.status === "passed" ? ("PASSED" as const) : ("FAILED" as const),
          })),
      },
    },
  });

  return run.id;
}
