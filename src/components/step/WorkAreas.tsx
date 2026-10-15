"use client";

import { Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { BilingualField, useStakeholderLookup } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { EmptyState, Notice } from "@/components/ui/misc";
import type { Action } from "@/domain/actions";
import { makeId } from "@/domain/ids";
import { hasPermission } from "@/domain/permissions";
import type { LocalizedText, OptionAssessment, OptionalDecision, OptionType, PreventionOption, ProcurementInfo, Roadmap, StepState } from "@/domain/types";
import { useI18n } from "@/i18n/I18nProvider";
import { errorMessage } from "@/lib/errors";
import { useApp } from "@/state/AppStateProvider";

/** Can the current user edit content of this step (lead/editor or involved in its tasks)? */
export function useCanEditStep(roadmapId: string, stepNo: number | null) {
  const { state, currentUser } = useApp();
  if (hasPermission(currentUser, "roadmap.edit", state.settings)) return true;
  return state.tasks.some((t) => t.roadmapId === roadmapId && t.stepNo === stepNo && (t.ownerId === currentUser.id || t.collaboratorIds.includes(currentUser.id)));
}

function useRun() {
  const { dispatch, notify } = useApp();
  const { t, td } = useI18n();
  const [error, setError] = useState<string>();
  const run = (action: Action) => {
    const res = dispatch(action);
    if (!res.ok) {
      setError(errorMessage(td, res.error));
      return false;
    }
    setError(undefined);
    notify(t("common.saved"));
    return true;
  };
  return { run, error, setError };
}

const empty = (): LocalizedText => ({ nl: "", en: "" });

export function SummaryEditor({ roadmap, step }: { roadmap: Roadmap; step: StepState }) {
  const { t } = useI18n();
  const editable = useCanEditStep(roadmap.id, step.stepNo);
  const { run, error } = useRun();
  const [summary, setSummary] = useState(step.summary);
  const [uncertainties, setUncertainties] = useState(step.uncertainties);
  const [sources, setSources] = useState(step.sources);
  const key = JSON.stringify([step.summary, step.uncertainties, step.sources]);
  useEffect(() => {
    setSummary(step.summary);
    setUncertainties(step.uncertainties);
    setSources(step.sources);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("stepPage.summary")}</CardTitle>
      </CardHeader>
      <CardBody>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run({ type: "step.update", roadmapId: roadmap.id, stepNo: step.stepNo, patch: { summary, uncertainties, sources } });
          }}
        >
          <fieldset disabled={!editable} className="space-y-4">
            <BilingualField label={t("stepPage.summary")} value={summary} onChange={setSummary} />
            <BilingualField label={t("stepPage.uncertainties")} value={uncertainties} onChange={setUncertainties} />
            <Field label={t("stepPage.sources")} hint={t("options.sourcesHint")}>
              {(p) => <Textarea {...p} rows={2} value={sources} onChange={(e) => setSources(e.target.value)} />}
            </Field>
          </fieldset>
          {error && <Notice tone="danger">{error}</Notice>}
          {editable && <Button type="submit">{t("stepPage.saveSummary")}</Button>}
        </form>
      </CardBody>
    </Card>
  );
}

