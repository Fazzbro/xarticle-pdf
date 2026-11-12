import { motion, type Variants } from "motion/react";
import { cn } from "@/lib/utils";

export interface TextEffectProps {
  children: string;
  per?: "word" | "char";
  preset?: "fade-in-blur" | "slide";
  as?: "h1" | "h2" | "p" | "span";
  className?: string;
}

const defaultContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04 }
  }
};

const presetVariants: Record<NonNullable<TextEffectProps["preset"]>, Variants> = {
  "fade-in-blur": {
    hidden: { opacity: 0, y: 6, filter: "blur(4px)" },
    visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.35, ease: "easeOut" } }
  },
  slide: {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } }
  }
};

export function TextEffect({
  children,
  per = "word",
  preset = "fade-in-blur",
  as = "span",
  className
}: TextEffectProps) {
  const segments = per === "char" ? children.split("") : children.split(/(\s+)/);
  const MotionTag = motion[as];
  const itemVariant = presetVariants[preset];

  return (
    <MotionTag
      initial="hidden"
      animate="visible"
      variants={defaultContainerVariants}
      className={cn("inline-block", className)}
    >
      {segments.map((seg, i) =>
        /^\s+$/.test(seg) ? (
          <span key={i}>{seg}</span>
        ) : (
          <motion.span key={i} variants={itemVariant} className="inline-block whitespace-pre">
            {seg}
          </motion.span>
        )
      )}
    </MotionTag>
  );
}
