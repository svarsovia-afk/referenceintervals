import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "navy" | "teal" | "amber" | "coral" | "outline";

const tones: Record<Tone, string> = {
  neutral: "bg-navy-50 text-ink-muted border-transparent",
  navy: "bg-navy-800 text-white border-transparent",
  teal: "bg-teal-50 text-teal-800 border-teal-200",
  amber: "bg-amber-50 text-amber-800 border-amber-100",
  coral: "bg-coral-50 text-coral-700 border-coral-100",
  outline: "bg-surface text-ink-muted border-line-strong",
};

export function Badge({ className, tone = "neutral", ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}
