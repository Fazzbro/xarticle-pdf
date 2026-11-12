import * as React from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  label?: string;
}

export function Switch({ checked, onCheckedChange, id, label }: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        checked
          ? "border-[var(--primary)] bg-[var(--primary)]"
          : "border-[var(--border)] bg-[var(--secondary)]"
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-3.5 w-3.5 rounded-full transition-transform duration-150",
          checked
            ? "translate-x-[18px] bg-[var(--primary-foreground)]"
            : "translate-x-[2px] bg-[var(--muted-foreground)]"
        )}
      />
    </button>
  );
}
