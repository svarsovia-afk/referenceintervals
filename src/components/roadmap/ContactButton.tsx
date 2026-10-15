"use client";

import { Mail } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";
import { buildMailto, responsibleRecipients } from "@/lib/mailto";
import { useApp } from "@/state/AppStateProvider";

/** Opens the user's mail application addressed to the primary contact with JGZ/EPI contacts in CC. */
export function ContactResponsibleButton({ subject, body, variant = "outline" }: { subject: string; body?: string; variant?: "outline" | "secondary" | "primary" }) {
  const { t } = useI18n();
  const { state } = useApp();
  const { to, cc, primary } = responsibleRecipients(state.stakeholders);
  if (!primary || !primary.email) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-amber-700" role="note">
        <Mail className="h-4 w-4" aria-hidden="true" />
        {t("stakeholders.noPrimary")}
      </span>
    );
  }
  return (
    <a href={buildMailto({ to, cc, subject, body })} className={buttonClasses(variant, "md")} title={t("stakeholders.contactHint")}>
      <Mail className="h-4 w-4" aria-hidden="true" />
      {t("dashboard.contactResponsible")}
    </a>
  );
}

/** Task-specific shortcut: email the owner of a task. */
export function EmailOwnerLink({ email, subject, compact }: { email?: string; subject: string; compact?: boolean }) {
  const { t } = useI18n();
  if (!email) return null;
  return (
    <a
      href={buildMailto({ to: [email], subject })}
      className={compact ? "inline-flex items-center rounded-md p-1.5 text-ink-muted hover:bg-navy-50 hover:text-navy-800" : buttonClasses("ghost", "sm")}
      aria-label={t("tasks.emailOwner")}
      title={t("tasks.emailOwner")}
    >
      <Mail className="h-4 w-4" aria-hidden="true" />
      {!compact && t("tasks.emailOwner")}
    </a>
  );
}
