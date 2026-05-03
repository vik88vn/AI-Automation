import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  Bug,
  ExplorationResult,
  QAReport,
  Severity,
  TestCase,
  TestResult,
} from "../types.js";
import { Logger } from "../utils/logger.js";

export interface ReporterOptions {
  reportDir?: string;
}

export interface WrittenReport {
  report: QAReport;
  reportDir: string;
  jsonPath: string;
  markdownPath: string;
}

export class ReportGenerator {
  private readonly reportDir: string;
  private readonly log = new Logger("reporter");

  constructor(opts: ReporterOptions = {}) {
    this.reportDir = opts.reportDir ?? "./reports";
  }

  async generate(args: {
    url: string;
    exploration: ExplorationResult;
    testCases: TestCase[];
    results: TestResult[];
    durationMs: number;
  }): Promise<WrittenReport> {
    const passed = args.results.filter((r) => r.status === "PASS").length;
    const failed = args.results.length - passed;
    const passRate = args.results.length > 0 ? passed / args.results.length : 0;

    const bugs = args.results.filter((r) => r.status === "FAIL").map((r) => this.toBug(r, args.testCases));

    const report: QAReport = {
      url: args.url,
      timestamp: new Date().toISOString(),
      durationMs: args.durationMs,
      summary: {
        total: args.results.length,
        passed,
        failed,
        passRate: Number(passRate.toFixed(4)),
      },
      exploration: args.exploration,
      testCases: args.testCases,
      results: args.results,
      bugs,
    };

    await mkdir(this.reportDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const jsonPath = join(this.reportDir, `qa-report-${stamp}.json`);
    const markdownPath = join(this.reportDir, `qa-report-${stamp}.md`);

    await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
    await writeFile(markdownPath, this.toMarkdown(report), "utf8");

    this.log.info("Reports written", {
      jsonPath,
      markdownPath,
      passed,
      failed,
      passRate: report.summary.passRate,
    });

    return { report, reportDir: this.reportDir, jsonPath, markdownPath };
  }

  private toBug(result: TestResult, testCases: TestCase[]): Bug {
    const tc = testCases.find((t) => t.id === result.id);
    const severity = classifySeverity(result, tc);
    const stepsToReproduce = (tc?.steps ?? []).map((step, i) => {
      const target =
        step.selector || step.url || step.value || step.expected || "";
      return `${i + 1}. ${step.action}${target ? ` -> ${target}` : ""} (${step.description})`;
    });

    return {
      title: `${result.id}: ${result.title}`,
      severity,
      impact: deriveImpact(result, tc),
      steps_to_reproduce: stepsToReproduce,
      expected: tc?.expected ?? "Test case should complete without error.",
      actual: result.error || "Test failed without an explicit error message.",
      evidence: {
        screenshot: result.screenshot,
        logs: result.logs.slice(-15),
        error: result.error,
        url: tc?.steps[0]?.url,
      },
    };
  }

  private toMarkdown(report: QAReport): string {
    const { summary } = report;
    const passEmoji = summary.failed === 0 ? "PASS" : "FAIL";
    const lines: string[] = [];

    lines.push(`# QA Report — ${report.url}`);
    lines.push("");
    lines.push(`**Run:** ${report.timestamp}`);
    lines.push(`**Duration:** ${(report.durationMs / 1000).toFixed(1)}s`);
    lines.push(`**Result:** ${passEmoji}`);
    lines.push("");
    lines.push("## Summary");
    lines.push("");
    lines.push(`- Total tests: ${summary.total}`);
    lines.push(`- Passed: ${summary.passed}`);
    lines.push(`- Failed: ${summary.failed}`);
    lines.push(`- Pass rate: ${(summary.passRate * 100).toFixed(1)}%`);
    lines.push("");

    lines.push("## Exploration");
    lines.push("");
    lines.push(`- Routes discovered: ${report.exploration.routes.length}`);
    lines.push(`- Forms discovered: ${report.exploration.forms.length}`);
    lines.push(
      `- Detected features: ${
        report.exploration.features.length > 0
          ? report.exploration.features.join(", ")
          : "none"
      }`
    );
    lines.push("");

    lines.push("## Test Results");
    lines.push("");
    lines.push("| ID | Title | Type | Priority | Status | Duration | Attempts |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const r of report.results) {
      lines.push(
        `| ${r.id} | ${escapePipe(r.title)} | ${r.type} | ${r.priority} | ${r.status} | ${
          (r.durationMs / 1000).toFixed(1)
        }s | ${r.attempts} |`
      );
    }
    lines.push("");

    if (report.bugs.length > 0) {
      lines.push("## Bugs");
      lines.push("");
      const grouped: Record<Severity, Bug[]> = {
        critical: [],
        high: [],
        medium: [],
        low: [],
      };
      for (const bug of report.bugs) grouped[bug.severity].push(bug);

      for (const sev of ["critical", "high", "medium", "low"] as Severity[]) {
        if (grouped[sev].length === 0) continue;
        lines.push(`### ${capitalize(sev)} (${grouped[sev].length})`);
        lines.push("");
        for (const bug of grouped[sev]) {
          lines.push(`#### ${bug.title}`);
          lines.push("");
          lines.push(`**Severity:** ${bug.severity}`);
          lines.push(`**Impact:** ${bug.impact}`);
          lines.push("");
          lines.push("**Steps to reproduce:**");
          for (const step of bug.steps_to_reproduce) {
            lines.push(`  - ${step}`);
          }
          lines.push("");
          lines.push(`**Expected:** ${bug.expected}`);
          lines.push("");
          lines.push("**Actual:**");
          lines.push("");
          lines.push("```");
          lines.push(bug.actual);
          lines.push("```");
          lines.push("");
          if (bug.evidence.screenshot) {
            lines.push(`**Screenshot:** ${bug.evidence.screenshot}`);
            lines.push("");
          }
          if (bug.evidence.logs && bug.evidence.logs.length > 0) {
            lines.push("**Recent logs:**");
            lines.push("");
            lines.push("```");
            for (const log of bug.evidence.logs) lines.push(log);
            lines.push("```");
            lines.push("");
          }
        }
      }
    } else {
      lines.push("## Bugs");
      lines.push("");
      lines.push("No bugs detected.");
      lines.push("");
    }

    return lines.join("\n");
  }
}

function classifySeverity(result: TestResult, tc?: TestCase): Severity {
  const err = (result.error ?? "").toLowerCase();
  if (err.includes("server error") || err.includes("http 5")) return "critical";
  if (tc?.type === "authentication") {
    return tc.priority === "high" ? "critical" : "high";
  }
  if (tc?.type === "crud") return "high";
  if (tc?.priority === "high") return "high";
  if (tc?.type === "form_validation") return "medium";
  if (tc?.priority === "low") return "low";
  return "medium";
}

function deriveImpact(result: TestResult, tc?: TestCase): string {
  if (!tc) return "Unknown user-facing impact.";
  const map: Record<TestCase["type"], string> = {
    authentication: "Users may be unable to sign in or sign up.",
    navigation: "Primary navigation paths may be broken for users.",
    crud: "Core data operations (create/read/update/delete) may be unreliable.",
    form_validation: "Forms may accept invalid input or reject valid input.",
    error_handling: "Error states may not surface clearly to users.",
    smoke: "A smoke-level user path is broken.",
  };
  return map[tc.type];
}

function escapePipe(s: string): string {
  return s.replace(/\|/g, "\\|");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
