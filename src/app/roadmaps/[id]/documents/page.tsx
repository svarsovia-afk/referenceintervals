"use client";

import { RoadmapDocuments } from "@/components/documents/RoadmapDocuments";
import { RoadmapNotFound, useRoadmapFromParams } from "@/components/roadmap/useRoadmap";
import { PageHeader } from "@/components/ui/misc";
import { useI18n } from "@/i18n/I18nProvider";

export default function RoadmapDocumentsPage() {
  const roadmap = useRoadmapFromParams();
  const { t, loc } = useI18n();
  if (!roadmap) return <RoadmapNotFound />;
  return (
    <>
      <PageHeader title={t("documents.roadmapTitle", { roadmap: `${loc(roadmap.disease).split(" (")[0]} — ${loc(roadmap.targetPopulation)}` })} />
      <RoadmapDocuments roadmap={roadmap} />
    </>
  );
}
