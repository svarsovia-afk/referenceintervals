"use client";

import { ChevronLeft, ChevronRight, Clock, ListChecks, MapPin, Scale, UserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ScoreBadge, StepStatusBadge, useStakeholderLookup } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { stepEstimateDays, stepOwnerId } from "@/domain/insights";
import { currentStepNo, stepStatus, taskSummary, type StepStatus } from "@/domain/progress";
import { getTemplate, STEP_TEMPLATES } from "@/domain/stepTemplates";
import type { Roadmap } from "@/domain/types";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppStateProvider";

const WINDOW = 3;

const DOT_STYLE: Record<StepStatus, string> = {
  completed: "bg-teal-600 text-white border-teal-600",
  active: "bg-navy-800 text-white border-navy-800",
  awaitingReview: "bg-amber-50 text-amber-800 border-amber-600",
  blocked: "bg-coral-50 text-coral-700 border-coral-600",
  inProgress: "bg-teal-50 text-teal-800 border-teal-600",
  upcoming: "bg-surface text-ink-muted border-line-strong",
  notApplicable: "bg-canvas text-ink-subtle border-dashed border-line-strong line-through",
};

export function RoadmapTrack({ roadmap }: { roadmap: Roadmap }) {
  const { t, td } = useI18n();
  const { state } = useApp();
  const people = useStakeholderLookup();
  const current = currentStepNo(roadmap);
  const initialStart = Math.floor(((current ?? 1) - 1) / WINDOW) * WINDOW + 1;
  const [start, setStart] = useState(initialStart);
  const end = Math.min(STEP_TEMPLATES.length, start + WINDOW - 1);
  const visible = STEP_TEMPLATES.filter((s) => s.stepNo >= start && s.stepNo <= end);

  return (
    <section aria-labelledby="track-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="track-heading" className="text-lg font-semibold text-navy-900">
            {t("dashboard.roadmapTrack")}
          </h2>
          <p className="text-sm text-ink-muted" aria-live="polite">
            {t("dashboard.stepOverview", { from: start, to: end })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setStart(Math.max(1, start - WINDOW))} disabled={start <= 1}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            {t("dashboard.earlierSteps")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setStart(Math.min(STEP_TEMPLATES.length - WINDOW + 1, start + WINDOW))} disabled={end >= STEP_TEMPLATES.length}>
            {t("dashboard.laterSteps")}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Compact overview of all nine steps: number + status, jumps the detailed window. */}
      <ol className="flex items-center gap-0" aria-label={t("dashboard.roadmapTrack")}>
        {STEP_TEMPLATES.map((tpl, i) => {
          const status = stepStatus(roadmap, tpl.stepNo, state.tasks, state.scoreProposals);
          const inWindow = tpl.stepNo >= start && tpl.stepNo <= end;
          const isCurrent = tpl.stepNo === current;
          return (
            <li key={tpl.stepNo} className="flex flex-1 items-center last:flex-none">
              <button
                type="button"
                onClick={() => setStart(Math.floor((tpl.stepNo - 1) / WINDOW) * WINDOW + 1)}
                aria-label={`${t("common.step", { n: tpl.stepNo })}: ${td(`steps.s${tpl.stepNo}.short`)} — ${td(`stepStatus.${status}`)}${isCurrent ? ` (${t("dashboard.currentMarker")})` : ""}`}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "relative flex h-8 w-8 shrink-0 items-center justify-center border-2 text-xs font-semibold transition-transform hover:scale-110",
                  tpl.kind === "deliberation" ? "rounded-md rotate-0" : "rounded-full",
                  DOT_STYLE[status],
                  inWindow && "ring-2 ring-teal-200 ring-offset-2 ring-offset-canvas",
                )}
              >
                {tpl.stepNo}
                {isCurrent && <MapPin className="absolute -top-4 h-3.5 w-3.5 text-navy-800" aria-hidden="true" />}
              </button>
              {i < STEP_TEMPLATES.length - 1 && <span className="mx-1 h-0.5 flex-1 rounded bg-line-strong" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>

      <ol className="grid gap-4 md:grid-cols-3">
        {visible.map((tpl, idx) => {
          const step = roadmap.steps.find((s) => s.stepNo === tpl.stepNo)!;
          const status = stepStatus(roadmap, tpl.stepNo, state.tasks, state.scoreProposals);
          const summary = taskSummary(state.tasks, roadmap.id, tpl.stepNo);
          const ownerId = stepOwnerId(state, roadmap, tpl.stepNo);
          const est = stepEstimateDays(state, roadmap.id, tpl.stepNo);
          const isCurrent = tpl.stepNo === current;
          const isDeliberation = tpl.kind === "deliberation";
          const na = status === "notApplicable";
          return (
            <li key={tpl.stepNo} className="relative">
              {idx < visible.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute z-0 bg-line-strong md:left-full md:top-1/2 md:h-0.5 md:w-4 md:-translate-y-1/2",
                    "left-8 top-full h-4 w-0.5 md:left-full",
                  )}
                />
              )}
              <Link
                href={`/roadmaps/${roadmap.id}/steps/${tpl.stepNo}`}
                className={cn(
                  "relative z-10 flex h-full flex-col overflow-hidden rounded-xl border bg-surface shadow-card transition-all hover:-translate-y-0.5 hover:shadow-raised",
                  isCurrent ? "border-navy-800 ring-2 ring-navy-800" : "border-line",
                  na && "bg-canvas opacity-80",
                )}
              >
                {isDeliberation && (
                  <div className="flex items-center gap-1.5 bg-navy-800 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white">
                    <Scale className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("stepKind.deliberation")}
                  </div>
                )}
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center border-2 text-sm font-bold",
                        isDeliberation ? "rounded-lg" : "rounded-full",
                        DOT_STYLE[status],
                      )}
                      aria-hidden="true"
                    >
                      {tpl.stepNo}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-ink-muted">
                        {t("common.step", { n: tpl.stepNo })}
                        {tpl.optional && ` · ${t("stepKind.optional")}`}
                      </p>
                      <h3 className="text-sm font-semibold leading-snug text-navy-900">{td(`steps.s${tpl.stepNo}.title`)}</h3>
                    </div>
                  </div>
                  {isCurrent && (
                    <p className="inline-flex items-center gap-1 self-start rounded-full bg-navy-800 px-2 py-0.5 text-xs font-semibold text-white">
                      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("dashboard.currentMarker")}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {!(isCurrent && status === "active") && <StepStatusBadge status={status} />}
                    {!na && <ScoreBadge score={step.approvedScore} max={getTemplate(tpl.stepNo).maxScore} />}
                  </div>
                  <dl className="mt-auto space-y-1.5 border-t border-line pt-3 text-xs text-ink-muted">
                    <div className="flex items-center gap-2">
                      <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <dt className="sr-only">{t("dashboard.responsible")}</dt>
                      <dd className="truncate text-ink">{people.name(ownerId)}</dd>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <dt className="sr-only">{t("dashboard.estimatedDuration")}</dt>
                      <dd>{est !== undefined ? t("common.days", { n: est }) : t("common.notSet")}</dd>
                    </div>
                    <div className="flex items-center gap-2">
                      <ListChecks className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <dt className="sr-only">{t("stepPage.tasks")}</dt>
                      <dd>{summary.total ? t("dashboard.tasksDone", { done: summary.done, total: summary.total }) : t("dashboard.noTasks")}</dd>
                    </div>
                  </dl>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
