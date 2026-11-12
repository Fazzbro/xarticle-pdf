import { AnimatePresence, motion } from "motion/react";
import { useId, useMemo } from "react";
import { cn } from "@/lib/utils";

export interface TextMorphProps {
  children: string;
  as?: "p" | "span" | "div" | "h2";
  className?: string;
}

/**
 * Smooth character-level layout morph when labels change state.
 */
export function TextMorph({ children, as = "span", className }: TextMorphProps) {
  const uniqueId = useId();
  const Wrapper = as;

  const characters = useMemo(() => {
    const counts: Record<string, number> = {};
    return children.split("").map((char, index) => {
      const lower = char.toLowerCase();
      counts[lower] = (counts[lower] || 0) + 1;
      return {
        id: `${uniqueId}-${lower}-${counts[lower]}`,
        label: char === " " ? "\u00A0" : char,
        index
      };
    });
  }, [children, uniqueId]);

  return (
    <Wrapper className={cn("inline-flex items-center whitespace-nowrap", className)} aria-label={children}>
      <AnimatePresence mode="popLayout" initial={false}>
        {characters.map((c) => (
          <motion.span
            key={c.id}
            layoutId={c.id}
            className="inline-block"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ type: "spring", stiffness: 380, damping: 28, mass: 0.35 }}
          >
            {c.label}
          </motion.span>
        ))}
      </AnimatePresence>
    </Wrapper>
  );
}
