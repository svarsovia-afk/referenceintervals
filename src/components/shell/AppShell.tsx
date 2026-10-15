"use client";

import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppStateProvider";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

function Toasts() {
  const { toasts, dismissToast } = useApp();
  const { t } = useI18n();
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.kind === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-raised animate-fade-in",
            toast.kind === "error" && "border-coral-100 bg-coral-50 text-coral-700",
            toast.kind === "success" && "border-teal-200 bg-teal-50 text-teal-800",
            toast.kind === "info" && "border-navy-100 bg-surface text-navy-900",
          )}
        >
          <p className="flex-1">{toast.message}</p>
          <button type="button" onClick={() => dismissToast(toast.id)} aria-label={t("common.close")} className="rounded p-0.5 hover:bg-black/5">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { storageDegraded } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow-raised">
        {t("app.skipToContent")}
      </a>

      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 lg:block">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={t("nav.main")}>
          <div className="absolute inset-0 bg-navy-950/40" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-fade-in">
            <Sidebar onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenMenu={() => setMobileOpen(true)} />
        {storageDegraded && (
          <div role="alert" className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-sm text-amber-800 sm:px-8">
            {t("app.storageError")}
          </div>
        )}
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 focus:outline-none sm:px-8 sm:py-8">
          {children}
        </main>
      </div>
      <Toasts />
    </div>
  );
}
