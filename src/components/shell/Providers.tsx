"use client";

import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { I18nProvider, useI18n } from "@/i18n/I18nProvider";
import { AppStateProvider } from "@/state/AppStateProvider";
import { AppShell } from "./AppShell";

function Loading() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center gap-3 text-ink-muted" role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      {t("app.loading")}
    </div>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <AppStateProvider fallback={<Loading />}>
        <AppShell>{children}</AppShell>
      </AppStateProvider>
    </I18nProvider>
  );
}
