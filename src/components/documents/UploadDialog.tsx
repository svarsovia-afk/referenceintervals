"use client";

import { ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { STEP_TEMPLATES } from "@/domain/stepTemplates";
import type { DocumentCategory, DocumentMeta } from "@/domain/types";
import { useI18n } from "@/i18n/I18nProvider";
import { errorMessage } from "@/lib/errors";
import { useApp } from "@/state/AppStateProvider";

export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  "scientificLiterature",
  "epidemiologicalReport",
  "procurementCost",
  "surveyMaterial",
  "surveyResults",
  "costEffectiveness",
  "meetingPreparation",
  "meetingMinutes",
  "policyBrief",
  "advisoryReport",
  "approvalLetter",
  "correspondence",
  "dataSharingAgreement",
  "dataManagementPlan",
  "surveillancePlan",
  "other",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roadmapId: string;
  stepNo?: number | null;
  category?: DocumentCategory;
  taskId?: string;
  /** When set, the upload becomes a new version of this document. */
  replace?: DocumentMeta;
}

export function UploadDialog({ open, onOpenChange, roadmapId, stepNo = null, category = "other", taskId, replace }: Props) {
  const { t, td } = useI18n();
  const { uploadDocument, notify } = useApp();
  const [title, setTitle] = useState("");
  const [cat, setCat] = useState<DocumentCategory>(category);
  const [step, setStep] = useState<string>(stepNo === null ? "impl" : String(stepNo));
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(replace?.title ?? "");
    setCat(replace?.category ?? category);
    const s = replace ? replace.stepNo : stepNo;
    setStep(s === null || s === undefined ? "impl" : String(s));
    setDescription(replace?.description ?? "");
    setFile(null);
    setAck(false);
    setError(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, replace?.id, category, stepNo]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError(t("errors.titleRequired"));
    if (!file) return setError(t("errors.fileRequired"));
    if (!ack) return setError(t("errors.ackRequired"));
    setBusy(true);
    const res = await uploadDocument(
      { roadmapId, stepNo: step === "impl" ? null : Number(step), category: cat, title: title.trim(), description: description.trim(), taskId: replace?.taskId ?? taskId },
      file,
      replace?.id,
    );
    setBusy(false);
    if (!res.ok) return setError(errorMessage(td, res.error));
    notify(t("common.saved"));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={replace ? t("documents.replace") : t("documents.uploadTitle")} description={t("documents.localOnly")}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Notice tone="warning" icon={ShieldAlert} title={t("documents.warningTitle")}>
          {t("documents.warningBody")}
        </Notice>
        <Field label={t("documents.docTitle")} required>
          {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("documents.category")}>
            {(p) => (
              <Select {...p} value={cat} onChange={(e) => setCat(e.target.value as DocumentCategory)} disabled={!!replace}>
                {DOCUMENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {td(`documents.categories.${c}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("documents.step")}>
            {(p) => (
              <Select {...p} value={step} onChange={(e) => setStep(e.target.value)} disabled={!!replace}>
                {STEP_TEMPLATES.map((s) => (
                  <option key={s.stepNo} value={s.stepNo}>
                    {t("common.step", { n: s.stepNo })} · {td(`steps.s${s.stepNo}.short`)}
                  </option>
                ))}
                <option value="impl">{t("documents.implementationPhase")}</option>
              </Select>
            )}
          </Field>
        </div>
        <Field label={t("documents.description")}>{(p) => <Textarea {...p} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
        <Field label={t("documents.file")} required>
          {(p) => (
            <input
              {...p}
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-lg file:border-0 file:bg-navy-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-navy-800 hover:file:bg-navy-100"
            />
          )}
        </Field>
        <Checkbox label={t("documents.acknowledge")} checked={ack} onChange={(e) => setAck(e.target.checked)} />
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={busy}>
            {t("common.upload")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
