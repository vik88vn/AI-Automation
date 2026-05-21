// Outbound integrations: Slack (incoming webhook) and Jira (REST v3).
//
// Both use the global fetch (Node 18+). Credentials come from env, never from
// the client. These throw on misconfiguration so the route can return a clear
// error instead of silently no-op'ing.

export interface SlackSummary {
  projectName: string;
  runUrl: string;
  bugCount: number;
  critical: number;
  high: number;
  passRate: number | null;
  dashboardUrl?: string;
}

// Post a run summary to a Slack incoming webhook (SLACK_WEBHOOK_URL).
export async function sendSlackSummary(summary: SlackSummary): Promise<void> {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) {
    throw new Error("SLACK_WEBHOOK_URL is not configured");
  }

  const emoji = summary.critical > 0 ? ":rotating_light:" : summary.bugCount > 0 ? ":warning:" : ":white_check_mark:";
  const text = [
    `${emoji} *QA run complete — ${summary.projectName}*`,
    `Target: ${summary.runUrl}`,
    `*${summary.bugCount}* bug(s) — ${summary.critical} critical, ${summary.high} high`,
    summary.passRate != null ? `Pass rate: ${summary.passRate}%` : null,
    summary.dashboardUrl ? `<${summary.dashboardUrl}|View dashboard>` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new Error(`Slack webhook failed: HTTP ${res.status}`);
  }
}

export interface JiraIssueInput {
  summary: string;
  description: string;
  severity: string;
  url: string;
}

// Create a Jira issue from a bug. Requires JIRA_BASE_URL, JIRA_EMAIL,
// JIRA_API_TOKEN, JIRA_PROJECT_KEY. Returns the created issue key (e.g. QA-42).
export async function createJiraIssue(bug: JiraIssueInput): Promise<{ key: string; url: string }> {
  const base = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  const projectKey = process.env.JIRA_PROJECT_KEY;
  if (!base || !email || !token || !projectKey) {
    throw new Error(
      "Jira not configured (need JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY)"
    );
  }

  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  const priorityName =
    bug.severity === "CRITICAL" ? "Highest" : bug.severity === "HIGH" ? "High" : bug.severity === "MEDIUM" ? "Medium" : "Low";

  const body = {
    fields: {
      project: { key: projectKey },
      issuetype: { name: "Bug" },
      summary: bug.summary.slice(0, 250),
      priority: { name: priorityName },
      // Jira Cloud expects Atlassian Document Format for description.
      description: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: `${bug.description}\n\nURL: ${bug.url}` }],
          },
        ],
      },
    },
  };

  const res = await fetch(`${base.replace(/\/$/, "")}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Jira issue creation failed: HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { key: string };
  return { key: data.key, url: `${base.replace(/\/$/, "")}/browse/${data.key}` };
}
