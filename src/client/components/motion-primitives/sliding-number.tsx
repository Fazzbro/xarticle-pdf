import { useEffect } from "react";
import { MotionValue, motion, useSpring, useTransform } from "motion/react";
import { cn } from "@/lib/utils";

const DIGIT_HEIGHT = 16;
const DIGIT_TRANSITION = {
  type: "spring" as const,
  stiffness: 420,
  damping: 32,
  mass: 0.35
};

function DigitWheel({ mv, number }: { mv: MotionValue<number>; number: number }) {
  const y = useTransform(mv, (latest) => {
    const placeValue = ((latest % 10) + 10) % 10;
    const offset = (10 + number - placeValue) % 10;
    let memo = offset * DIGIT_HEIGHT;
    if (offset > 5) {
      memo -= 10 * DIGIT_HEIGHT;
    }
    return memo;
  });

  return (
    <motion.span
      style={{ y }}
      className="absolute inset-0 flex items-center justify-center leading-4"
    >
      {number}
    </motion.span>
  );
}

function DigitColumn({ value, place }: { value: number; place: number }) {
  const valueRoundedToPlace = Math.floor(value / place);
  const animatedValue = useSpring(valueRoundedToPlace, DIGIT_TRANSITION);

  useEffect(() => {
    animatedValue.set(valueRoundedToPlace);
  }, [animatedValue, valueRoundedToPlace]);

  return (
    <span className="relative inline-block h-4 w-[1ch] overflow-hidden tabular-nums leading-4">
      <span className="invisible">0</span>
      {Array.from({ length: 10 }, (_, i) => (
        <DigitWheel key={i} mv={animatedValue} number={i} />
      ))}
    </span>
  );
}

export interface SlidingNumberProps {
  value: number;
  className?: string;
}

/**
 * Odometer-style rolling integer counter with tabular numerals.
 */
export function SlidingNumber({ value, className }: SlidingNumberProps) {
  const abs = Math.max(0, Math.round(value));
  const str = String(abs);
  const digits = str.split("").map((_, i) => Math.pow(10, str.length - i - 1));

  return (
    <span className={cn("inline-flex items-center tabular-nums leading-4", className)}>
      {digits.map((place, idx) => (
        <DigitColumn key={`p-${digits.length - idx}`} value={abs} place={place} />
      ))}
    </span>
  );
}
