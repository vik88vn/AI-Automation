import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-zinc-800 text-zinc-200 border border-zinc-700/70",
        success: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25",
        warning: "bg-amber-500/15 text-amber-300 border border-amber-500/25",
        danger: "bg-red-500/15 text-red-300 border border-red-500/25",
        info: "bg-blue-500/15 text-blue-300 border border-blue-500/25",
        muted: "bg-zinc-900 text-zinc-400 border border-zinc-800",
        critical: "bg-red-600/25 text-red-200 border border-red-500/40",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
