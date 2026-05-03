import { Explorer } from "./modules/explorer.js";
import { TestExecutor } from "./modules/executor.js";
import { TestPlanner } from "./modules/planner.js";
import { ReportGenerator } from "./modules/reporter.js";
import type { QAOptions, QARunResult } from "./types.js";
import { Logger } from "./utils/logger.js";

const log = new Logger("orchestrator");

export async function runQa(options: QAOptions): Promise<QARunResult> {
  if (!options.url) throw new Error("runQa requires options.url");
  validateUrl(options.url);

  const start = Date.now();
  log.info("Starting QA run", { url: options.url });

  const explorer = new Explorer({
    headless: options.headless,
    maxDepth: options.maxDepth,
    maxPages: options.maxPages,
  });
  const exploration = await explorer.explore(options.url);

  const planner = new TestPlanner({
    apiKey: options.apiKey,
    model: options.model,
    minCases: options.minTestCases,
    maxCases: options.maxTestCases,
  });
  const testCases = await planner.plan(exploration);

  const reportDir = options.reportDir ?? "./reports";
  const executor = new TestExecutor({
    headless: options.headless,
    testTimeoutMs: options.testTimeoutMs,
    screenshotDir: `${reportDir}/screenshots`,
  });
  const results = await executor.runAll(testCases);

  const reporter = new ReportGenerator({ reportDir });
  const written = await reporter.generate({
    url: options.url,
    exploration,
    testCases,
    results,
    durationMs: Date.now() - start,
  });

  log.info("QA run complete", {
    durationMs: Date.now() - start,
    passed: written.report.summary.passed,
    failed: written.report.summary.failed,
  });

  return {
    report: written.report,
    reportDir: written.reportDir,
    jsonPath: written.jsonPath,
    markdownPath: written.markdownPath,
  };
}

function validateUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`URL must use http or https, got: ${parsed.protocol}`);
  }
}
