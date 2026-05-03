import * as React from "react";
import { cn } from "@/lib/utils";

// Lightweight tabs primitive. Same compositional API as shadcn/Radix's Tabs
// (Root → List → Trigger → Content) but implemented with React context — no
// extra dependency.

interface TabsCtx {
  value: string;
  onValueChange: (v: string) => void;
}
const Ctx = React.createContext<TabsCtx | null>(null);
const useTabs = () => {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("Tabs components must be used inside <Tabs>");
  return ctx;
};

interface TabsProps {
  value: string;
  onValueChange: (v: string) => void;
  className?: string;
  children: React.ReactNode;
}

export function Tabs({ value, onValueChange, className, children }: TabsProps) {
  return (
    <Ctx.Provider value={{ value, onValueChange }}>
      <div className={cn("flex flex-col min-h-0", className)}>{children}</div>
    </Ctx.Provider>
  );
}

interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {}

export function TabsList({ className, ...props }: TabsListProps) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-1 rounded-2xl bg-zinc-900/70 p-1 border border-zinc-800/80 w-fit",
        className
      )}
      {...props}
    />
  );
}

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

export function TabsTrigger({ value, className, children, ...props }: TabsTriggerProps) {
  const ctx = useTabs();
  const active = ctx.value === value;
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={() => ctx.onValueChange(value)}
      className={cn(
        "inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium transition-all duration-150",
        active
          ? "bg-zinc-800 text-zinc-50 shadow-sm"
          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

export function TabsContent({ value, className, ...props }: TabsContentProps) {
  const ctx = useTabs();
  if (ctx.value !== value) return null;
  return (
    <div
      role="tabpanel"
      className={cn("flex-1 min-h-0 outline-none animate-fade-in-up", className)}
      {...props}
    />
  );
}
