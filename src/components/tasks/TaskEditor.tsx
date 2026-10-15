"use client";

import { useEffect, useState } from "react";
import { BilingualField } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { newTask } from "@/domain/factory";
import { makeId } from "@/domain/ids";
import { canEditTask } from "@/domain/permissions";
import type { Priority, Task, TaskStatus } from "@/domain/types";
import { useI18n } from "@/i18n/I18nProvider";
import { errorMessage } from "@/lib/errors";
import { useApp } from "@/state/AppStateProvider";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Existing task to edit, or creation context. */
  task?: Task;
  create?: { roadmapId: string; stepNo: number | null };
}

const EDITABLE_STATUSES: TaskStatus[] = ["notStarted", "inProgress", "blocked", "cancelled"];

export function TaskEditor({ open, onOpenChange, task, create }: Props) {
  const { t, td } = useI18n();
  const { state, dispatch, notify, can, currentUser } = useApp();
  const [draft, setDraft] = useState<Task | null>(null);
  const [error, setError] = useState<string>();

  const createRoadmapId = create?.roadmapId;
  const createStepNo = create?.stepNo;
  useEffect(() => {
    if (!open) return;
    setError(undefined);
    if (task) setDraft(structuredClone(task));
    else if (createRoadmapId !== undefined && createStepNo !== undefined)
      setDraft(
        newTask({
          id: makeId("task"),
          roadmapId: createRoadmapId,
          stepNo: createStepNo,
          templateKey: `custom-${createStepNo ?? "impl"}`,
          title: { nl: "", en: "" },
          ownerId: currentUser.id,
        }),
      );
    // Re-initialise only when the dialog opens or its subject changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id, createRoadmapId, createStepNo]);

  if (!draft) return null;
  const editable = task ? canEditTask(currentUser, task, state.settings) : can("task.create");
  const canAssign = can("task.assign") || (!task && can("task.create"));
  const set = <K extends keyof Task>(key: K, value: Task[K]) => setDraft({ ...draft, [key]: value });
  const num = (v: string) => (v === "" ? undefined : Math.max(0, Number(v)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = task
      ? dispatch({
          type: "task.update",
          taskId: task.id,
          patch: {
            title: draft.title,
            description: draft.description,
            ownerId: draft.ownerId,
            collaboratorIds: draft.collaboratorIds,
            status: draft.status,
            priority: draft.priority,
            estimatedDays: draft.estimatedDays,
            plannedStart: draft.plannedStart || undefined,
            plannedEnd: draft.plannedEnd || undefined,
            actualStart: draft.actualStart || undefined,
            notes: draft.notes,
            blocker: draft.blocker,
          },
        })
      : dispatch({ type: "task.create", task: draft });
    if (!res.ok) return setError(errorMessage(td, res.error));
    notify(t("common.saved"));
    onOpenChange(false);
  };

  const statuses = draft.status === "done" ? (["done", ...EDITABLE_STATUSES] as TaskStatus[]) : EDITABLE_STATUSES;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={task ? t("tasks.editTask") : t("tasks.newTask")} wide>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {!editable && <Notice tone="warning">{t("tasks.readOnly")}</Notice>}
        <fieldset disabled={!editable} className="space-y-4">
          <BilingualField label={t("tasks.taskTitle")} value={draft.title} onChange={(v) => set("title", v)} multiline={false} required />
          <BilingualField label={t("tasks.description")} value={draft.description} onChange={(v) => set("description", v)} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t("tasks.owner")}>
              {(p) => (
                <Select {...p} value={draft.ownerId ?? ""} onChange={(e) => set("ownerId", e.target.value || undefined)} disabled={!canAssign}>
                  <option value="">{t("common.unassigned")}</option>
                  {state.stakeholders.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("tasks.status")}>
              {(p) => (
                <Select {...p} value={draft.status} onChange={(e) => set("status", e.target.value as TaskStatus)}>
                  {statuses.map((s) => (
                    <option key={s} value={s} disabled={s === "done"}>
                      {td(`taskStatus.${s}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("tasks.priority")}>
              {(p) => (
                <Select {...p} value={draft.priority} onChange={(e) => set("priority", e.target.value as Priority)}>
                  {(["high", "normal", "low"] as Priority[]).map((s) => (
                    <option key={s} value={s}>
                      {td(`priority.${s}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          {draft.status === "blocked" && (
            <Field label={t("tasks.blocker")} hint={t("tasks.blockerHint")} required>
              {(p) => <Textarea {...p} rows={2} value={draft.blocker} onChange={(e) => set("blocker", e.target.value)} />}
            </Field>
          )}
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">{t("tasks.collaborators")}</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {state.stakeholders
                .filter((s) => s.id !== draft.ownerId)
                .map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-teal-700"
                      checked={draft.collaboratorIds.includes(s.id)}
                      onChange={(e) =>
                        set("collaboratorIds", e.target.checked ? [...draft.collaboratorIds, s.id] : draft.collaboratorIds.filter((id) => id !== s.id))
                      }
                    />
                    {s.fullName}
                  </label>
                ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t("tasks.estimate")}>
              {(p) => <Input {...p} type="number" min={0} value={draft.estimatedDays ?? ""} onChange={(e) => set("estimatedDays", num(e.target.value))} />}
            </Field>
            <Field label={t("tasks.plannedStart")}>
              {(p) => <Input {...p} type="date" value={draft.plannedStart ?? ""} onChange={(e) => set("plannedStart", e.target.value)} />}
            </Field>
            <Field label={t("tasks.plannedEnd")}>
              {(p) => <Input {...p} type="date" value={draft.plannedEnd ?? ""} onChange={(e) => set("plannedEnd", e.target.value)} />}
            </Field>
            <Field label={t("tasks.actualStart")}>
              {(p) => <Input {...p} type="date" value={draft.actualStart ?? ""} onChange={(e) => set("actualStart", e.target.value)} />}
            </Field>
          </div>
          <Field label={t("tasks.notes")}>{(p) => <Textarea {...p} rows={2} value={draft.notes} onChange={(e) => set("notes", e.target.value)} />}</Field>
        </fieldset>
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          {editable && <Button type="submit">{t("common.save")}</Button>}
        </div>
      </form>
    </Dialog>
  );
}
