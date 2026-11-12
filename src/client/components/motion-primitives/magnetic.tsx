import { motion, useMotionValue, useSpring, type SpringOptions } from "motion/react";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface MagneticProps {
  children: ReactNode;
  className?: string;
  intensity?: number;
  range?: number;
  springOptions?: SpringOptions;
  disabled?: boolean;
}

/**
 * Subtle magnetic cursor pull toward interactive triggers.
 */
export function Magnetic({
  children,
  className,
  intensity = 0.22,
  springOptions = { stiffness: 280, damping: 20, mass: 0.2 },
  disabled = false
}: MagneticProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, springOptions);
  const y = useSpring(rawY, springOptions);

  return (
    <motion.div
      ref={ref}
      style={{ x, y }}
      className={cn("inline-flex", className)}
      onMouseMove={(e) => {
        if (disabled || !ref.current) return;
        if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) return;
        const rect = ref.current.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        rawX.set((e.clientX - cx) * intensity);
        rawY.set((e.clientY - cy) * intensity);
      }}
      onMouseLeave={() => {
        rawX.set(0);
        rawY.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}
