"use client";

import { Award, CheckCircle2, FileText } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BilingualField, ScoreBadge, useStakeholderLookup } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { highestScoring, selectionNeedsExplanation, weightedTotals } from "@/domain/matrix";
import { hasPermission, hasStepPermission } from "@/domain/permissions";
import type { LocalizedText, Roadmap } from "@/domain/types";
import { useI18n } from "@/i18n/I18nProvider";
import { errorMessage } from "@/lib/errors";
import { useApp } from "@/state/AppStateProvider";

/** Evidence collected in steps 4–7, summarized for the second deliberation. */
export function EvidencePanel({ roadmap }: { roadmap: Roadmap }) {
  const { t, td, loc } = useI18n();
  const { state } = useApp();
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{t("deliberation.evidenceSteps")}</CardTitle>
          <p className="mt-0.5 text-xs text-ink-muted">{t("deliberation.evidenceStepsHint")}</p>
        </div>
      </CardHeader>
      <ul className="divide-y divide-line">
        {[4, 5, 6, 7].map((n) => {
          const step = roadmap.steps.find((s) => s.stepNo === n)!;
          const docs = state.documents.filter((d) => d.roadmapId === roadmap.id && d.stepNo === n && !d.supersededById).length;
          return (
            <li key={n} className="px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/roadmaps/${roadmap.id}/steps/${n}`} className="text-sm font-medium text-teal-700 hover:underline">
                  {t("common.step", { n })} · {td(`steps.s${n}.short`)}
                </Link>
                {step.notApplicable ? <Badge tone="outline">{t("stepStatus.notApplicable")}</Badge> : <ScoreBadge score={step.approvedScore} max={2} />}
                <Badge tone="neutral">
                  <FileText className="h-3 w-3" aria-hidden="true" />
                  {docs}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-ink-muted">{loc(step.summary) || t("common.notSet")}</p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

const empty = (): LocalizedText => ({ nl: "", en: "" });

export function FinalSelectionPanel({ roadmap }: { roadmap: Roadmap }) {
  const { t, td, loc, formatDate } = useI18n();
  const { state, currentUser, dispatch, notify } = useApp();
  const people = useStakeholderLookup();
  const existing = roadmap.finalSelection;
  const totals = weightedTotals(roadmap.matrix, roadmap.options.map((o) => o.id));
  const top = highestScoring(totals);
  const [optionId, setOptionId] = useState(existing?.optionId ?? top[0] ?? "");
  const [rationale, setRationale] = useState(existing?.rationale ?? empty());
  const [deviation, setDeviation] = useState(existing?.deviationReason ?? "");
  const [uncertainties, setUncertainties] = useState(existing?.uncertainties ?? empty());
  const [nextSteps, setNextSteps] = useState(existing?.nextSteps ?? empty());
  const [error, setError] = useState<string>();
  const [confirm, setConfirm] = useState(false);
  const editable = hasStepPermission(currentUser, "deliberation.edit", 8, state.settings) && hasPermission(currentUser, "pathway.decide", state.settings);
  const needsDeviation = optionId ? selectionNeedsExplanation(totals, optionId) : false;
  const name = (id: string) => loc(roadmap.options.find((o) => o.id === id)?.name);

  if (roadmap.pathway !== "publicHealth") return <Notice tone="info">{t("errors.pathwayCurative")}</Notice>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="h-4 w-4 text-navy-700" aria-hidden="true" />
          {t("finalSelection.title")}
        </CardTitle>
        {existing && (
          <Badge tone="teal">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t("finalSelection.confirmed", { name: people.name(existing.confirmedBy), date: formatDate(existing.confirmedAt) })}
          </Badge>
        )}
      </CardHeader>
      <CardBody>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!optionId) return setError(t("errors.selectionRequired"));
            if (needsDeviation && !deviation.trim()) return setError(t("errors.deviationRequired"));
            setConfirm(true);
          }}
        >
          <Notice tone="info">{t("finalSelection.humanDecision")}</Notice>
          {top.length > 0 && <p className="text-sm text-ink-muted">{t("finalSelection.highestHint", { option: top.map(name).join(", ") })}</p>}
          <fieldset disabled={!editable} className="space-y-4">
            <Field label={t("finalSelection.option")} required>
              {(p) => (
                <Select {...p} value={optionId} onChange={(e) => setOptionId(e.target.value)}>
                  <option value="">{t("common.selectPlaceholder")}</option>
                  {roadmap.options.map((o) => {
                    const total = totals.find((x) => x.optionId === o.id)?.weightedScore;
                    return (
                      <option key={o.id} value={o.id}>
                        {loc(o.name)}
                        {total !== null && total !== undefined ? ` (${total.toFixed(2)})` : ""}
                        {top.includes(o.id) ? ` ★ ${t("matrix.highest")}` : ""}
                      </option>
                    );
                  })}
                </Select>
              )}
            </Field>
            {needsDeviation && (
              <Field label={t("finalSelection.deviation")} required>
                {(p) => <Textarea {...p} rows={2} value={deviation} onChange={(e) => setDeviation(e.target.value)} />}
              </Field>
            )}
            <BilingualField label={t("finalSelection.rationale")} value={rationale} onChange={setRationale} />
            <BilingualField label={t("finalSelection.uncertainties")} value={uncertainties} onChange={setUncertainties} />
            <BilingualField label={t("finalSelection.nextSteps")} value={nextSteps} onChange={setNextSteps} />
          </fieldset>
          {error && <Notice tone="danger">{error}</Notice>}
          {editable ? <Button type="submit">{t("finalSelection.confirm")}</Button> : <p className="text-sm text-ink-muted">{t("common.noPermission")}</p>}
        </form>
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          description={`${t("finalSelection.confirmDialog")} ${name(optionId)}`}
          onConfirm={() => {
            const res = dispatch({ type: "finalSelection.record", roadmapId: roadmap.id, optionId, rationale, deviationReason: needsDeviation ? deviation : "", uncertainties, nextSteps });
            if (!res.ok) setError(errorMessage(td, res.error));
            else {
              setError(undefined);
              notify(t("common.saved"));
            }
            setConfirm(false);
          }}
        />
      </CardBody>
    </Card>
  );
}
