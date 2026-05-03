import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = "text", ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      "flex h-10 w-full rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-500",
      "transition-colors focus-visible:outline-none focus-visible:border-blue-500/60 focus-visible:ring-2 focus-visible:ring-blue-500/20",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";
