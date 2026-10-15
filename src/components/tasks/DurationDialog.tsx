"use client";

import { AlertTriangle, Info } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { evaluateDurationInput, selectBenchmark } from "@/domain/durations";
import type { Task } from "@/domain/types";
import { useI18n } from "@/i18n/I18nProvider";
import { errorMessage } from "@/lib/errors";
import { useApp } from "@/state/AppStateProvider";

export function DurationDialog({ task, open, onOpenChange }: { task: Task; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t, td, loc } = useI18n();
  const { state, dispatch, notify, currentUser } = useApp();
  const [method, setMethod] = useState<"dates" | "manual">("dates");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [manualDays, setManualDays] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setMethod("dates");
    setStartDate(task.actualStart ?? task.plannedStart ?? "");
    setEndDate(new Date().toISOString().slice(0, 10));
    setManualDays("");
    setReason("");
    setError(undefined);
    // Re-initialise only when the dialog opens for a task.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task.id]);

  const benchmark = useMemo(
    () => selectBenchmark(state.durationRecords, task.templateKey, task.ownerId ?? currentUser.id, state.settings),
    [state.durationRecords, state.settings, task, currentUser.id],
  );
  const evaluation = evaluateDurationInput(
    { method, startDate, endDate, manualDays: manualDays === "" ? undefined : Number(manualDays), reason },
    benchmark,
    state.settings,
  );
  const days = evaluation.days;
  const diff = days !== undefined && task.estimatedDays !== undefined ? days - task.estimatedDays : undefined;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = dispatch({
      type: "duration.submit",
      taskId: task.id,
      input: { method, startDate, endDate, manualDays: manualDays === "" ? undefined : Number(manualDays), reason },
    });
    if (!res.ok) return setError(errorMessage(td, res.error));
    notify(t("durations.submitted"));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("durations.title")} description={loc(task.title)}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("durations.method")}</legend>
          {(["dates", "manual"] as const).map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} className="accent-teal-700" />
              {m === "dates" ? t("durations.byDates") : t("durations.manual")}
            </label>
          ))}
        </fieldset>
        {method === "dates" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("tasks.actualStart")} required>
              {(p) => <Input {...p} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />}
            </Field>
            <Field label={t("tasks.actualEnd")} required>
              {(p) => <Input {...p} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />}
            </Field>
          </div>
        ) : (
          <Field label={t("durations.manualDays")} required>
            {(p) => <Input {...p} type="number" min={0} inputMode="numeric" value={manualDays} onChange={(e) => setManualDays(e.target.value)} />}
          </Field>
        )}

        <dl className="grid gap-2 rounded-lg border border-line bg-canvas p-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-ink-muted">{t("durations.estimate")}</dt>
            <dd className="font-medium">{task.estimatedDays !== undefined ? t("common.days", { n: task.estimatedDays }) : t("common.notSet")}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">{t("tasks.actual")}</dt>
            <dd className="font-medium">{days !== undefined ? t("common.days", { n: days }) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">{t("durations.difference")}</dt>
            <dd className="font-medium">{diff !== undefined ? `${diff > 0 ? "+" : ""}${diff}` : "—"}</dd>
          </div>
        </dl>

        <p className="flex items-start gap-2 text-xs text-ink-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {benchmark
            ? benchmark.kind === "personal"
              ? t("durations.benchmarkPersonal", { avg: benchmark.average.toFixed(1), n: benchmark.sampleSize })
              : t("durations.benchmarkOverall", { avg: benchmark.average.toFixed(1), n: benchmark.sampleSize })
            : t("durations.noBenchmark")}
        </p>

        {evaluation.outlier.isOutlier && (
          <>
            <Notice tone="warning" icon={AlertTriangle}>
              {t("durations.outlierPrompt", { direction: t(evaluation.outlier.direction === "longer" ? "durations.longer" : "durations.shorter") })}
            </Notice>
            <Field label={t("durations.reasonLabel")} hint={t("durations.reasonExamples")} required>
              {(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}
            </Field>
          </>
        )}
        <p className="text-xs text-ink-muted">{t("durations.learningNote")}</p>
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="submit">{t("durations.submit")}</Button>
        </div>
      </form>
    </Dialog>
  );
}
