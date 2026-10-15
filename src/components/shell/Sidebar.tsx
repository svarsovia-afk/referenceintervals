"use client";

import { ChevronLeft, ChevronRight, ClipboardList, FileText, LayoutDashboard, Map, Plus, Search, Settings, Syringe, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { computeProgress } from "@/domain/progress";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppStateProvider";

const ROADMAPS_PER_PAGE = 5;

function NavLink({ href, icon: Icon, label, active, sub }: { href: string; icon: typeof Map; label: string; active: boolean; sub?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 text-sm transition-colors",
        sub ? "py-1.5 text-[13px]" : "py-2 font-medium",
        active ? "bg-white/12 text-white" : "text-navy-100/80 hover:bg-white/8 hover:text-white",
      )}
    >
      <Icon className={cn("shrink-0", sub ? "h-3.5 w-3.5" : "h-4 w-4")} aria-hidden="true" />
      <span className="truncate">{label}</span>
      {active && !sub && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden="true" />}
    </Link>
  );
}

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const { t, loc } = useI18n();
  const { state, can } = useApp();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.roadmaps.filter((r) =>
      !q || [r.disease.nl, r.disease.en, r.targetPopulation.nl, r.targetPopulation.en].some((v) => v.toLowerCase().includes(q)),
    );
  }, [state.roadmaps, query]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / ROADMAPS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * ROADMAPS_PER_PAGE, currentPage * ROADMAPS_PER_PAGE);
  const activeRoadmapId = pathname.match(/^\/roadmaps\/([^/]+)/)?.[1];

  return (
    <div className="flex h-full flex-col bg-navy-900 text-white">
      <div className="flex items-center gap-3 px-5 pb-4 pt-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600">
          <Syringe className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold">{t("app.shortName")}</p>
          <p className="text-xs text-navy-100/70">{t("app.country")}</p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="ml-auto rounded-md p-1.5 hover:bg-white/10" aria-label={t("nav.closeMenu")}>
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      <nav aria-label={t("nav.main")} className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
        <div>
          <div className="mb-2 flex items-center justify-between px-3">
            <Link href="/roadmaps" className="text-xs font-semibold uppercase tracking-wider text-navy-100/70 hover:text-white">
              {t("nav.roadmaps")}
            </Link>
          </div>
          {state.roadmaps.length > ROADMAPS_PER_PAGE && (
            <div className="relative mb-2 px-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-navy-100/60" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder={t("nav.searchRoadmaps")}
                aria-label={t("nav.searchRoadmaps")}
                className="h-8 w-full rounded-md border border-white/10 bg-white/5 pl-8 pr-2 text-sm text-white placeholder:text-navy-100/50 focus:border-teal-500 focus:outline-none"
              />
            </div>
          )}
          <ul className="space-y-1">
            {visible.map((r) => {
              const active = r.id === activeRoadmapId;
              const pct = computeProgress(r).percent;
              return (
                <li key={r.id}>
                  <Link
                    href={`/roadmaps/${r.id}`}
                    aria-current={active && pathname === `/roadmaps/${r.id}` ? "page" : undefined}
                    className={cn(
                      "block rounded-lg px-3 py-2 transition-colors",
                      active ? "bg-white/12" : "hover:bg-white/8",
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Map className="h-4 w-4 shrink-0 text-teal-200" aria-hidden="true" />
                      <span className="truncate">{loc(r.disease).split(" (")[0]}</span>
                      <span className="ml-auto text-xs tabular-nums text-navy-100/70">{pct}%</span>
                    </span>
                    <span className="ml-6 block truncate text-xs text-navy-100/70">{loc(r.targetPopulation)}</span>
                  </Link>
                  {active && (
                    <div className="ml-5 mt-1 space-y-0.5 border-l border-white/10 pl-2">
                      <NavLink sub href={`/roadmaps/${r.id}`} icon={LayoutDashboard} label={t("nav.dashboard")} active={pathname === `/roadmaps/${r.id}` || pathname.startsWith(`/roadmaps/${r.id}/steps`)} />
                      <NavLink sub href={`/roadmaps/${r.id}/documents`} icon={FileText} label={t("nav.documents")} active={pathname === `/roadmaps/${r.id}/documents`} />
                      <NavLink sub href={`/roadmaps/${r.id}/implementation`} icon={ClipboardList} label={t("nav.implementation")} active={pathname === `/roadmaps/${r.id}/implementation`} />
                    </div>
                  )}
                </li>
              );
            })}
            {visible.length === 0 && <li className="px-3 py-2 text-sm text-navy-100/70">{t("nav.noRoadmapsFound")}</li>}
          </ul>
          {totalPages > 1 && (
            <div className="mt-2 flex items-center justify-between px-2 text-xs text-navy-100/70">
              <button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1} className="rounded p-1 hover:bg-white/10 disabled:opacity-40" aria-label={t("common.previous")}>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              {t("common.pageOf", { page: currentPage, total: totalPages })}
              <button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= totalPages} className="rounded p-1 hover:bg-white/10 disabled:opacity-40" aria-label={t("common.next")}>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
          {can("roadmap.create") && (
            <Link
              href="/roadmaps/new"
              className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-white/20 px-3 py-2 text-sm text-teal-100 transition-colors hover:border-teal-500 hover:bg-white/5"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("nav.createRoadmap")}
            </Link>
          )}
        </div>

        <div className="space-y-1 border-t border-white/10 pt-4">
          <NavLink href="/tasks" icon={ClipboardList} label={t("nav.myTasks")} active={pathname.startsWith("/tasks")} />
          <NavLink href="/documents" icon={FileText} label={t("nav.documents")} active={pathname === "/documents"} />
          <NavLink href="/stakeholders" icon={Users} label={t("nav.stakeholders")} active={pathname.startsWith("/stakeholders")} />
          <NavLink href="/settings" icon={Settings} label={t("nav.settings")} active={pathname.startsWith("/settings")} />
        </div>
      </nav>
    </div>
  );
}
