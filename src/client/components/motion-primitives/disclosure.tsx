import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DisclosureProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

export function Disclosure({ title, defaultOpen = false, children, className }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn("rounded-xl border border-[var(--border)] bg-[var(--card)]", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
      >
        <span>{title}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--border)] px-4 py-3.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
