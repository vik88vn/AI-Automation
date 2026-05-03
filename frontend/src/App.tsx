import { useState } from "react";
import { Activity, Bug, ListChecks } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { ExecutionFeed } from "@/components/ExecutionFeed";
import { TestTable } from "@/components/TestTable";
import { BugList } from "@/components/BugList";
import { RunInput } from "@/components/RunInput";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/store/useStore";

type TabId = "execution" | "tests" | "bugs";

export function App() {
  const [tab, setTab] = useState<TabId>("execution");
  const stepsCount = useStore((s) => s.steps.length);
  const testsCount = useStore((s) => s.testCases.length);
  const bugsCount = useStore((s) => s.bugs.length);

  return (
    <div className="app-root flex h-full w-full">
      <Sidebar />

      <main className="flex flex-1 flex-col min-w-0">
        <TopBar />

        <div className="flex-1 min-h-0 flex flex-col">
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as TabId)}
            className="flex-1"
          >
            <div className="px-5 pt-4 pb-2">
              <TabsList>
                <TabsTrigger value="execution">
                  <Activity className="size-3.5" />
                  Execution
                  {stepsCount > 0 && (
                    <Badge variant="muted" className="ml-1">
                      {stepsCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="tests">
                  <ListChecks className="size-3.5" />
                  Test Cases
                  {testsCount > 0 && (
                    <Badge variant="muted" className="ml-1">
                      {testsCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="bugs">
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

            <TabsContent value="execution" className="px-0">
              <ExecutionFeed />
            </TabsContent>
            <TabsContent value="tests" className="px-0">
              <TestTable />
            </TabsContent>
            <TabsContent value="bugs" className="px-0">
              <BugList />
            </TabsContent>
          </Tabs>
        </div>

        <RunInput />
      </main>
    </div>
  );
}
