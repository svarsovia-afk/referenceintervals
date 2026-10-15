"use client";

import { ChevronLeft, ChevronRight, Inbox, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PAGE_SIZE } from "@/domain/config";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function ProgressBar({ value, label, className, size = "md" }: { value: number; label: string; className?: string; size?: "sm" | "md" }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn("w-full overflow-hidden rounded-full bg-navy-100", size === "md" ? "h-3" : "h-1.5", className)}
    >
      <div className="h-full rounded-full bg-teal-600 transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ title, description, icon: Icon = Inbox, action }: { title: string; description?: string; icon?: LucideIcon; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-canvas/60 px-6 py-10 text-center">
      <Icon className="mb-3 h-8 w-8 text-ink-subtle" aria-hidden="true" />
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Client-side paging with the platform-wide maximum of six visible items. */
export function usePaged<T>(items: T[], pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const total = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => {
    if (page > total) setPage(total);
  }, [page, total]);
  const visible = useMemo(() => items.slice((page - 1) * pageSize, page * pageSize), [items, page, pageSize]);
  return { page: Math.min(page, total), setPage, total, visible, count: items.length, pageSize };
}

export function Pagination({ page, total, count, pageSize = PAGE_SIZE, onChange }: { page: number; total: number; count: number; pageSize?: number; onChange: (p: number) => void }) {
  const { t } = useI18n();
  if (count <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(count, page * pageSize);
  return (
    <nav aria-label={t("common.pagination")} className="flex items-center justify-between gap-3 pt-3 text-sm text-ink-muted">
      <span aria-live="polite">{t("common.showingOf", { from, to, total: count })}</span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={() => onChange(page - 1)} disabled={page <= 1}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          {t("common.previous")}
        </Button>
        <span className="px-2">{t("common.pageOf", { page, total })}</span>
        <Button variant="outline" size="sm" onClick={() => onChange(page + 1)} disabled={page >= total}>
          {t("common.next")}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

export function Notice({ tone = "info", title, children, icon: Icon, className }: { tone?: "info" | "warning" | "danger" | "success"; title?: ReactNode; children?: ReactNode; icon?: LucideIcon; className?: string }) {
  const tones = {
    info: "border-navy-100 bg-navy-50 text-navy-900",
    warning: "border-amber-100 bg-amber-50 text-amber-800",
    danger: "border-coral-100 bg-coral-50 text-coral-700",
    success: "border-teal-200 bg-teal-50 text-teal-800",
  } as const;
  return (
    <div role={tone === "danger" ? "alert" : "note"} className={cn("flex gap-3 rounded-lg border px-4 py-3 text-sm", tones[tone], className)}>
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
      <div className="space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed">{children}</div>}
      </div>
    </div>
  );
}

export function SectionHeading({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-navy-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-teal-700">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
