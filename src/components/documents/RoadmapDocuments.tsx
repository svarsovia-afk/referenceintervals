"use client";

import { FileUp, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { STEP_TEMPLATES } from "@/domain/stepTemplates";
import type { DocumentCategory, Roadmap } from "@/domain/types";
import { useI18n } from "@/i18n/I18nProvider";
import { useApp } from "@/state/AppStateProvider";
import { DocumentList } from "./DocumentList";
import { DOCUMENT_CATEGORIES, UploadDialog } from "./UploadDialog";

/** Per-roadmap document overview with step and category filters. */
export function RoadmapDocuments({ roadmap }: { roadmap: Roadmap }) {
  const { t, td } = useI18n();
  const { state, can } = useApp();
  const [step, setStep] = useState("all");
  const [category, setCategory] = useState<"all" | DocumentCategory>("all");
  const [open, setOpen] = useState(false);
  const docs = state.documents.filter(
    (d) =>
      d.roadmapId === roadmap.id &&
      (step === "all" || (step === "impl" ? d.stepNo === null : d.stepNo === Number(step))) &&
      (category === "all" || d.category === category),
  );
  const filtered = step !== "all" || category !== "all";

  return (
    <div className="space-y-4">
      <Notice tone="warning" icon={ShieldAlert} title={t("documents.warningTitle")}>
        {t("documents.warningBody")}
      </Notice>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("documents.step")} className="w-full sm:w-60">
          {(p) => (
            <Select {...p} value={step} onChange={(e) => setStep(e.target.value)}>
              <option value="all">{t("documents.allSteps")}</option>
              {STEP_TEMPLATES.map((s) => (
                <option key={s.stepNo} value={s.stepNo}>
                  {t("common.step", { n: s.stepNo })} · {td(`steps.s${s.stepNo}.short`)}
                </option>
              ))}
              <option value="impl">{t("documents.implementationPhase")}</option>
            </Select>
          )}
        </Field>
        <Field label={t("documents.category")} className="w-full sm:w-64">
          {(p) => (
            <Select {...p} value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory | "all")}>
              <option value="all">{t("documents.allCategories")}</option>
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {td(`documents.categories.${c}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {filtered && (
          <Button
            variant="ghost"
            onClick={() => {
              setStep("all");
              setCategory("all");
            }}
          >
            {t("common.clearFilters")}
          </Button>
        )}
        <div className="flex-1" />
        {can("document.upload") && (
          <Button onClick={() => setOpen(true)}>
            <FileUp className="h-4 w-4" aria-hidden="true" />
            {t("documents.upload")}
          </Button>
        )}
      </div>
      <DocumentList documents={docs} emptyText={filtered ? t("documents.noDocumentsFilter") : t("documents.noDocuments")} />
      <p className="text-xs text-ink-muted">{t("documents.localOnly")}</p>
      <UploadDialog open={open} onOpenChange={setOpen} roadmapId={roadmap.id} stepNo={step === "impl" ? null : step === "all" ? 1 : Number(step)} category={category === "all" ? "other" : category} />
    </div>
  );
}
