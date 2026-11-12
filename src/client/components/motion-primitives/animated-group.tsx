import { motion, type Variants } from "motion/react";
import { Children, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface AnimatedGroupProps {
  children: ReactNode;
  className?: string;
  stagger?: number;
  preset?: "fade" | "slide" | "blur-slide" | "scale";
}

const presetItemVariants: Record<NonNullable<AnimatedGroupProps["preset"]>, Variants> = {
  fade: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.28, ease: "easeOut" } }
  },
  slide: {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { type: "spring", bounce: 0.2, duration: 0.45 } }
  },
  "blur-slide": {
    hidden: { opacity: 0, y: 10, filter: "blur(4px)" },
    visible: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: { duration: 0.34, ease: "easeOut" }
    }
  },
  scale: {
    hidden: { opacity: 0, scale: 0.94 },
    visible: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.25, duration: 0.4 } }
  }
};

/**
 * Staggers child entrance animations cleanly with configurable presets.
 */
export function AnimatedGroup({
  children,
  className,
  stagger = 0.05,
  preset = "blur-slide"
}: AnimatedGroupProps) {
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: stagger }
    }
  };
  const itemVariant = presetItemVariants[preset];

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className={cn(className)}
    >
      {Children.map(children, (child, index) => (
        <motion.div key={index} variants={itemVariant}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}
