import "dotenv/config";
import { runQa } from "../src/index.js";

async function main(): Promise<void> {
  const target = process.argv[2] ?? process.env.QA_TARGET_URL ?? "https://example.com";

  const result = await runQa({
    url: target,
    headless: true,
    maxDepth: 3,
    maxPages: 10,
    testTimeoutMs: 30_000,
    reportDir: "./reports",
    minTestCases: 10,
    maxTestCases: 15,
  });

  const { summary, bugs } = result.report;
  console.log("\nQA run finished.");
  console.log(`  Passed:  ${summary.passed}/${summary.total} (${(summary.passRate * 100).toFixed(1)}%)`);
  console.log(`  Bugs:    ${bugs.length}`);
  console.log(`  Reports: ${result.markdownPath}`);

  if (bugs.length > 0) {
    console.log("\nTop bugs:");
    const ordered = [...bugs].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
    for (const bug of ordered.slice(0, 5)) {
      console.log(`  - [${bug.severity}] ${bug.title}`);
    }
  }

  process.exit(summary.failed > 0 ? 1 : 0);
}

function severityRank(s: string): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[s] ?? 4;
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
