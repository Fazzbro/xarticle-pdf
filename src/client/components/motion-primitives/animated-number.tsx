import { useEffect } from "react";
import { motion, useSpring, useTransform, type SpringOptions } from "motion/react";
import { cn } from "@/lib/utils";

export interface AnimatedNumberProps {
  value: number;
  className?: string;
  springOptions?: SpringOptions;
}

export function AnimatedNumber({
  value,
  className,
  springOptions = { bounce: 0, duration: 750 }
}: AnimatedNumberProps) {
  const spring = useSpring(value, springOptions);
  const display = useTransform(spring, (current) => Math.round(current).toLocaleString());

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return <motion.span className={cn("tabular-nums", className)}>{display}</motion.span>;
}
