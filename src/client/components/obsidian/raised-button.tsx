import * as React from "react";
import { cn } from "@/lib/utils";

export interface RaisedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "sm" | "default" | "lg";
}

export function RaisedButton({
  className,
  size = "default",
  children,
  ...props
}: RaisedButtonProps) {
  return (
    <button
      className={cn(
        "relative inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-semibold transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
        "bg-[var(--primary)] text-[var(--primary-foreground)] border border-black/20 dark:border-white/25",
        "shadow-[0_1px_2px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.28)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.5)]",
        "hover:opacity-92 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        size === "sm" && "h-8 rounded-lg px-3 text-xs",
        size === "default" && "h-10 rounded-xl px-4 text-xs",
        size === "lg" && "h-11 rounded-xl px-5 text-sm",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
