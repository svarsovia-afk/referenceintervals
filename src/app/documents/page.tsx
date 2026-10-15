"use client";

import { useState } from "react";
import { RoadmapDocuments } from "@/components/documents/RoadmapDocuments";
import { Field, Select } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { useI18n } from "@/i18n/I18nProvider";
import { useApp } from "@/state/AppStateProvider";

/** Documents are organized per disease/roadmap; pick the roadmap first. */
export default function DocumentsPage() {
  const { t, loc } = useI18n();
  const { state } = useApp();
  const [roadmapId, setRoadmapId] = useState(state.roadmaps[0]?.id ?? "");
  const roadmap = state.roadmaps.find((r) => r.id === roadmapId);
  return (
    <>
      <PageHeader title={t("documents.title")} />
      {state.roadmaps.length === 0 ? (
        <EmptyState title={t("roadmaps.noRoadmaps")} />
      ) : (
        <div className="space-y-6">
          <Field label={t("documents.chooseRoadmap")} className="max-w-md">
            {(p) => (
              <Select {...p} value={roadmapId} onChange={(e) => setRoadmapId(e.target.value)}>
                {state.roadmaps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {loc(r.disease)} — {loc(r.targetPopulation)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {roadmap && <RoadmapDocuments key={roadmap.id} roadmap={roadmap} />}
        </div>
      )}
    </>
  );
}
