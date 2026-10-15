"use client";

import { CheckCheck, Clock, Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EmailOwnerLink } from "@/components/roadmap/ContactButton";
import { TaskStatusBadge, useStakeholderLookup } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isOverdue } from "@/domain/insights";
import { canEditTask, hasPermission } from "@/domain/permissions";
import type { Task } from "@/domain/types";
import { useI18n } from "@/i18n/I18nProvider";
import { useApp } from "@/state/AppStateProvider";
import { DurationDialog } from "./DurationDialog";
import { TaskEditor } from "./TaskEditor";

export function TaskRow({ task, showRoadmap }: { task: Task; showRoadmap?: boolean }) {
  const { t, td, loc, formatDate } = useI18n();
  const { state, currentUser } = useApp();
  const people = useStakeholderLookup();
  const [editing, setEditing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const roadmap = state.roadmaps.find((r) => r.id === task.roadmapId);
  const record = [...state.durationRecords].reverse().find((d) => d.taskId === task.id && d.status !== "cancelled");
  const editable = canEditTask(currentUser, task, state.settings);
  const canComplete = editable && hasPermission(currentUser, "duration.record", state.settings) && task.status !== "done" && task.status !== "cancelled";
  const owner = people.get(task.ownerId);
  const overdue = isOverdue(task, today);
  const stepHref = task.stepNo ? `/roadmaps/${task.roadmapId}/steps/${task.stepNo}?tab=tasks` : `/roadmaps/${task.roadmapId}/implementation`;

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-ink">{loc(task.title)}</p>
            {task.priority === "high" && <Badge tone="amber">{td("priority.high")}</Badge>}
            {overdue && <Badge tone="coral">{t("tasks.overdue")}</Badge>}
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {showRoadmap && roadmap && (
              <>
                <Link href={stepHref} className="font-medium text-teal-700 hover:underline">
                  {loc(roadmap.disease).split(" (")[0]} · {task.stepNo ? t("common.step", { n: task.stepNo }) : t("tasks.implementationPhase")}
                </Link>
                {" · "}
              </>
            )}
            {people.name(task.ownerId)}
            {task.collaboratorIds.length > 0 && ` + ${task.collaboratorIds.map((id) => people.name(id)).join(", ")}`}
            {task.plannedEnd && ` · ${t("tasks.due", { date: formatDate(task.plannedEnd) })}`}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {t("tasks.estimated")}: {task.estimatedDays !== undefined ? t("common.daysShort", { n: task.estimatedDays }) : "—"}
            </span>
            {record && (
              <span>
                {t("tasks.actual")}: {t("common.daysShort", { n: record.actualDays })}
                {record.estimatedDays !== undefined && ` (${record.actualDays - record.estimatedDays >= 0 ? "+" : ""}${record.actualDays - record.estimatedDays})`}
                {" · "}
                <span className={record.status === "returned" ? "text-coral-700" : record.status === "submitted" ? "text-amber-700" : ""}>{td(`durations.statuses.${record.status}`)}</span>
              </span>
            )}
          </p>
          {task.status === "blocked" && task.blocker && <p className="mt-1 text-xs font-medium text-coral-700">{task.blocker}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <TaskStatusBadge status={task.status} />
          {canComplete && (
            <Button variant="secondary" size="sm" onClick={() => setCompleting(true)}>
              <CheckCheck className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t("tasks.complete")}</span>
            </Button>
          )}
          <EmailOwnerLink compact email={owner?.email} subject={t("stakeholders.emailTaskSubject", { task: loc(task.title), roadmap: roadmap ? loc(roadmap.disease) : "" })} />
          <Button variant="ghost" size="icon" onClick={() => setEditing(true)} aria-label={`${editable ? t("common.edit") : t("common.view")}: ${loc(task.title)}`}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <TaskEditor open={editing} onOpenChange={setEditing} task={task} />
      {completing && <DurationDialog open={completing} onOpenChange={setCompleting} task={task} />}
    </li>
  );
}
