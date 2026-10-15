"use client";

import { ArrowLeft, ChevronLeft, ChevronRight, FileUp, MinusCircle, Pencil, Plus, Scale, ShieldAlert, UserRound } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { DocumentList } from "@/components/documents/DocumentList";
import { UploadDialog } from "@/components/documents/UploadDialog";
import { RoadmapNotFound, useRoadmapFromParams } from "@/components/roadmap/useRoadmap";
import { BilingualField, ScoreBadge, StepStatusBadge, useStakeholderLookup } from "@/components/shared";
import { ApprovalChecklist } from "@/components/step/ApprovalChecklist";
import { DeliberationPanel } from "@/components/step/DeliberationPanel";
import { EvidencePanel, FinalSelectionPanel } from "@/components/step/FinalSelectionPanel";
import { MatrixEditor } from "@/components/step/MatrixEditor";
import { PathwayPanel } from "@/components/step/PathwayPanel";
import { ReadinessPanel } from "@/components/step/ReadinessPanel";
import { OptionAssessments, OptionalStepPanel, OptionsEditor, ProcurementEditor, SummaryEditor } from "@/components/step/WorkAreas";
import { TaskEditor } from "@/components/tasks/TaskEditor";
import { TaskRow } from "@/components/tasks/TaskRow";
import { DurationReviewList, StepTimePanel } from "@/components/tasks/TimePanels";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/form";
import { EmptyState, Notice, Pagination, usePaged } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { compareActionable, stepEstimateDays, stepOwnerId } from "@/domain/insights";
import { hasPermission } from "@/domain/permissions";
import { currentStepNo, stepStatus } from "@/domain/progress";
import { CORE_STEP_COUNT, getTemplate } from "@/domain/stepTemplates";
import type { LocalizedText, Roadmap } from "@/domain/types";
import { useI18n } from "@/i18n/I18nProvider";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppStateProvider";

function DescriptionCard({ roadmap, stepNo }: { roadmap: Roadmap; stepNo: number }) {
  const { t, td, loc } = useI18n();
  const { state, currentUser, dispatch, notify } = useApp();
  const people = useStakeholderLookup();
  const step = roadmap.steps.find((s) => s.stepNo === stepNo)!;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LocalizedText>({ nl: "", en: "" });
  const [error, setError] = useState<string>();
  const canEdit = hasPermission(currentUser, "roadmap.edit", state.settings);
  const canAssign = hasPermission(currentUser, "task.assign", state.settings);
  const ownerId = stepOwnerId(state, roadmap, stepNo);
  const est = stepEstimateDays(state, roadmap.id, stepNo);
  const custom = step.customDescription && (step.customDescription.nl || step.customDescription.en);

  const save = (customDescription: LocalizedText | undefined) => {
    const res = dispatch({ type: "step.update", roadmapId: roadmap.id, stepNo, patch: { customDescription } });
    if (!res.ok) return setError(errorMessage(td, res.error));
    setEditing(false);
    notify(t("common.saved"));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("stepPage.description")}</CardTitle>
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(step.customDescription ?? { nl: td(`steps.s${stepNo}.description`), en: "" });
              setEditing(true);
            }}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            {t("stepPage.editDescription")}
          </Button>
        )}
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="leading-relaxed text-ink">{custom ? loc(step.customDescription) : td(`steps.s${stepNo}.description`)}</p>
        {custom && <Badge tone="outline">{t("stepPage.customDescription")}</Badge>}
        <dl className="grid gap-4 border-t border-line pt-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="mb-1 text-ink-muted">{t("dashboard.responsible")}</dt>
            <dd>
              {canAssign ? (
                <Field label={<span className="sr-only">{t("dashboard.responsible")}</span>}>
                  {(p) => (
                    <Select
                      {...p}
                      value={step.ownerId ?? ""}
                      onChange={(e) => {
                        const res = dispatch({ type: "step.update", roadmapId: roadmap.id, stepNo, patch: { ownerId: e.target.value || undefined } });
                        if (res.ok) notify(t("common.saved"));
                      }}
                    >
                      <option value="">
                        {t("common.notSet")} ({people.name(ownerId)})
                      </option>
                      {state.stakeholders.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.fullName}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <UserRound className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                  {people.name(ownerId)}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="mb-1 text-ink-muted">{t("stepPage.estimatedTotal")}</dt>
            <dd className="font-medium">{est !== undefined ? t("common.days", { n: est }) : t("common.notSet")}</dd>
          </div>
        </dl>
      </CardBody>
      <Dialog
        open={editing}
        onOpenChange={setEditing}
        title={t("stepPage.editDescription")}
        wide
        footer={
          <>
            {custom && (
              <Button variant="ghost" onClick={() => save(undefined)}>
                {t("stepPage.resetDescription")}
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditing(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => save(draft)}>{t("common.save")}</Button>
          </>
        }
      >
        <BilingualField label={t("stepPage.customDescription")} value={draft} onChange={setDraft} />
        {error && <Notice tone="danger">{error}</Notice>}
      </Dialog>
    </Card>
  );
}

function StepTasks({ roadmap, stepNo }: { roadmap: Roadmap; stepNo: number }) {
  const { t } = useI18n();
  const { state, can } = useApp();
  const [creating, setCreating] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const tasks = state.tasks.filter((x) => x.roadmapId === roadmap.id && x.stepNo === stepNo).sort(compareActionable(today));
  const open = tasks.filter((x) => x.status !== "done" && x.status !== "cancelled");
  const closed = tasks.filter((x) => x.status === "done" || x.status === "cancelled");
  const ordered = [...open, ...closed];
  const paged = usePaged(ordered);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("stepPage.tasks")}</CardTitle>
          {can("task.create") && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("tasks.newTask")}
            </Button>
          )}
        </CardHeader>
        {ordered.length === 0 ? (
          <CardBody>
            <EmptyState title={t("tasks.noTasksStep")} />
          </CardBody>
        ) : (
          <>
            <ul className="divide-y divide-line">
              {paged.visible.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </ul>
            <div className="px-4 pb-3">
              <Pagination page={paged.page} total={paged.total} count={paged.count} onChange={paged.setPage} />
            </div>
          </>
        )}
      </Card>
      <StepTimePanel tasks={tasks.filter((x) => x.status !== "cancelled")} stepNo={stepNo} />
      <DurationReviewList roadmapId={roadmap.id} stepNo={stepNo} />
      <TaskEditor open={creating} onOpenChange={setCreating} create={{ roadmapId: roadmap.id, stepNo }} />
    </div>
  );
}

function StepDocuments({ roadmap, stepNo }: { roadmap: Roadmap; stepNo: number }) {
  const { t } = useI18n();
  const { state, can } = useApp();
  const [open, setOpen] = useState(false);
  const docs = state.documents.filter((d) => d.roadmapId === roadmap.id && d.stepNo === stepNo);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm text-ink-muted">
          <ShieldAlert className="h-4 w-4" aria-hidden="true" />
          {t("stepPage.aggregatedOnly")}
        </p>
        {can("document.upload") && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <FileUp className="h-4 w-4" aria-hidden="true" />
            {t("documents.upload")}
          </Button>
        )}
      </div>
      <DocumentList documents={docs} showStep={false} />
      <UploadDialog open={open} onOpenChange={setOpen} roadmapId={roadmap.id} stepNo={stepNo} />
    </div>
  );
}

