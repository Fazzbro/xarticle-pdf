import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "outline" | "secondary";
}

export function Badge({ className, variant = "outline", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-tight transition-colors",
        variant === "default" && "bg-[var(--primary)] text-[var(--primary-foreground)]",
        variant === "secondary" && "bg-[var(--secondary)] text-[var(--secondary-foreground)] border border-[var(--border)]",
        variant === "outline" && "border border-[var(--border)] bg-transparent text-[var(--muted-foreground)]",
        className
      )}
      {...props}
    />
  );
}
