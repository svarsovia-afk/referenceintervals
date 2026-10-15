"use client";

import { ArrowRight, CalendarClock, CheckCircle2, ClipboardList, FileText, Info, Lock, MinusCircle, Scale, Target, Unlock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ContactResponsibleButton } from "@/components/roadmap/ContactButton";
import { RoadmapTrack } from "@/components/roadmap/RoadmapTrack";
import { RoadmapNotFound, todayIso, useRoadmapFromParams } from "@/components/roadmap/useRoadmap";
import { SampleBadge, TaskStatusBadge, useStakeholderLookup } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/misc";
import { implementationGate } from "@/domain/approvals";
import { isOverdue, nextAction, outstandingTasks } from "@/domain/insights";
import { computeProgress, currentStepNo, estimateDaysToStep, isStepComplete } from "@/domain/progress";
import type { Roadmap } from "@/domain/types";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppStateProvider";

function ProgressPanel({ roadmap }: { roadmap: Roadmap }) {
  const { t, td } = useI18n();
  const [open, setOpen] = useState(false);
  const p = computeProgress(roadmap);
  const current = currentStepNo(roadmap);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("dashboard.progress")}</p>
          <p className="text-3xl font-semibold tabular-nums text-navy-900">{p.percent}%</p>
        </div>
        <div className="text-right text-sm">
          <p className="text-ink-muted">{t("dashboard.currentStage")}</p>
          <p className="font-medium text-navy-900">
            {current ? `${t("common.step", { n: current })} · ${td(`steps.s${current}.short`)}` : t("dashboard.allStepsComplete")}
          </p>
        </div>
      </div>
      <ProgressBar value={p.percent} label={t("dashboard.progress")} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
        <span>{t("dashboard.applicableSteps", { n: p.applicableCount })}</span>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex items-center gap-1 font-medium text-teal-700 hover:underline">
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          {t("dashboard.progressExplain")}
        </button>
      </div>
      {open && (
        <div className="animate-fade-in rounded-lg border border-line bg-canvas p-3 text-xs text-ink-muted">
          <p className="mb-2 leading-relaxed">{t("dashboard.progressFormula")}</p>
          <ul className="grid grid-cols-3 gap-x-3 gap-y-1 sm:grid-cols-9">
            {p.breakdown.map((b) => (
              <li key={b.stepNo} className="tabular-nums">
                <span className="font-semibold text-ink">{b.stepNo}:</span> {b.applicable ? `${b.approvedScore}/${b.maxScore}` : "n.v.t./N/A"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function NextActionCard({ roadmap }: { roadmap: Roadmap }) {
  const { t, loc, formatDate } = useI18n();
  const { state, currentUser } = useApp();
  const people = useStakeholderLookup();
  const na = nextAction(state, roadmap, currentUser.id, todayIso());
  return (
    <Card className="border-l-4 border-l-teal-600">
      <CardHeader className="border-b-0 pb-0">
        <CardTitle className="flex items-center gap-2">
          <Target className="h-4 w-4 text-teal-700" aria-hidden="true" />
          {t("dashboard.nextAction")}
        </CardTitle>
      </CardHeader>
      <CardBody>
        {!na && <p className="text-sm text-ink-muted">{t("dashboard.noNextAction")}</p>}
        {na && (na.kind === "review" || na.kind === "approve") && (
          <div className="space-y-3">
            <p className="font-medium text-navy-900">
              {t(na.kind === "review" ? "dashboard.reviewPending" : "dashboard.approvePending", { n: na.proposal.stepNo })}
            </p>
            <p className="text-sm text-ink-muted">
              {na.proposal.previousScore} → {na.proposal.proposedScore} · {people.name(na.proposal.proposedBy)}
            </p>
            <Link href={`/roadmaps/${roadmap.id}/steps/${na.proposal.stepNo}?tab=readiness`} className={buttonClasses("primary", "sm")}>
              {t("readiness.review")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        )}
        {na && na.kind === "task" && (
          <div className="space-y-3">
            <p className="font-medium text-navy-900">{loc(na.task.title)}</p>
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
              <TaskStatusBadge status={na.task.status} />
              <span>{people.name(na.task.ownerId)}</span>
              {na.task.plannedEnd && (
                <span className={cn(isOverdue(na.task, todayIso()) && "font-medium text-coral-700")}>
                  · {t("tasks.due", { date: formatDate(na.task.plannedEnd) })}
                </span>
              )}
            </div>
            <Link
              href={na.task.stepNo ? `/roadmaps/${roadmap.id}/steps/${na.task.stepNo}?tab=tasks` : `/roadmaps/${roadmap.id}/implementation`}
              className={buttonClasses("primary", "sm")}
            >
              {t("common.open")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function OutstandingCard({ roadmap }: { roadmap: Roadmap }) {
  const { t, loc, formatDate } = useI18n();
  const { state } = useApp();
  const people = useStakeholderLookup();
  const today = todayIso();
  const tasks = outstandingTasks(state, roadmap, today).slice(0, 5);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-navy-700" aria-hidden="true" />
          {t("dashboard.outstandingTasks")}
        </CardTitle>
        <Link href={`/tasks?roadmap=${roadmap.id}`} className="text-sm font-medium text-teal-700 hover:underline">
          {t("dashboard.viewAllTasks")}
        </Link>
      </CardHeader>
      <ul className="divide-y divide-line">
        {tasks.length === 0 && <li className="px-5 py-4 text-sm text-ink-muted">{t("tasks.noTasks")}</li>}
        {tasks.map((task) => (
          <li key={task.id}>
            <Link href={task.stepNo ? `/roadmaps/${roadmap.id}/steps/${task.stepNo}?tab=tasks` : `/roadmaps/${roadmap.id}/implementation`} className="flex items-start gap-3 px-5 py-3 hover:bg-canvas">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy-50 text-xs font-semibold text-navy-800" aria-hidden="true">
                {task.stepNo ?? "•"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{loc(task.title)}</span>
                <span className="block text-xs text-ink-muted">
                  {task.stepNo ? t("common.step", { n: task.stepNo }) : t("tasks.implementationPhase")} · {people.name(task.ownerId)}
                  {task.plannedEnd && ` · ${formatDate(task.plannedEnd)}`}
                </span>
              </span>
              {isOverdue(task, today) ? <Badge tone="coral">{t("tasks.overdue")}</Badge> : <TaskStatusBadge status={task.status} />}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MilestonesCard({ roadmap }: { roadmap: Roadmap }) {
  const { t, formatDate } = useI18n();
  const { state } = useApp();
  const milestones = [
    { stepNo: 3, label: t("dashboard.firstDeliberation"), icon: Scale },
    { stepNo: 8, label: t("dashboard.secondDeliberation"), icon: Scale },
    { stepNo: 9, label: t("dashboard.approvalMilestone"), icon: CheckCircle2 },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-navy-700" aria-hidden="true" />
          {t("dashboard.milestones")}
        </CardTitle>
      </CardHeader>
      <ul className="divide-y divide-line">
        {milestones.map((m) => {
          const step = roadmap.steps.find((s) => s.stepNo === m.stepNo)!;
          const done = isStepComplete(step);
          const days = estimateDaysToStep(roadmap, state.tasks, m.stepNo);
          const date = step.deliberation?.date;
          let detail: string;
          if (step.notApplicable) detail = t("dashboard.milestoneNA");
          else if (done) detail = t("dashboard.milestoneDone");
          else if (date && !step.deliberation?.held) detail = t("dashboard.milestoneScheduled", { date: formatDate(date) });
          else if (days === null) detail = t("dashboard.insufficientData");
          else detail = t("dashboard.estimatedRemaining", { n: days });
          const Icon = step.notApplicable ? MinusCircle : done ? CheckCircle2 : m.icon;
          return (
            <li key={m.stepNo}>
              <Link href={`/roadmaps/${roadmap.id}/steps/${m.stepNo}`} className="flex items-center gap-3 px-5 py-3 hover:bg-canvas">
                <Icon className={cn("h-5 w-5 shrink-0", done ? "text-teal-600" : step.notApplicable ? "text-ink-subtle" : "text-navy-700")} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">{m.label}</span>
                  <span className="block text-xs text-ink-muted">{detail}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ImplementationCard({ roadmap }: { roadmap: Roadmap }) {
  const { t, td } = useI18n();
  const { state } = useApp();
  if (roadmap.pathway === "curative") return null;
  const gate = implementationGate(roadmap, state.settings);
  const Icon = roadmap.implementationActive || gate.canActivate ? Unlock : Lock;
  return (
    <Card className={cn("flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center", !roadmap.implementationActive && !gate.canActivate && "bg-canvas")}>
      <span className={cn("flex h-10 w-10 items-center justify-center rounded-lg", roadmap.implementationActive ? "bg-teal-600 text-white" : "bg-navy-50 text-navy-700")}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-navy-900">{t("dashboard.implementationPhase")}</p>
        <p className="text-sm text-ink-muted">
          {roadmap.implementationActive
            ? t("dashboard.implementationActive")
            : gate.canActivate
              ? t("dashboard.implementationReady")
              : `${t("dashboard.implementationLocked")} ${t("approvals.approvalsOutstanding", { items: gate.missing.map((k) => td(`approvals.items.${k}`)).join("; ") })}`}
        </p>
      </div>
      <Link href={`/roadmaps/${roadmap.id}/implementation`} className={buttonClasses("outline", "sm")}>
        {t("dashboard.openImplementation")}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </Card>
  );
}

export default function RoadmapDashboardPage() {
  const roadmap = useRoadmapFromParams();
  const { t, td, loc } = useI18n();
  const people = useStakeholderLookup();
  if (!roadmap) return <RoadmapNotFound />;
  const pathwayTone = roadmap.pathway === "publicHealth" ? "teal" : roadmap.pathway === "curative" ? "amber" : "neutral";

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_minmax(0,26rem)]">
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{t("dashboard.title")}</p>
              {roadmap.isSample && <SampleBadge />}
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-navy-900 sm:text-3xl">{loc(roadmap.disease)}</h1>
              <p className="mt-1 text-ink-muted">
                {t("dashboard.targetPopulation")}: <span className="font-medium text-ink">{loc(roadmap.targetPopulation)}</span> · {loc(roadmap.geographicScope)}
              </p>
            </div>
            <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <div>
                <dt className="text-ink-muted">{t("dashboard.roadmapOwner")}</dt>
                <dd className="font-medium">{people.name(roadmap.ownerId)}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">{t("dashboard.pathway")}</dt>
                <dd>
                  <Badge tone={pathwayTone}>{td(`pathway.${roadmap.pathway}`)}</Badge>
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2">
              <ContactResponsibleButton
                subject={t("stakeholders.emailSubject", { roadmap: `${loc(roadmap.disease)} — ${loc(roadmap.targetPopulation)}` })}
                body={t("stakeholders.emailBody", { roadmap: `${loc(roadmap.disease)} — ${loc(roadmap.targetPopulation)}` })}
              />
              <Link href={`/roadmaps/${roadmap.id}/documents`} className={buttonClasses("ghost")}>
                <FileText className="h-4 w-4" aria-hidden="true" />
                {t("dashboard.roadmapDocuments")}
              </Link>
            </div>
          </div>
          <div className="rounded-xl border border-line bg-canvas p-4">
            <ProgressPanel roadmap={roadmap} />
            <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t("dashboard.notApprovedNote")}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        <NextActionCard roadmap={roadmap} />
        <OutstandingCard roadmap={roadmap} />
        <MilestonesCard roadmap={roadmap} />
      </div>

      <RoadmapTrack roadmap={roadmap} />

      <ImplementationCard roadmap={roadmap} />
    </div>
  );
}
