"use client";

import { Check, CornerUpLeft } from "lucide-react";
import { useState } from "react";
import { useStakeholderLookup } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { EmptyState, Notice, Pagination, usePaged } from "@/components/ui/misc";
import { overallAverage, personalAverage, stepAverage } from "@/domain/durations";
import { hasPermission } from "@/domain/permissions";
import type { DurationRecord, Task } from "@/domain/types";
import { useI18n } from "@/i18n/I18nProvider";
import { errorMessage } from "@/lib/errors";
import { useApp } from "@/state/AppStateProvider";

function fmt(n: number | null | undefined) {
  return n === null || n === undefined ? "—" : (Math.round(n * 10) / 10).toString();
}

/** Estimated vs actual per task, with historical comparisons (institutional learning, no rankings). */
export function StepTimePanel({ tasks, stepNo }: { tasks: Task[]; stepNo: number | null }) {
  const { t, loc } = useI18n();
  const { state } = useApp();
  const people = useStakeholderLookup();
  const paged = usePaged(tasks);
  const avg = stepAverage(state.durationRecords, stepNo);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{t("stepPage.time")}</CardTitle>
          <p className="mt-0.5 text-xs text-ink-muted">{t("durations.learningNote")}</p>
        </div>
        <Badge tone="neutral">
          {t("stepPage.stepAverage")}: {avg.average === null ? "—" : t("common.daysShort", { n: fmt(avg.average) })} ({t("durations.sampleSize", { n: avg.sampleSize })})
        </Badge>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="bg-canvas text-left text-xs text-ink-muted">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">{t("settings.columns.task")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("tasks.estimated")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("tasks.actual")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("tasks.difference")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("durations.personalAvg")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("durations.overallAvg")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {paged.visible.map((task) => {
              const rec = [...state.durationRecords].reverse().find((d) => d.taskId === task.id && d.status !== "cancelled");
              const personal = task.ownerId ? personalAverage(state.durationRecords, task.templateKey, task.ownerId) : { average: null, sampleSize: 0 };
              const overall = overallAverage(state.durationRecords, task.templateKey);
              const diff = rec && task.estimatedDays !== undefined ? rec.actualDays - task.estimatedDays : null;
              return (
                <tr key={task.id}>
                  <td className="px-4 py-2">
                    <span className="font-medium">{loc(task.title)}</span>
                    <span className="block text-xs text-ink-muted">{people.name(task.ownerId)}</span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{fmt(task.estimatedDays)}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {rec ? (
                      <>
                        {rec.actualDays}
                        {rec.status !== "accepted" && <span className="ml-1 text-xs text-amber-700">({t(`durations.statuses.${rec.status}`)})</span>}
                        {rec.method === "manual" && <span className="ml-1 text-xs text-ink-muted">({t("durations.manual").split(" (")[0]})</span>}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{diff === null ? "—" : `${diff > 0 ? "+" : ""}${diff}`}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {fmt(personal.average)} <span className="text-xs text-ink-muted">({t("durations.sampleSize", { n: personal.sampleSize })})</span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {fmt(overall.average)} <span className="text-xs text-ink-muted">({t("durations.sampleSize", { n: overall.sampleSize })})</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 pb-3">
        <Pagination page={paged.page} total={paged.total} count={paged.count} onChange={paged.setPage} />
      </div>
    </Card>
  );
}

function ReviewRow({ record }: { record: DurationRecord }) {
  const { t, td, loc } = useI18n();
  const { state, dispatch, notify } = useApp();
  const people = useStakeholderLookup();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const task = state.tasks.find((x) => x.id === record.taskId);
  const act = (decision: "accepted" | "returned") => {
    const res = dispatch({ type: "duration.review", recordId: record.id, decision, note });
    if (!res.ok) return setError(errorMessage(td, res.error));
    notify(td(`durations.statuses.${decision}`));
  };
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{task ? loc(task.title) : record.templateKey}</span>
        <Badge tone="amber">{t("durations.statuses.submitted")}</Badge>
      </div>
      <p className="text-xs text-ink-muted">
        {people.name(record.stakeholderId)} · {t("tasks.actual")}: {t("common.days", { n: record.actualDays })}
        {record.estimatedDays !== undefined && ` · ${t("tasks.estimated")}: ${record.estimatedDays}`}
        {record.benchmark &&
          ` · ${record.benchmark.kind === "personal" ? t("durations.personalAvg") : `${t("durations.overallAvg")} (${t("durations.provisional")})`}: ${fmt(record.benchmark.average)} (n = ${record.benchmark.sampleSize})`}
      </p>
      {record.reason && <p className="rounded-md bg-amber-50 px-2 py-1 text-sm text-amber-800">{record.reason}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Input className="h-8 max-w-xs text-xs" placeholder={t("durations.reviewNote")} aria-label={t("durations.reviewNote")} value={note} onChange={(e) => setNote(e.target.value)} />
        <Button size="sm" onClick={() => act("accepted")}>
          <Check className="h-4 w-4" aria-hidden="true" />
          {t("durations.accept")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => act("returned")}>
          <CornerUpLeft className="h-4 w-4" aria-hidden="true" />
          {t("durations.returnRecord")}
        </Button>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
    </li>
  );
}

/** Submitted durations awaiting review by an authorized reviewer. */
export function DurationReviewList({ roadmapId, stepNo }: { roadmapId?: string; stepNo?: number | null }) {
  const { t } = useI18n();
  const { state, currentUser } = useApp();
  const items = state.durationRecords.filter(
    (d) => d.status === "submitted" && (!roadmapId || d.roadmapId === roadmapId) && (stepNo === undefined || d.stepNo === stepNo),
  );
  const paged = usePaged(items);
  if (!hasPermission(currentUser, "duration.review", state.settings)) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("durations.pendingReview")}</CardTitle>
      </CardHeader>
      {items.length === 0 ? (
        <CardBody>
          <EmptyState title={t("durations.noPending")} />
        </CardBody>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {paged.visible.map((r) => (
              <ReviewRow key={r.id} record={r} />
            ))}
          </ul>
          <div className="px-4 pb-3">
            <Pagination page={paged.page} total={paged.total} count={paged.count} onChange={paged.setPage} />
          </div>
        </>
      )}
    </Card>
  );
}
