// Export & integration actions for a run: download CSV/HTML, post to Slack.
//
// CSV/HTML are file downloads (open the export URL with the auth token via a
// fetch + blob, so the Authorization header is sent). Slack is a POST.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText, Send, Loader2 } from "lucide-react";
import { exportRunUrl, postRunToSlack, getAccessToken, ApiError } from "@/lib/dashboardApi";

export function ExportMenu({ runId }: { runId: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Download a file by fetching with the auth header, then saving the blob.
  const download = async (format: "csv" | "html") => {
    setBusy(format);
    setMsg(null);
    try {
      const token = getAccessToken();
      const res = await fetch(exportRunUrl(runId, format), {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new ApiError(res.status, `Export failed (HTTP ${res.status})`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `qa-${runId}.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  };

  const slack = async () => {
    setBusy("slack");
    setMsg(null);
    try {
      await postRunToSlack(runId);
      setMsg("Posted to Slack ✓");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Slack post failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button variant="outline" size="sm" onClick={() => download("csv")} disabled={busy !== null} className="gap-1.5">
        {busy === "csv" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
        CSV
      </Button>
      <Button variant="outline" size="sm" onClick={() => download("html")} disabled={busy !== null} className="gap-1.5">
        {busy === "html" ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
        PDF report
      </Button>
      <Button variant="outline" size="sm" onClick={slack} disabled={busy !== null} className="gap-1.5">
        {busy === "slack" ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
        Slack
      </Button>
      {msg && <span className="text-xs text-zinc-400">{msg}</span>}
    </div>
  );
}
