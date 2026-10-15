"use client";

import { ArrowRight, FileUp, Lock, Plus, Radar, Unlock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DocumentList } from "@/components/documents/DocumentList";
import { UploadDialog } from "@/components/documents/UploadDialog";
import { RoadmapNotFound, useRoadmapFromParams } from "@/components/roadmap/useRoadmap";
import { TaskEditor } from "@/components/tasks/TaskEditor";
import { TaskRow } from "@/components/tasks/TaskRow";
import { DurationReviewList, StepTimePanel } from "@/components/tasks/TimePanels";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Notice, PageHeader, Pagination, usePaged } from "@/components/ui/misc";
import { implementationGate } from "@/domain/approvals";
import { compareActionable } from "@/domain/insights";
import { useI18n } from "@/i18n/I18nProvider";
import { errorMessage } from "@/lib/errors";
import { useApp } from "@/state/AppStateProvider";

export default function ImplementationPage() {
  const roadmap = useRoadmapFromParams();
  const { t, td, loc, formatDate } = useI18n();
  const { state, can, dispatch, notify } = useApp();
  const [confirm, setConfirm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const tasks = roadmap ? state.tasks.filter((x) => x.roadmapId === roadmap.id && x.stepNo === null).sort(compareActionable(today)) : [];
  const paged = usePaged(tasks);
  if (!roadmap) return <RoadmapNotFound />;

  const gate = implementationGate(roadmap, state.settings);
  const docs = state.documents.filter((d) => d.roadmapId === roadmap.id && d.stepNo === null);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`${loc(roadmap.disease).split(" (")[0]} · ${loc(roadmap.targetPopulation)}`} title={t("implementation.title")} description={t("implementation.subtitle")} />

      {roadmap.pathway === "curative" ? (
        <Notice tone="info">{t("implementation.curative")}</Notice>
      ) : !roadmap.implementationActive ? (
        <Card className="p-5">
          <div className="flex flex-wrap items-start gap-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-navy-50 text-navy-700">
              {gate.canActivate ? <Unlock className="h-5 w-5" aria-hidden="true" /> : <Lock className="h-5 w-5" aria-hidden="true" />}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="font-semibold text-navy-900">{gate.canActivate ? t("implementation.readyToActivate") : t("implementation.locked")}</p>
              {!gate.canActivate && (
                <>
                  <p className="text-sm text-ink-muted">{t("implementation.missing")}</p>
                  <ul className="list-disc space-y-0.5 pl-5 text-sm">
                    {gate.missing.map((k) => (
                      <li key={k}>{td(`approvals.items.${k}`)}</li>
                    ))}
                  </ul>
                  <Link href={`/roadmaps/${roadmap.id}/steps/9`} className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:underline">
                    {t("common.step", { n: 9 })} · {td("steps.s9.short")}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </>
              )}
            </div>
            {gate.canActivate && can("implementation.activate") && <Button onClick={() => setConfirm(true)}>{t("implementation.activate")}</Button>}
          </div>
        </Card>
      ) : (
        <Notice tone="success" icon={Radar}>
          {t("dashboard.implementationActive")} · {t("implementation.activeSince", { date: formatDate(roadmap.implementationActivatedAt) })}
        </Notice>
      )}

      <Card className={roadmap.implementationActive ? "" : "opacity-70"}>
        <CardHeader>
          <div>
            <CardTitle>{t("implementation.checklist")}</CardTitle>
            <p className="mt-0.5 max-w-2xl text-xs text-ink-muted">{t("implementation.methodology")}</p>
          </div>
          {roadmap.implementationActive && can("task.create") && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("tasks.newTask")}
            </Button>
          )}
        </CardHeader>
        {roadmap.implementationActive ? (
          <ul className="divide-y divide-line">
            {paged.visible.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </ul>
        ) : (
          <ol className="divide-y divide-line">
            {paged.visible.map((task, i) => (
              <li key={task.id} className="flex items-center gap-3 px-5 py-3 text-sm text-ink-muted">
                <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="tabular-nums">{(paged.page - 1) * paged.pageSize + i + 1}.</span>
                {loc(task.title)}
              </li>
            ))}
          </ol>
        )}
        <CardBody className="pt-0">
          <Pagination page={paged.page} total={paged.total} count={paged.count} onChange={paged.setPage} />
        </CardBody>
      </Card>

      {roadmap.implementationActive && (
        <>
          <StepTimePanel tasks={tasks.filter((x) => x.status !== "cancelled")} stepNo={null} />
          <DurationReviewList roadmapId={roadmap.id} stepNo={null} />
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-navy-900">{t("nav.documents")}</h2>
              {can("document.upload") && (
                <Button size="sm" variant="secondary" onClick={() => setUploading(true)}>
                  <FileUp className="h-4 w-4" aria-hidden="true" />
                  {t("documents.upload")}
                </Button>
              )}
            </div>
            <DocumentList documents={docs} showStep={false} />
          </section>
          <TaskEditor open={creating} onOpenChange={setCreating} create={{ roadmapId: roadmap.id, stepNo: null }} />
          <UploadDialog open={uploading} onOpenChange={setUploading} roadmapId={roadmap.id} stepNo={null} category="surveillancePlan" />
        </>
      )}

      <Link href={`/roadmaps/${roadmap.id}`} className={buttonClasses("ghost", "sm")}>
        {t("stepPage.backToRoadmap")}
      </Link>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        description={t("implementation.activateConfirm")}
        onConfirm={() => {
          const res = dispatch({ type: "implementation.activate", roadmapId: roadmap.id });
          if (!res.ok) notify(errorMessage(td, res.error), "error");
          else notify(t("dashboard.implementationActive"));
          setConfirm(false);
        }}
      />
    </div>
  );
}
