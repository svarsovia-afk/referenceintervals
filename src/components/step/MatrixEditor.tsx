"use client";

import { FlaskConical, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { makeId } from "@/domain/ids";
import { highestScoring, weightedTotals, weightShare } from "@/domain/matrix";
import { hasPermission, hasStepPermission } from "@/domain/permissions";
import type { Roadmap, WeightedMatrix } from "@/domain/types";
import { useI18n } from "@/i18n/I18nProvider";
import { DICTIONARIES } from "@/i18n/translate";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppStateProvider";

export function MatrixEditor({ roadmap, readOnly }: { roadmap: Roadmap; readOnly?: boolean }) {
  const { t, td, loc, lang } = useI18n();
  const { state, currentUser, dispatch, notify } = useApp();
  const [draft, setDraft] = useState<WeightedMatrix>(roadmap.matrix);
  const [error, setError] = useState<string>();
  const stored = JSON.stringify(roadmap.matrix);
  useEffect(() => setDraft(JSON.parse(stored)), [stored]);

  const editable =
    !readOnly && (hasStepPermission(currentUser, "deliberation.edit", 3, state.settings) || hasPermission(currentUser, "roadmap.edit", state.settings));
  const optionIds = roadmap.options.map((o) => o.id);
  const totals = weightedTotals(draft, optionIds);
  const top = highestScoring(totals);
  const dirty = JSON.stringify(draft) !== stored;

  const setCell = (optionId: string, criterionId: string, patch: { score?: number | undefined; evidence?: string }) => {
    const optScores = { ...(draft.scores[optionId] ?? {}) };
    optScores[criterionId] = { ...(optScores[criterionId] ?? { evidence: "" }), ...patch };
    setDraft({ ...draft, scores: { ...draft.scores, [optionId]: optScores } });
  };

  const save = (matrix: WeightedMatrix) => {
    const res = dispatch({ type: "matrix.update", roadmapId: roadmap.id, matrix });
    if (!res.ok) return setError(errorMessage(td, res.error));
    setError(undefined);
    notify(t("common.saved"));
  };

  if (roadmap.options.length === 0) return <Notice tone="info">{t("matrix.noOptions")}</Notice>;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{t("matrix.title")}</CardTitle>
          <p className="mt-0.5 max-w-2xl text-xs text-ink-muted">{t("matrix.intro")}</p>
        </div>
        {!editable && <Badge tone="outline">{t("matrix.readOnly")}</Badge>}
      </CardHeader>
      <CardBody className="space-y-4">
        {draft.isSample && (
          <Notice tone="warning" icon={FlaskConical}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{t("matrix.sampleBanner")}</span>
              {editable && (
                <Button size="sm" variant="outline" onClick={() => save({ ...draft, scores: {}, isSample: false })}>
                  {t("matrix.clearSample")}
                </Button>
              )}
            </div>
          </Notice>
        )}
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <caption className="sr-only">{t("matrix.title")}</caption>
            <thead className="bg-canvas text-left text-xs text-ink-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("matrix.criterion")}
                </th>
                <th scope="col" className="w-24 px-3 py-2 font-medium">
                  {t("matrix.weight")}
                </th>
                {roadmap.options.map((o) => (
                  <th key={o.id} scope="col" className="min-w-[10rem] px-3 py-2 font-medium">
                    <span className="text-ink">{loc(o.name)}</span>
                    <span className="block font-normal">{t("matrix.scoreScale", { max: draft.scaleMax })}</span>
                  </th>
                ))}
                {editable && <th className="w-10" aria-label={t("common.actions")} />}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {draft.criteria.map((c, idx) => (
                <tr key={c.id} className="align-top">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    {editable ? (
                      <Input
                        aria-label={`${t("matrix.criterion")} ${idx + 1} (${lang.toUpperCase()})`}
                        value={c.label[lang]}
                        onChange={(e) =>
                          setDraft({ ...draft, criteria: draft.criteria.map((x) => (x.id === c.id ? { ...x, label: { ...x.label, [lang]: e.target.value } } : x)) })
                        }
                      />
                    ) : (
                      <span className="font-medium">{loc(c.label)}</span>
                    )}
                  </th>
                  <td className="px-3 py-2">
                    {editable ? (
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        aria-label={`${t("matrix.weight")}: ${loc(c.label)}`}
                        value={c.weight}
                        onChange={(e) =>
                          setDraft({ ...draft, criteria: draft.criteria.map((x) => (x.id === c.id ? { ...x, weight: Math.max(0, Number(e.target.value)) } : x)) })
                        }
                      />
                    ) : (
                      <span className="tabular-nums">{c.weight}</span>
                    )}
                    <span className="mt-1 block text-xs tabular-nums text-ink-muted">
                      {t("matrix.weightShare")}: {Math.round(weightShare(draft, c.id) * 100)}%
                    </span>
                  </td>
                  {roadmap.options.map((o) => {
                    const cell = draft.scores[o.id]?.[c.id];
                    return (
                      <td key={o.id} className="space-y-1 px-3 py-2">
                        {editable ? (
                          <>
                            <select
                              aria-label={`${loc(o.name)} — ${loc(c.label)}`}
                              value={cell?.score ?? ""}
                              onChange={(e) => setCell(o.id, c.id, { score: e.target.value === "" ? undefined : Number(e.target.value) })}
                              className="h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm"
                            >
                              <option value="">—</option>
                              {Array.from({ length: draft.scaleMax + 1 }, (_, i) => (
                                <option key={i} value={i}>
                                  {i}
                                </option>
                              ))}
                            </select>
                            <input
                              aria-label={`${t("matrix.evidence")}: ${loc(o.name)} — ${loc(c.label)}`}
                              placeholder={t("matrix.evidence")}
                              value={cell?.evidence ?? ""}
                              onChange={(e) => setCell(o.id, c.id, { evidence: e.target.value })}
                              className="h-8 w-full rounded-md border border-line bg-surface px-2 text-xs"
                            />
                          </>
                        ) : (
                          <>
                            <span className="tabular-nums font-medium">{cell?.score ?? "—"}</span>
                            {cell?.evidence && <span className="block text-xs text-ink-muted">{cell.evidence}</span>}
                          </>
                        )}
                      </td>
                    );
                  })}
                  {editable && (
                    <td className="px-1 py-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${t("matrix.removeCriterion")}: ${loc(c.label)}`}
                        onClick={() => setDraft({ ...draft, criteria: draft.criteria.filter((x) => x.id !== c.id) })}
                      >
                        <Trash2 className="h-4 w-4 text-coral-600" aria-hidden="true" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-navy-50">
              <tr>
                <th scope="row" colSpan={2} className="px-3 py-2.5 text-left text-sm font-semibold text-navy-900">
                  {t("matrix.weightedTotal")}
                </th>
                {totals.map((tot) => (
                  <td key={tot.optionId} className={cn("px-3 py-2.5", top.includes(tot.optionId) && "bg-teal-50")}>
                    <span className="text-lg font-semibold tabular-nums text-navy-900">{tot.weightedScore === null ? "—" : tot.weightedScore.toFixed(2)}</span>
                    {top.includes(tot.optionId) && (
                      <Badge tone="teal" className="ml-2">
                        ★ {t("matrix.highest")}
                      </Badge>
                    )}
                    <span className="block text-xs text-ink-muted">{t("matrix.scoredOf", { n: tot.scoredCriteria, total: tot.totalCriteria })}</span>
                  </td>
                ))}
                {editable && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-xs text-ink-muted">{t("matrix.formula")}</p>
        {error && <Notice tone="danger">{error}</Notice>}
        {editable && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setDraft({ ...draft, criteria: [...draft.criteria, { id: makeId("crit"), label: { nl: DICTIONARIES.nl.matrix.newCriterion, en: DICTIONARIES.en.matrix.newCriterion }, weight: 1 }] })
              }
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("matrix.addCriterion")}
            </Button>
            <Button onClick={() => save(draft)} disabled={!dirty}>
              {t("common.save")}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
