import { Children, cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export interface AnimatedBackgroundProps {
  children: ReactElement<{
    "data-id": string;
    className?: string;
    onClick?: () => void;
    children?: ReactNode;
  }>[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (id: string) => void;
  className?: string;
}

export function AnimatedBackground({
  children,
  value,
  onValueChange,
  className
}: AnimatedBackgroundProps) {
  const uniqueId = useId();

  return (
    <>
      {Children.map(children, (child) => {
        if (!isValidElement(child)) return child;
        const id = child.props["data-id"];
        const isActive = value === id;

        return cloneElement(child, {
          onClick: () => {
            onValueChange?.(id);
            child.props.onClick?.();
          },
          className: cn("relative z-10", child.props.className),
          children: (
            <>
              {isActive && (
                <motion.div
                  layoutId={`bg-pill-${uniqueId}`}
                  transition={{ type: "spring", bounce: 0.18, duration: 0.35 }}
                  className={cn(
                    "absolute inset-0 -z-10 rounded-md bg-[var(--primary)] shadow-xs",
                    className
                  )}
                />
              )}
              {child.props.children}
            </>
          )
        } as Record<string, unknown>);
      })}
    </>
  );
}