function OptionDialog({ roadmap, option, open, onOpenChange }: { roadmap: Roadmap; option?: PreventionOption; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t, td } = useI18n();
  const { run, error, setError } = useRun();
  const [draft, setDraft] = useState<PreventionOption>(
    option ?? { id: "", name: empty(), type: "vaccine", description: empty(), sources: "", isPlaceholder: false },
  );
  useEffect(() => {
    if (open) {
      setDraft(option ?? { id: makeId("opt"), name: empty(), type: "vaccine", description: empty(), sources: "", isPlaceholder: false });
      setError(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, option?.id]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={option ? t("common.edit") : t("options.add")} wide>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const ok = run(option ? { type: "option.update", roadmapId: roadmap.id, option: draft } : { type: "option.add", roadmapId: roadmap.id, option: draft });
          if (ok) onOpenChange(false);
        }}
      >
        <BilingualField label={t("options.name")} value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} multiline={false} required />
        <Field label={t("options.type")}>
          {(p) => (
            <Select {...p} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as OptionType })}>
              {(["vaccine", "monoclonal", "other"] as OptionType[]).map((o) => (
                <option key={o} value={o}>
                  {td(`options.types.${o}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <BilingualField label={t("options.description")} value={draft.description} onChange={(v) => setDraft({ ...draft, description: v })} />
        <Field label={t("options.sources")} hint={t("options.sourcesHint")}>
          {(p) => <Textarea {...p} rows={2} value={draft.sources} onChange={(e) => setDraft({ ...draft, sources: e.target.value, isPlaceholder: false })} />}
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="submit">{t("common.save")}</Button>
        </div>
      </form>
    </Dialog>
  );
}

export function OptionsEditor({ roadmap }: { roadmap: Roadmap }) {
  const { t, td, loc } = useI18n();
  const editable = useCanEditStep(roadmap.id, 1);
  const { run } = useRun();
  const [editing, setEditing] = useState<PreventionOption | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [removing, setRemoving] = useState<PreventionOption | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("options.title")}</CardTitle>
        {editable && (
          <Button
            size="sm"
            onClick={() => {
              setEditing(undefined);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("options.add")}
          </Button>
        )}
      </CardHeader>
      <CardBody>
        {roadmap.options.length === 0 ? (
          <EmptyState title={t("options.none")} />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {roadmap.options.slice(0, 6).map((o) => (
              <li key={o.id} className="rounded-lg border border-line p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-navy-900">{loc(o.name)}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge tone="outline">{td(`options.types.${o.type}`)}</Badge>
                      {o.isPlaceholder && <Badge tone="amber" title={t("common.placeholderHint")}>{t("common.placeholder")}</Badge>}
                      {roadmap.preferredOptionIds.includes(o.id) && <Badge tone="teal">{t("pathway.publicHealth")} ★</Badge>}
                    </div>
                  </div>
                  {editable && (
                    <div className="flex">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${t("common.edit")}: ${loc(o.name)}`}
                        onClick={() => {
                          setEditing(o);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`${t("common.remove")}: ${loc(o.name)}`} onClick={() => setRemoving(o)}>
                        <Trash2 className="h-4 w-4 text-coral-600" aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                </div>
                {loc(o.description) && <p className="mt-2 text-sm text-ink-muted">{loc(o.description)}</p>}
                <p className="mt-2 text-xs text-ink-muted">
                  <span className="font-medium">{t("options.sources")}:</span> {o.sources || t("common.notSet")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      <OptionDialog roadmap={roadmap} option={editing} open={dialogOpen} onOpenChange={setDialogOpen} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        description={t("options.removeConfirm")}
        destructive
        onConfirm={() => {
          if (removing) run({ type: "option.remove", roadmapId: roadmap.id, optionId: removing.id });
          setRemoving(null);
        }}
      />
    </Card>
  );
}

export function ProcurementEditor({ roadmap }: { roadmap: Roadmap }) {
  const { t } = useI18n();
  const editable = useCanEditStep(roadmap.id, 4);
  const { run, error } = useRun();
  const [draft, setDraft] = useState<ProcurementInfo>(roadmap.procurement);
  const key = JSON.stringify(roadmap.procurement);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setDraft(JSON.parse(key)), [key]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("procurement.title")}</CardTitle>
        {!roadmap.procurement.pahoContactDate && <Badge tone="amber">{t("common.placeholder")}</Badge>}
      </CardHeader>
      <CardBody>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run({ type: "procurement.update", roadmapId: roadmap.id, patch: draft });
          }}
        >
          <p className="text-xs text-ink-muted">{t("procurement.placeholderNote")}</p>
          <fieldset disabled={!editable} className="space-y-4">
            <Field label={t("procurement.pahoDate")} className="max-w-xs">
              {(p) => <Input {...p} type="date" value={draft.pahoContactDate ?? ""} onChange={(e) => setDraft({ ...draft, pahoContactDate: e.target.value || undefined })} />}
            </Field>
            <BilingualField label={t("procurement.pahoFollowUp")} value={draft.pahoFollowUp} onChange={(v) => setDraft({ ...draft, pahoFollowUp: v })} />
            <BilingualField label={t("procurement.islandsProcurement")} value={draft.otherIslandsProcurement} onChange={(v) => setDraft({ ...draft, otherIslandsProcurement: v })} />
            <BilingualField label={t("procurement.islandsBurden")} value={draft.otherIslandsBurden} onChange={(v) => setDraft({ ...draft, otherIslandsBurden: v })} />
          </fieldset>
          {error && <Notice tone="danger">{error}</Notice>}
          {editable && <Button type="submit">{t("common.save")}</Button>}
        </form>
      </CardBody>
    </Card>
  );
}

