"use client";

import {
  CheckCircle2,
  Circle,
  CircleDot,
  FlaskConical,
  Hourglass,
  MapPin,
  MinusCircle,
  OctagonAlert,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import type { StepStatus } from "@/domain/progress";
import { scoreLabelKey } from "@/domain/readiness";
import type { LocalizedText, Stakeholder, TaskStatus } from "@/domain/types";
import { useI18n } from "@/i18n/I18nProvider";
import { useApp } from "@/state/AppStateProvider";
import { Badge, type Tone } from "./ui/badge";
import { Field, Input, Textarea } from "./ui/form";

const STEP_STATUS_META: Record<StepStatus, { icon: LucideIcon; tone: Tone }> = {
  completed: { icon: CheckCircle2, tone: "teal" },
  active: { icon: MapPin, tone: "navy" },
  awaitingReview: { icon: Hourglass, tone: "amber" },
  blocked: { icon: OctagonAlert, tone: "coral" },
  inProgress: { icon: CircleDot, tone: "teal" },
  upcoming: { icon: Circle, tone: "neutral" },
  notApplicable: { icon: MinusCircle, tone: "outline" },
};

export function StepStatusBadge({ status }: { status: StepStatus }) {
  const { td } = useI18n();
  const meta = STEP_STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {td(`stepStatus.${status}`)}
    </Badge>
  );
}

const TASK_TONE: Record<TaskStatus, Tone> = { notStarted: "neutral", inProgress: "teal", blocked: "coral", done: "teal", cancelled: "outline" };
const TASK_ICON: Record<TaskStatus, LucideIcon> = { notStarted: Circle, inProgress: CircleDot, blocked: OctagonAlert, done: CheckCircle2, cancelled: MinusCircle };

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const { td } = useI18n();
  const Icon = TASK_ICON[status];
  return (
    <Badge tone={TASK_TONE[status]}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {td(`taskStatus.${status}`)}
    </Badge>
  );
}

/** Score as number + label, e.g. "2/2 · Completed". */
export function ScoreBadge({ score, max, tone }: { score: number; max?: number; tone?: Tone }) {
  const { td } = useI18n();
  const auto: Tone = score === 0 ? "neutral" : score === 3 ? "navy" : score === max ? "teal" : "amber";
  return (
    <Badge tone={tone ?? auto}>
      <span className="font-semibold tabular-nums">
        {score}
        {max !== undefined ? `/${max}` : ""}
      </span>
      <span aria-hidden="true">·</span>
      {td(`scores.${scoreLabelKey(score)}`)}
    </Badge>
  );
}

export function SampleBadge() {
  const { t } = useI18n();
  return (
    <Badge tone="amber" title={t("common.sampleHint")}>
      <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
      {t("common.sample")}
    </Badge>
  );
}

export function useStakeholderLookup() {
  const { state } = useApp();
  const { t } = useI18n();
  return useMemo(() => {
    const map = new Map<string, Stakeholder>(state.stakeholders.map((s) => [s.id, s]));
    return {
      get: (id?: string) => (id ? map.get(id) : undefined),
      name: (id?: string) => (id ? map.get(id)?.fullName ?? t("common.unknownUser") : t("common.unassigned")),
    };
  }, [state.stakeholders, t]);
}

export function Initials({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-100 text-xs font-semibold text-navy-800 ${className ?? ""}`}
    >
      {initials}
    </span>
  );
}

/** Two side-by-side fields for content kept in both languages. */
export function BilingualField({
  label,
  value,
  onChange,
  multiline = true,
  disabled,
  hint,
  required,
}: {
  label: string;
  value: LocalizedText;
  onChange: (v: LocalizedText) => void;
  multiline?: boolean;
  disabled?: boolean;
  hint?: string;
  required?: boolean;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-ink">
        {label}
        {required && (
          <span className="ml-0.5 text-coral-600" aria-hidden="true">
            *
          </span>
        )}
      </legend>
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {(["nl", "en"] as const).map((l) => (
          <Field key={l} label={<span className="text-xs font-normal text-ink-muted">{t(l === "nl" ? "common.dutchVersion" : "common.englishVersion")}</span>}>
            {(p) =>
              multiline ? (
                <Textarea {...p} lang={l} disabled={disabled} value={value[l]} onChange={(e) => onChange({ ...value, [l]: e.target.value })} />
              ) : (
                <Input {...p} lang={l} disabled={disabled} value={value[l]} onChange={(e) => onChange({ ...value, [l]: e.target.value })} />
              )
            }
          </Field>
        ))}
      </div>
    </fieldset>
  );
}

export function DaysText({ days }: { days: number | undefined | null }) {
  const { t } = useI18n();
  if (days === undefined || days === null) return <>{t("common.notSet")}</>;
  const rounded = Math.round(days * 10) / 10;
  return <>{rounded === 1 ? t("common.day") : t("common.days", { n: rounded })}</>;
}
