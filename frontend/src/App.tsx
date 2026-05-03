import { Home } from "@/pages/Home";
import { Dashboard } from "@/pages/Dashboard";
import { useView } from "@/store/useSessionStore";
import { Views } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// App — top-level view router.
//
// Two views, no `react-router`. The view is a discriminated string union
// owned by `useSessionStore`; transitions happen as side-effects of session
// actions (`startNewRun`, `selectRun`, `goHome`). When deep-linking is needed
// later, swap this conditional for a `<Routes>` block — the store API stays.
// ─────────────────────────────────────────────────────────────────────────────

export function App() {
  const view = useView();
  return (
    <div className="app-root flex h-full w-full">
      {view === Views.Home ? <Home /> : <Dashboard />}
    </div>
  );
}
