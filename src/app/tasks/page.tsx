"use client";

import { ClipboardList } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { TaskRow } from "@/components/tasks/TaskRow";
import { DurationReviewList } from "@/components/tasks/TimePanels";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Select } from "@/components/ui/form";
import { EmptyState, PageHeader, Pagination, usePaged } from "@/components/ui/misc";
import { compareActionable, isOverdue } from "@/domain/insights";
import { STEP_TEMPLATES } from "@/domain/stepTemplates";
import type { TaskStatus } from "@/domain/types";
import { useI18n } from "@/i18n/I18nProvider";
import { useApp } from "@/state/AppStateProvider";

const STATUSES: TaskStatus[] = ["notStarted", "inProgress", "blocked", "done", "cancelled"];

function TasksInner() {
  const { t, td, loc } = useI18n();
  const { state, currentUser } = useApp();
  const search = useSearchParams();
  const [personId, setPersonId] = useState<string>(currentUser.id);
  const [roadmapId, setRoadmapId] = useState<string>(search.get("roadmap") ?? "all");
  const [step, setStep] = useState("all");
  const [status, setStatus] = useState<"open" | "all" | TaskStatus>("open");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const tasks = useMemo(
    () =>
      state.tasks
        .filter((x) => personId === "all" || x.ownerId === personId || x.collaboratorIds.includes(personId))
        .filter((x) => roadmapId === "all" || x.roadmapId === roadmapId)
        .filter((x) => step === "all" || (step === "impl" ? x.stepNo === null : x.stepNo === Number(step)))
        .filter((x) => (status === "all" ? true : status === "open" ? x.status !== "done" && x.status !== "cancelled" : x.status === status))
        .filter((x) => !overdueOnly || isOverdue(x, today))
        // Implementation tasks only once that phase is active; not-applicable steps are hidden.
        .filter((x) => {
          const r = state.roadmaps.find((rm) => rm.id === x.roadmapId);
          if (!r) return false;
          if (x.stepNo === null) return r.implementationActive;
          return !r.steps.find((s) => s.stepNo === x.stepNo)?.notApplicable;
        })
        .sort(compareActionable(today)),
    [state.tasks, state.roadmaps, personId, roadmapId, step, status, overdueOnly, today],
  );
  const paged = usePaged(tasks);
  const reset = () => {
    setRoadmapId("all");
    setStep("all");
    setStatus("open");
    setOverdueOnly(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("tasks.title")} description={t("tasks.intro")} />
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label={t("tasks.viewingFor")}>
            {(p) => (
              <Select {...p} value={personId} onChange={(e) => setPersonId(e.target.value)}>
                <option value="all">{t("common.all")}</option>
                {state.stakeholders.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("tasks.filterRoadmap")}>
            {(p) => (
              <Select {...p} value={roadmapId} onChange={(e) => setRoadmapId(e.target.value)}>
                <option value="all">{t("common.all")}</option>
                {state.roadmaps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {loc(r.disease).split(" (")[0]} — {loc(r.targetPopulation)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("tasks.filterStep")}>
            {(p) => (
              <Select {...p} value={step} onChange={(e) => setStep(e.target.value)}>
                <option value="all">{t("tasks.allSteps")}</option>
                {STEP_TEMPLATES.map((s) => (
                  <option key={s.stepNo} value={s.stepNo}>
                    {t("common.step", { n: s.stepNo })} · {td(`steps.s${s.stepNo}.short`)}
                  </option>
                ))}
                <option value="impl">{t("tasks.implementationPhase")}</option>
              </Select>
            )}
          </Field>
          <Field label={t("tasks.filterStatus")}>
            {(p) => (
              <Select {...p} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="open">
                  {td("taskStatus.notStarted")} / {td("taskStatus.inProgress")} / {td("taskStatus.blocked")}
                </option>
                <option value="all">{t("common.all")}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {td(`taskStatus.${s}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex flex-col justify-end gap-2 pb-1">
            <Checkbox label={t("tasks.overdueOnly")} checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
            <Button variant="ghost" size="sm" className="self-start" onClick={reset}>
              {t("common.clearFilters")}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-navy-700" aria-hidden="true" />
            {t("tasks.nextActionable")}
          </CardTitle>
          <span className="text-sm text-ink-muted">{tasks.length}</span>
        </CardHeader>
        {tasks.length === 0 ? (
          <div className="p-5">
            <EmptyState title={t("tasks.noTasks")} />
          </div>
        ) : (
          <>
            <ul className="divide-y divide-line">
              {paged.visible.map((task) => (
                <TaskRow key={task.id} task={task} showRoadmap />
              ))}
            </ul>
            <div className="px-4 pb-3">
              <Pagination page={paged.page} total={paged.total} count={paged.count} onChange={paged.setPage} />
            </div>
          </>
        )}
      </Card>

      <DurationReviewList />
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense>
      <TasksInner />
    </Suspense>
  );
}
