"use client";

import { ArrowRightLeft, HeartPulse, Stethoscope } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { HANDOVER_RECIPIENTS } from "@/domain/branching";
import { highestScoring, weightedTotals } from "@/domain/matrix";
import type { Action } from "@/domain/actions";
import type { CurativeHandover, Pathway, Roadmap } from "@/domain/types";
import { useI18n } from "@/i18n/I18nProvider";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppStateProvider";

function emptyHandover(): CurativeHandover {
  return { records: HANDOVER_RECIPIENTS.map((r) => ({ recipient: r, transferred: "", recipientContact: "" })), naReason: "" };
}

/** Step 3 outcome: public-health vs curative route, with branch-specific records. */
export function PathwayPanel({ roadmap }: { roadmap: Roadmap }) {
  const { t, td, loc } = useI18n();
  const { can, dispatch, notify } = useApp();
  const [choice, setChoice] = useState<Pathway>(roadmap.pathway === "undecided" ? "publicHealth" : roadmap.pathway);
  const [preferred, setPreferred] = useState<string[]>(roadmap.preferredOptionIds);
  const [handover, setHandover] = useState<CurativeHandover>(roadmap.curativeHandover ?? emptyHandover());
  const [changeReason, setChangeReason] = useState("");
  const [error, setError] = useState<string>();
  const [confirm, setConfirm] = useState<Action | null>(null);
  const editable = can("pathway.decide");
  const totals = weightedTotals(roadmap.matrix, roadmap.options.map((o) => o.id));
  const top = highestScoring(totals);
  const changing = roadmap.pathway !== "undecided" && choice !== roadmap.pathway;

  const storedKey = JSON.stringify([roadmap.preferredOptionIds, roadmap.curativeHandover]);
  useEffect(() => {
    setPreferred(roadmap.preferredOptionIds);
    setHandover(roadmap.curativeHandover ?? emptyHandover());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedKey]);

  const execute = (action: Action) => {
    const res = dispatch(action);
    if (!res.ok) return setError(errorMessage(td, res.error));
    setError(undefined);
    setChangeReason("");
    notify(t("common.saved"));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const action: Action =
      choice === "publicHealth"
        ? { type: "pathway.set", roadmapId: roadmap.id, pathway: "publicHealth", preferredOptionIds: preferred, changeReason }
        : { type: "pathway.set", roadmapId: roadmap.id, pathway: "curative", handover: { ...handover, records: handover.records.map((r) => ({ ...r })) }, changeReason };
    // Changing an established route or choosing the curative route is consequential: confirm first.
    if (changing || choice === "curative") setConfirm(action);
    else execute(action);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 text-navy-700" aria-hidden="true" />
          {t("pathway.title")}
        </CardTitle>
        <Badge tone={roadmap.pathway === "publicHealth" ? "teal" : roadmap.pathway === "curative" ? "amber" : "neutral"}>
          {t("pathway.current")}: {td(`pathway.${roadmap.pathway}`)}
        </Badge>
      </CardHeader>
      <CardBody>
        <form onSubmit={submit} className="space-y-5">
          <fieldset disabled={!editable} className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{t("pathway.question")}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["publicHealth", "curative"] as const).map((p) => {
                  const Icon = p === "publicHealth" ? HeartPulse : Stethoscope;
                  return (
                    <label
                      key={p}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3 text-sm font-medium transition-colors",
                        choice === p ? "border-teal-600 bg-teal-50 text-teal-800" : "border-line hover:border-line-strong",
                      )}
                    >
                      <input type="radio" name="pathway" value={p} checked={choice === p} onChange={() => setChoice(p)} className="accent-teal-700" />
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {td(`pathway.${p}`)}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {choice === "publicHealth" && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{t("pathway.preferredOptions")}</legend>
                <p className="text-xs text-ink-muted">{t("pathway.preferredHint")}</p>
                {roadmap.options.length === 0 && <p className="text-sm text-ink-muted">{t("matrix.noOptions")}</p>}
                {roadmap.options.map((o) => {
                  const total = totals.find((x) => x.optionId === o.id)?.weightedScore;
                  return (
                    <label key={o.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-teal-700"
                        checked={preferred.includes(o.id)}
                        onChange={(e) => setPreferred(e.target.checked ? [...preferred, o.id] : preferred.filter((id) => id !== o.id))}
                      />
                      {loc(o.name)}
                      {total !== null && total !== undefined && <span className="text-xs tabular-nums text-ink-muted">({total.toFixed(2)})</span>}
                      {top.includes(o.id) && <Badge tone="teal">{t("matrix.highest")}</Badge>}
                    </label>
                  );
                })}
              </fieldset>
            )}

            {choice === "curative" && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-navy-900">{t("pathway.handoverTitle")}</p>
                  <p className="text-xs text-ink-muted">{t("pathway.handoverHint")}</p>
                </div>
                {handover.records.map((rec, i) => (
                  <fieldset key={rec.recipient} className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-3">
                    <legend className="px-1 text-sm font-semibold">{td(`pathway.recipients.${rec.recipient}`)}</legend>
                    <Field label={t("pathway.transferred")} required className="sm:col-span-3">
                      {(p) => (
                        <Textarea
                          {...p}
                          rows={2}
                          value={rec.transferred}
                          onChange={(e) => setHandover({ ...handover, records: handover.records.map((r, j) => (j === i ? { ...r, transferred: e.target.value } : r)) })}
                        />
                      )}
                    </Field>
                    <Field label={t("pathway.recipientContact")} className="sm:col-span-2">
                      {(p) => (
                        <Input
                          {...p}
                          value={rec.recipientContact}
                          onChange={(e) => setHandover({ ...handover, records: handover.records.map((r, j) => (j === i ? { ...r, recipientContact: e.target.value } : r)) })}
                        />
                      )}
                    </Field>
                    <Field label={t("pathway.handoverDate")}>
                      {(p) => (
                        <Input
                          {...p}
                          type="date"
                          value={rec.date ?? ""}
                          onChange={(e) => setHandover({ ...handover, records: handover.records.map((r, j) => (j === i ? { ...r, date: e.target.value || undefined } : r)) })}
                        />
                      )}
                    </Field>
                  </fieldset>
                ))}
                <Field label={t("pathway.naReason")} required>
                  {(p) => <Textarea {...p} rows={2} value={handover.naReason} onChange={(e) => setHandover({ ...handover, naReason: e.target.value })} />}
                </Field>
              </div>
            )}

            {changing && (
              <Field label={t("pathway.changeReason")} hint={t("pathway.changeReasonHint")} required>
                {(p) => <Textarea {...p} rows={2} value={changeReason} onChange={(e) => setChangeReason(e.target.value)} />}
              </Field>
            )}
          </fieldset>
          {error && <Notice tone="danger">{error}</Notice>}
          {editable ? (
            <Button type="submit">{choice === "publicHealth" ? t("pathway.savePublicHealth") : t("pathway.saveCurative")}</Button>
          ) : (
            <p className="text-sm text-ink-muted">{t("common.noPermission")}</p>
          )}
        </form>
        <ConfirmDialog
          open={!!confirm}
          onOpenChange={(o) => !o && setConfirm(null)}
          description={t("pathway.selectedRouteBanner", { route: td(`pathway.${choice}`) })}
          onConfirm={() => {
            if (confirm) execute(confirm);
            setConfirm(null);
          }}
        />
      </CardBody>
    </Card>
  );
}
