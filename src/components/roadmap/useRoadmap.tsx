"use client";

import { Map } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { EmptyState } from "@/components/ui/misc";
import type { Roadmap } from "@/domain/types";
import { useI18n } from "@/i18n/I18nProvider";
import { useApp } from "@/state/AppStateProvider";

export function useRoadmapFromParams(): Roadmap | undefined {
  const params = useParams<{ id: string }>();
  const { state } = useApp();
  return state.roadmaps.find((r) => r.id === params.id);
}

export function RoadmapNotFound() {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={Map}
      title={t("nav.noRoadmapsFound")}
      action={
        <Link href="/roadmaps" className="text-sm font-medium text-teal-700 hover:underline">
          {t("nav.roadmaps")}
        </Link>
      }
    />
  );
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
