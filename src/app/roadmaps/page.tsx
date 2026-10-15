"use client";

import { ArrowRight, Map, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { SampleBadge, ScoreBadge, useStakeholderLookup } from "@/components/shared";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { EmptyState, PageHeader, Pagination, ProgressBar, usePaged } from "@/components/ui/misc";
import { computeProgress, currentStepNo } from "@/domain/progress";
import { useI18n } from "@/i18n/I18nProvider";
import { useApp } from "@/state/AppStateProvider";

export default function RoadmapsPage() {
  const { t, td, loc } = useI18n();
  const { state, can } = useApp();
  const people = useStakeholderLookup();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.roadmaps.filter((r) => !q || [r.disease.nl, r.disease.en, r.targetPopulation.nl, r.targetPopulation.en].some((v) => v.toLowerCase().includes(q)));
  }, [state.roadmaps, query]);
  const paged = usePaged(filtered);

  return (
    <>
      <PageHeader
        title={t("roadmaps.title")}
        description={t("roadmaps.intro")}
        actions={
          can("roadmap.create") && (
            <Link href="/roadmaps/new" className={buttonClasses()}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("roadmaps.create")}
            </Link>
          )
        }
      />
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
        <Input type="search" className="pl-9" placeholder={t("nav.searchRoadmaps")} aria-label={t("nav.searchRoadmaps")} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {paged.count === 0 ? (
        <EmptyState icon={Map} title={query ? t("nav.noRoadmapsFound") : t("roadmaps.noRoadmaps")} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {paged.visible.map((r) => {
            const p = computeProgress(r);
            const cur = currentStepNo(r);
            return (
              <Card key={r.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold text-navy-900">{loc(r.disease)}</h2>
                    <p className="text-sm text-ink-muted">{loc(r.targetPopulation)} · {loc(r.geographicScope)}</p>
                  </div>
                  {r.isSample && <SampleBadge />}
                </div>
                <div className="mt-4 space-y-1.5">
                  <div className="flex justify-between text-xs text-ink-muted">
                    <span>{t("dashboard.progress")}</span>
                    <span className="font-semibold tabular-nums text-navy-900">{p.percent}%</span>
                  </div>
                  <ProgressBar value={p.percent} label={`${t("dashboard.progress")}: ${loc(r.disease)}`} size="sm" />
                </div>
                <dl className="mt-4 space-y-1 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-muted">{t("dashboard.currentStage")}</dt>
                    <dd className="text-right font-medium">{cur ? `${t("common.step", { n: cur })} · ${td(`steps.s${cur}.short`)}` : t("dashboard.allStepsComplete")}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-muted">{t("dashboard.roadmapOwner")}</dt>
                    <dd className="text-right">{people.name(r.ownerId)}</dd>
                  </div>
                  {cur && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-muted">{t("dashboard.readiness")}</dt>
                      <dd>
                        <ScoreBadge score={r.steps[cur - 1].approvedScore} />
                      </dd>
                    </div>
                  )}
                </dl>
                <Link href={`/roadmaps/${r.id}`} className="mt-5 inline-flex items-center gap-1.5 self-start text-sm font-medium text-teal-700 hover:text-teal-800">
                  {t("roadmaps.open")}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Card>
            );
          })}
        </div>
      )}
      <Pagination page={paged.page} total={paged.total} count={paged.count} onChange={paged.setPage} />
    </>
  );
}
