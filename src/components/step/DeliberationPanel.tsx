"use client";

import { CalendarDays, FileUp } from "lucide-react";
import { useEffect, useState } from "react";
import { DocumentList } from "@/components/documents/DocumentList";
import { UploadDialog } from "@/components/documents/UploadDialog";
import { BilingualField } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { hasStepPermission } from "@/domain/permissions";
import type { Deliberation, DocumentCategory, Roadmap } from "@/domain/types";
import { useI18n } from "@/i18n/I18nProvider";
import { errorMessage } from "@/lib/errors";
import { useApp } from "@/state/AppStateProvider";

function DocArea({ roadmap, stepNo, category, title, empty, uploadLabel }: { roadmap: Roadmap; stepNo: number; category: DocumentCategory; title: string; empty: string; uploadLabel: string }) {
  const { state, can } = useApp();
  const [open, setOpen] = useState(false);
  const docs = state.documents.filter((d) => d.roadmapId === roadmap.id && d.stepNo === stepNo && d.category === category);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-navy-900">{title}</h3>
        {can("document.upload") && (
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            <FileUp className="h-4 w-4" aria-hidden="true" />
            {uploadLabel}
          </Button>
        )}
      </div>
      <DocumentList documents={docs} showStep={false} emptyText={empty} />
      <UploadDialog open={open} onOpenChange={setOpen} roadmapId={roadmap.id} stepNo={stepNo} category={category} />
    </section>
  );
}

export function DeliberationPanel({ roadmap, stepNo }: { roadmap: Roadmap; stepNo: number }) {
  const { t, td } = useI18n();
  const { state, currentUser, dispatch, notify } = useApp();
  const step = roadmap.steps.find((s) => s.stepNo === stepNo)!;
  const [draft, setDraft] = useState<Deliberation>(step.deliberation!);
  const [error, setError] = useState<string>();
  const canEdit = hasStepPermission(currentUser, "deliberation.edit", stepNo, state.settings);

  // Re-sync only when the stored record actually changes (state is cloned on every action).
  const stored = JSON.stringify(step.deliberation);
  useEffect(() => setDraft(JSON.parse(stored)), [stored]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const res = dispatch({ type: "deliberation.update", roadmapId: roadmap.id, stepNo, deliberation: draft });
    if (!res.ok) return setError(errorMessage(td, res.error));
    setError(undefined);
    notify(t("common.saved"));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-navy-700" aria-hidden="true" />
            {t("deliberation.title")}
          </CardTitle>
        </CardHeader>
        <CardBody>
          <form onSubmit={save} className="space-y-4">
            <fieldset disabled={!canEdit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
                <Field label={t("deliberation.date")}>
                  {(p) => <Input {...p} type="date" value={draft.date ?? ""} onChange={(e) => setDraft({ ...draft, date: e.target.value || undefined })} />}
                </Field>
                <div className="flex items-end pb-2">
                  <Checkbox label={t("deliberation.held")} checked={draft.held} onChange={(e) => setDraft({ ...draft, held: e.target.checked })} />
                </div>
              </div>
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">{t("deliberation.participants")}</legend>
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {state.stakeholders.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-teal-700"
                        checked={draft.participantIds.includes(s.id)}
                        onChange={(e) =>
                          setDraft({ ...draft, participantIds: e.target.checked ? [...draft.participantIds, s.id] : draft.participantIds.filter((id) => id !== s.id) })
                        }
                      />
                      {s.fullName} <span className="text-xs text-ink-muted">· {td(`positions.${s.position}`)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field label={t("deliberation.externalParticipants")} hint={t("deliberation.externalHint")}>
                {(p) => <Textarea {...p} rows={2} value={draft.externalParticipants} onChange={(e) => setDraft({ ...draft, externalParticipants: e.target.value })} />}
              </Field>
              <BilingualField label={t("deliberation.rationale")} value={draft.rationale} onChange={(v) => setDraft({ ...draft, rationale: v })} />
            </fieldset>
            {error && <Notice tone="danger">{error}</Notice>}
            {canEdit ? <Button type="submit">{t("deliberation.saveMeeting")}</Button> : <p className="text-sm text-ink-muted">{t("common.noPermission")}</p>}
          </form>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <DocArea roadmap={roadmap} stepNo={stepNo} category="meetingPreparation" title={t("deliberation.agendaUpload")} empty={t("deliberation.noPrepDocs")} uploadLabel={t("deliberation.uploadPrep")} />
        <DocArea roadmap={roadmap} stepNo={stepNo} category="meetingMinutes" title={t("deliberation.minutesUpload")} empty={t("deliberation.noMinutes")} uploadLabel={t("deliberation.uploadMinutes")} />
      </div>
    </div>
  );
}
