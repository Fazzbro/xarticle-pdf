import { motion } from "motion/react";
import { useMemo, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

export interface TextShimmerProps {
  children: string;
  as?: "p" | "span" | "div" | "h1" | "h2";
  className?: string;
  duration?: number;
  spread?: number;
}

/**
 * Monochrome luminance sweep across inline text using Motion.
 */
export function TextShimmer({
  children,
  as = "span",
  className,
  duration = 2,
  spread = 2
}: TextShimmerProps) {
  const MotionComponent = motion[as];

  const dynamicSpread = useMemo(() => children.length * spread, [children, spread]);

  return (
    <MotionComponent
      className={cn(
        "relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent",
        "[--base-color:#71717a] [--base-gradient-color:#09090b]",
        "dark:[--base-color:#71717a] dark:[--base-gradient-color:#ffffff]",
        "[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--base-gradient-color),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]",
        className
      )}
      initial={{ backgroundPosition: "100% center" }}
      animate={{ backgroundPosition: "0% center" }}
      transition={{
        repeat: Infinity,
        duration,
        ease: "linear"
      }}
      style={
        {
          "--spread": `${dynamicSpread}px`,
          backgroundImage: `var(--bg), linear-gradient(var(--base-color), var(--base-color))`
        } as CSSProperties
      }
    >
      {children}
    </MotionComponent>
  );
}