/** Per-option assessment cards (Step 5 administration routes, Step 7 cost-effectiveness). */
export function OptionAssessments({ roadmap, step, kind }: { roadmap: Roadmap; step: StepState; kind: "routes" | "cea" }) {
  const { t, loc } = useI18n();
  const { state } = useApp();
  const people = useStakeholderLookup();
  const editable = useCanEditStep(roadmap.id, step.stepNo);
  const { run, error } = useRun();
  const build = () =>
    roadmap.options.map(
      (o) => step.optionAssessments?.find((a) => a.optionId === o.id) ?? { optionId: o.id, text: empty(), implications: empty() },
    );
  const [draft, setDraft] = useState<OptionAssessment[]>(build);
  const key = JSON.stringify([step.optionAssessments, roadmap.options.map((o) => o.id)]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setDraft(build()), [key]);
  const update = (optionId: string, patch: Partial<OptionAssessment>) => setDraft(draft.map((a) => (a.optionId === optionId ? { ...a, ...patch } : a)));

  if (roadmap.options.length === 0) return <Notice tone="info">{t("assessments.noOptions")}</Notice>;
  const labels =
    kind === "routes"
      ? { title: t("assessments.routesTitle"), text: t("assessments.routes"), implications: t("assessments.implications") }
      : { title: t("assessments.ceaTitle"), text: t("assessments.ceaResult"), implications: t("assessments.ceaLimitations") };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{labels.title}</CardTitle>
          {kind === "cea" && <p className="mt-0.5 text-xs text-ink-muted">{t("assessments.ceaNote")}</p>}
        </div>
      </CardHeader>
      <CardBody>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run({ type: "step.update", roadmapId: roadmap.id, stepNo: step.stepNo, patch: { optionAssessments: draft } });
          }}
        >
          {kind === "cea" && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-sm">
                <caption className="mb-2 text-left text-sm font-semibold text-navy-900">{t("assessments.comparison")}</caption>
                <thead className="text-left text-xs text-ink-muted">
                  <tr>
                    <th className="py-1 pr-3 font-medium">{t("options.name")}</th>
                    <th className="py-1 pr-3 font-medium">{t("assessments.ceaResult")}</th>
                    <th className="py-1 font-medium">{t("assessments.assignee")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {draft.map((a) => (
                    <tr key={a.optionId}>
                      <td className="py-2 pr-3 font-medium">{loc(roadmap.options.find((o) => o.id === a.optionId)?.name)}</td>
                      <td className="py-2 pr-3 text-ink-muted">{loc(a.text) || t("common.notSet")}</td>
                      <td className="py-2 text-ink-muted">{people.name(a.assigneeId)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <fieldset disabled={!editable} className="space-y-4">
            {draft.map((a) => {
              const option = roadmap.options.find((o) => o.id === a.optionId)!;
              return (
                <fieldset key={a.optionId} className="space-y-3 rounded-lg border border-line p-4">
                  <legend className="px-1 text-sm font-semibold text-navy-900">{loc(option.name)}</legend>
                  <Field label={t("assessments.assignee")} className="max-w-sm">
                    {(p) => (
                      <Select {...p} value={a.assigneeId ?? ""} onChange={(e) => update(a.optionId, { assigneeId: e.target.value || undefined })}>
                        <option value="">{t("common.unassigned")}</option>
                        {state.stakeholders.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.fullName}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <BilingualField label={labels.text} value={a.text} onChange={(v) => update(a.optionId, { text: v })} />
                  <BilingualField label={labels.implications} value={a.implications} onChange={(v) => update(a.optionId, { implications: v })} />
                </fieldset>
              );
            })}
          </fieldset>
          {error && <Notice tone="danger">{error}</Notice>}
          {editable && <Button type="submit">{t("common.save")}</Button>}
        </form>
      </CardBody>
    </Card>
  );
}

export function OptionalStepPanel({ roadmap, step }: { roadmap: Roadmap; step: StepState }) {
  const { t, td } = useI18n();
  const editable = useCanEditStep(roadmap.id, step.stepNo);
  const { run, error } = useRun();
  const [reason, setReason] = useState(step.optionalReason ?? "");
  const [confirm, setConfirm] = useState<OptionalDecision | null>(null);
  const decision = step.optionalDecision ?? "undecided";
  if (roadmap.pathway === "curative") return null;
  return (
    <Card className="border-l-4 border-l-amber-600">
      <CardHeader>
        <CardTitle>{t("optional.title")}</CardTitle>
        <Badge tone={decision === "activated" ? "teal" : decision === "skipped" ? "outline" : "amber"}>
          {t("optional.decision")}: {td(`optional.${decision}`)}
        </Badge>
      </CardHeader>
      <CardBody className="space-y-4">
        <Field label={t("optional.reason")} hint={t("optional.reasonHint")} required>
          {(p) => <Textarea {...p} rows={2} disabled={!editable} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
        {editable && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => run({ type: "step.optionalDecision", roadmapId: roadmap.id, stepNo: step.stepNo, decision: "activated", reason })} disabled={decision === "activated" && reason === step.optionalReason}>
              {t("optional.activate")}
            </Button>
            <Button variant="outline" onClick={() => setConfirm("skipped")}>
              {t("optional.skip")}
            </Button>
            {decision !== "undecided" && (
              <Button variant="ghost" onClick={() => run({ type: "step.optionalDecision", roadmapId: roadmap.id, stepNo: step.stepNo, decision: "undecided", reason })}>
                {t("optional.reset")}
              </Button>
            )}
          </div>
        )}
        <Notice tone="info" icon={ShieldAlert}>
          {t("optional.surveyNote")}
        </Notice>
      </CardBody>
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        description={`${t("optional.skipped")} — ${reason || t("errors.reasonRequired")}`}
        onConfirm={() => {
          run({ type: "step.optionalDecision", roadmapId: roadmap.id, stepNo: step.stepNo, decision: "skipped", reason });
          setConfirm(null);
        }}
      />
    </Card>
  );
}
