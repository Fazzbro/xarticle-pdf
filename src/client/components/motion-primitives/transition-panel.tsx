import { AnimatePresence, motion, type Transition, type Variant } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TransitionPanelProps {
  activeKey: string | number;
  children: ReactNode;
  className?: string;
  variants?: {
    enter: Variant;
    center: Variant;
    exit: Variant;
  };
  transition?: Transition;
}

const DEFAULT_VARIANTS = {
  enter: { opacity: 0, y: 8, filter: "blur(4px)" },
  center: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -8, filter: "blur(4px)" }
};

/**
 * Smooth cross-blur panel switcher driven by an active state key.
 */
export function TransitionPanel({
  activeKey,
  children,
  className,
  variants = DEFAULT_VARIANTS,
  transition = { duration: 0.24, ease: "easeOut" }
}: TransitionPanelProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={activeKey}
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={transition}
        className={cn(className)}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
