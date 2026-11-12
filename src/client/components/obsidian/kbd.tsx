import * as React from "react";
import { cn } from "@/lib/utils";

export function Separator({ className }: { className?: string }) {
  return <div role="separator" className={cn("h-px w-full bg-[var(--border)]", className)} />;
}

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center rounded border border-[var(--border)] bg-[var(--secondary)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--muted-foreground)]",
        className
      )}
      {...props}
    />
  );
}
