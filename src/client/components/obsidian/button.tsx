import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg text-xs font-medium transition-all disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-3.5 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90",
        outline:
          "border border-[var(--border)] bg-transparent text-[var(--foreground)] hover:bg-[var(--accent)]",
        secondary:
          "bg-[var(--secondary)] text-[var(--secondary-foreground)] border border-[var(--border)] hover:opacity-85",
        ghost:
          "bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
      },
      size: {
        default: "h-9 px-3.5 py-2",
        sm: "h-7 rounded-md px-2.5 text-[11px]",
        lg: "h-10 rounded-xl px-5 text-sm",
        icon: "h-8 w-8"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
