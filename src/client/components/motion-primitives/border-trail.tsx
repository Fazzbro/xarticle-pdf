import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export interface BorderTrailProps {
  className?: string;
  size?: number;
  duration?: number;
}

export function BorderTrail({ className, size = 72, duration = 3.2 }: BorderTrailProps) {
  return (
    <div className="pointer-events-none absolute inset-0 rounded-[inherit] border border-transparent [mask-clip:padding-box,border-box] [mask-composite:intersect] [mask-image:linear-gradient(transparent,transparent),linear-gradient(#000,#000)]">
      <motion.div
        className={cn(
          "absolute aspect-square bg-[radial-gradient(circle,rgba(9,9,11,0.85),rgba(113,113,122,0.35),transparent_70%)] dark:bg-[radial-gradient(circle,rgba(255,255,255,0.9),rgba(161,161,170,0.4),transparent_70%)]",
          className
        )}
        style={{
          width: size,
          offsetPath: `rect(0 auto auto 0 round ${size}px)`
        }}
        animate={{ offsetDistance: ["0%", "100%"] }}
        transition={{ repeat: Infinity, duration, ease: "linear" }}
      />
    </div>
  );
}
