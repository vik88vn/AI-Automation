import { useState } from "react";
import { Activity, Bug, ListChecks } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { ExecutionFeed } from "@/components/ExecutionFeed";
import { TestTable } from "@/components/TestTable";
import { BugList } from "@/components/BugList";
import { RunInput } from "@/components/RunInput";
import { RunHistorySidebar } from "@/components/RunHistorySidebar";
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
  const stepsCount = useStore((s) => s.steps.length);
  const testsCount = useStore((s) => s.testCases.length);
  const bugsCount = useStore((s) => s.bugs.length);

  return (
    <div className="flex h-full w-full">
      <Sidebar />

      <main className="flex flex-1 flex-col min-w-0">
        <TopBar />

        <div className="flex-1 min-h-0 flex flex-col">
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as Tab)}
            className="flex-1"
          >
            <div className="px-5 pt-4 pb-2">
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

            <TabsContent value={TabIds.Execution} className="px-0">
              <ExecutionFeed />
            </TabsContent>
            <TabsContent value={TabIds.Tests} className="px-0">
              <TestTable />
            </TabsContent>
            <TabsContent value={TabIds.Bugs} className="px-0">
              <BugList />
            </TabsContent>
          </Tabs>
        </div>

        <RunInput />
      </main>

      <RunHistorySidebar />
    </div>
  );
}