function WorkArea({ roadmap, stepNo }: { roadmap: Roadmap; stepNo: number }) {
  const { t } = useI18n();
  const step = roadmap.steps.find((s) => s.stepNo === stepNo)!;
  return (
    <div className="space-y-6">
      {stepNo === 1 && <OptionsEditor roadmap={roadmap} />}
      {stepNo === 2 && (
        <Notice tone="warning" icon={ShieldAlert}>
          {t("stepPage.aggregatedOnly")}
        </Notice>
      )}
      {stepNo === 4 && <ProcurementEditor roadmap={roadmap} />}
      {stepNo === 5 && <OptionAssessments roadmap={roadmap} step={step} kind="routes" />}
      {stepNo === 6 && <OptionalStepPanel roadmap={roadmap} step={step} />}
      {stepNo === 7 && <OptionAssessments roadmap={roadmap} step={step} kind="cea" />}
      {stepNo === 8 && <EvidencePanel roadmap={roadmap} />}
      {stepNo === 9 && <ApprovalChecklist roadmap={roadmap} />}
      {!(stepNo === 6 && step.optionalDecision === "skipped") && <SummaryEditor roadmap={roadmap} step={step} />}
    </div>
  );
}

function StepPageInner() {
  const roadmap = useRoadmapFromParams();
  const params = useParams<{ step: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { t, td, loc } = useI18n();
  const { state } = useApp();
  const stepNo = Number(params.step);
  if (!roadmap) return <RoadmapNotFound />;
  if (!Number.isInteger(stepNo) || stepNo < 1 || stepNo > CORE_STEP_COUNT) return <RoadmapNotFound />;

  const tpl = getTemplate(stepNo);
  const step = roadmap.steps.find((s) => s.stepNo === stepNo)!;
  const status = stepStatus(roadmap, stepNo, state.tasks, state.scoreProposals);
  const isDeliberation = tpl.kind === "deliberation";
  const isCurrent = currentStepNo(roadmap) === stepNo;
  const tabs = ["overview", ...(isDeliberation ? ["deliberation", "matrix"] : []), "tasks", "readiness", "documents"];
  const requested = search.get("tab");
  const tab = requested && tabs.includes(requested) ? requested : "overview";
  const docCount = state.documents.filter((d) => d.roadmapId === roadmap.id && d.stepNo === stepNo && !d.supersededById).length;
  const openTasks = state.tasks.filter((x) => x.roadmapId === roadmap.id && x.stepNo === stepNo && x.status !== "done" && x.status !== "cancelled").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/roadmaps/${roadmap.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("stepPage.backToRoadmap")}
        </Link>
        <nav aria-label={t("dashboard.roadmapTrack")} className="flex gap-2">
          {stepNo > 1 && (
            <Link href={`/roadmaps/${roadmap.id}/steps/${stepNo - 1}`} className={buttonClasses("outline", "sm")}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              {t("stepPage.previousStep")}
            </Link>
          )}
          {stepNo < CORE_STEP_COUNT && (
            <Link href={`/roadmaps/${roadmap.id}/steps/${stepNo + 1}`} className={buttonClasses("outline", "sm")}>
              {t("stepPage.nextStep")}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </nav>
      </div>

      <header className={cn("overflow-hidden rounded-xl border bg-surface shadow-card", isDeliberation ? "border-navy-800" : "border-line")}>
        {isDeliberation && (
          <div className="flex items-center gap-2 bg-navy-800 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white">
            <Scale className="h-4 w-4" aria-hidden="true" />
            {t("deliberation.formalBadge")}
          </div>
        )}
        <div className="flex flex-wrap items-start gap-4 p-5">
          <span
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center text-lg font-bold",
              isDeliberation ? "rounded-xl bg-navy-800 text-white" : "rounded-full bg-teal-50 text-teal-800",
            )}
            aria-hidden="true"
          >
            {stepNo}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
              {t("common.step", { n: stepNo })} · {t(`stepKind.${tpl.kind}`)}
              {tpl.optional && ` · ${t("stepKind.optional")}`} · {loc(roadmap.disease).split(" (")[0]}
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-navy-900 sm:text-2xl">{td(`steps.s${stepNo}.title`)}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StepStatusBadge status={status} />
              {isCurrent && status !== "active" && <StepStatusBadge status="active" />}
              {!step.notApplicable && <ScoreBadge score={step.approvedScore} max={tpl.maxScore} />}
              {stepNo === 3 && roadmap.pathway !== "undecided" && (
                <Badge tone={roadmap.pathway === "publicHealth" ? "teal" : "amber"}>{t("pathway.selectedRouteBanner", { route: td(`pathway.${roadmap.pathway}`) })}</Badge>
              )}
            </div>
          </div>
        </div>
        {step.notApplicable && (
          <div className="flex items-start gap-2 border-t border-line bg-canvas px-5 py-3 text-sm text-ink-muted">
            <MinusCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {t("stepPage.notApplicableBanner", { reason: step.naReason || "—" })}
          </div>
        )}
      </header>

      <Tabs value={tab} onValueChange={(v) => router.replace(`/roadmaps/${roadmap.id}/steps/${stepNo}${v === "overview" ? "" : `?tab=${v}`}`, { scroll: false })}>
        <TabsList>
          <TabsTrigger value="overview">{t("stepPage.overview")}</TabsTrigger>
          {isDeliberation && <TabsTrigger value="deliberation">{t("stepPage.deliberation")}</TabsTrigger>}
          {isDeliberation && <TabsTrigger value="matrix">{t("stepPage.matrix")}</TabsTrigger>}
          <TabsTrigger value="tasks">
            {t("stepPage.tasks")}
            {openTasks > 0 && <Badge tone="neutral">{openTasks}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="readiness">{t("stepPage.readiness")}</TabsTrigger>
          <TabsTrigger value="documents">
            {t("stepPage.documents")}
            {docCount > 0 && <Badge tone="neutral">{docCount}</Badge>}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-6">
          <DescriptionCard roadmap={roadmap} stepNo={stepNo} />
          <WorkArea roadmap={roadmap} stepNo={stepNo} />
        </TabsContent>
        {isDeliberation && (
          <TabsContent value="deliberation" className="space-y-6">
            <DeliberationPanel roadmap={roadmap} stepNo={stepNo} />
            {stepNo === 3 && <PathwayPanel roadmap={roadmap} />}
            {stepNo === 8 && <FinalSelectionPanel roadmap={roadmap} />}
          </TabsContent>
        )}
        {isDeliberation && (
          <TabsContent value="matrix">
            <MatrixEditor roadmap={roadmap} readOnly={stepNo === 8} />
          </TabsContent>
        )}
        <TabsContent value="tasks">
          <StepTasks roadmap={roadmap} stepNo={stepNo} />
        </TabsContent>
        <TabsContent value="readiness">
          <ReadinessPanel roadmap={roadmap} stepNo={stepNo} />
        </TabsContent>
        <TabsContent value="documents">
          <StepDocuments roadmap={roadmap} stepNo={stepNo} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function StepPage() {
  return (
    <Suspense>
      <StepPageInner />
    </Suspense>
  );
}
