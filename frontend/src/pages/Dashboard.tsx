import { useState } from "react";
import { Activity, Bug, ListChecks } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { ExecutionFeed } from "@/components/ExecutionFeed";
import { TestTable } from "@/components/TestTable";
import { BugList } from "@/components/BugList";
import { RunInput } from "@/components/RunInput";
import { RunHistorySidebar } from "@/components/RunHistorySidebar";
import { ErrorBanner } from "@/components/ErrorBanner";
import { SettingsDialog } from "@/components/SettingsDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/store/useStore";
import { Tabs as TabIds, type Tab } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard — full chrome view: left Sidebar · center main pane · right
// RunHistorySidebar. Active tab is local UI state (no need to persist across
// sessions — each run starts on Execution).
// ─────────────────────────────────────────────────────────────────────────────

export function Dashboard() {
  const [tab, setTab] = useState<Tab>(TabIds.Execution);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const stepsCount = useStore((s) => s.steps.length);
  const testsCount = useStore((s) => s.testCases.length);
  const bugsCount = useStore((s) => s.bugs.length);

  return (
    <div className="flex h-full w-full">
      <Sidebar />

      <main className="flex flex-1 flex-col min-w-0">
        <TopBar onOpenSettings={() => setSettingsOpen(true)} />

        {/* Inline error banner — surfaces backend failures (provider unhealthy,
            missing model, bad API key) instead of silently failing. */}
        <ErrorBanner onOpenSettings={() => setSettingsOpen(true)} />

        <div className="flex-1 min-h-0 flex flex-col">
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as Tab)}
            className="flex-1 flex flex-col"
          >
            <div className="px-5 pt-4 pb-2 flex-shrink-0">
              <TabsList>
                <TabsTrigger value={TabIds.Execution}>
                  <Activity className="size-3.5" />
                  Execution
                  {stepsCount > 0 && (
                    <Badge variant="muted" className="ml-1">
                      {stepsCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value={TabIds.Tests}>
                  <ListChecks className="size-3.5" />
                  Test Cases
                  {testsCount > 0 && (
                    <Badge variant="muted" className="ml-1">
                      {testsCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value={TabIds.Bugs}>
                  <Bug className="size-3.5" />
                  Bugs
                  {bugsCount > 0 && (
                    <Badge variant="danger" className="ml-1">
                      {bugsCount}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="h-[calc(100vh-160px)] overflow-y-auto pr-2 custom-scrollbar">
              <TabsContent value={TabIds.Execution} className="px-0">
                <ExecutionFeed />
              </TabsContent>
              <TabsContent value={TabIds.Tests} className="px-0">
                <TestTable />
              </TabsContent>
              <TabsContent value={TabIds.Bugs} className="px-0">
                <BugList />
              </TabsContent>
            </div>
          </Tabs>
        </div>

        <RunInput />
      </main>

      <RunHistorySidebar />

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
