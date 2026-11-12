import { motion, type HTMLMotionProps } from "motion/react";
import { cn } from "@/lib/utils";

export interface RaisedButtonProps extends Omit<HTMLMotionProps<"button">, "ref"> {
  size?: "sm" | "default" | "lg";
}

export function RaisedButton({
  className,
  size = "default",
  children,
  disabled,
  ...props
}: RaisedButtonProps) {
  return (
    <motion.button
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.98, y: 0 }}
      transition={{ type: "spring", stiffness: 460, damping: 28 }}
      disabled={disabled}
      className={cn(
        "relative inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-semibold transition-opacity duration-150 disabled:pointer-events-none disabled:opacity-45",
        "bg-[var(--primary)] text-[var(--primary-foreground)] border border-black/20 dark:border-white/25",
        "shadow-[0_2px_6px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.28)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.5)]",
        "hover:opacity-92 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        size === "sm" && "h-8 rounded-lg px-3 text-xs",
        size === "default" && "h-10 rounded-xl px-4 text-xs",
        size === "lg" && "h-11 rounded-xl px-5 text-sm",
        className
      )}
      {...props}
    >
      {children}
    </motion.button>
  );
}
