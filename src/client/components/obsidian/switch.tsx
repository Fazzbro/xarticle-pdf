import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  label?: string;
  disabled?: boolean;
}

export function Switch({ checked, onCheckedChange, id, label, disabled = false }: SwitchProps) {
  return (
    <motion.button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.94 }}
      onClick={() => {
        if (!disabled) onCheckedChange(!checked);
      }}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-[var(--foreground)]",
        checked
          ? "border-[var(--primary)] bg-[var(--primary)]"
          : "border-[var(--border)] bg-[var(--secondary)]"
      )}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 560, damping: 32 }}
        animate={{ x: checked ? 18 : 2 }}
        className={cn(
          "pointer-events-none block h-3.5 w-3.5 rounded-full shadow-xs transition-colors",
          checked ? "bg-[var(--primary-foreground)]" : "bg-[var(--muted-foreground)]"
        )}
      />
    </motion.button>
  );
}
