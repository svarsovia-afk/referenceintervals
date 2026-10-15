"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, ChevronRight, FlaskConical, Menu, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Lang } from "@/domain/types";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppStateProvider";
import { Initials } from "../shared";

function useBreadcrumbs(): { label: string; href?: string }[] {
  const pathname = usePathname();
  const { t, loc } = useI18n();
  const { state } = useApp();
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "roadmaps") {
    const crumbs: { label: string; href?: string }[] = [{ label: t("nav.roadmaps"), href: "/roadmaps" }];
    if (parts[1] === "new") return [...crumbs, { label: t("nav.createRoadmap") }];
    const r = state.roadmaps.find((x) => x.id === parts[1]);
    if (r) crumbs.push({ label: `${loc(r.disease).split(" (")[0]} — ${loc(r.targetPopulation)}`, href: `/roadmaps/${r.id}` });
    if (parts[2] === "steps" && parts[3]) crumbs.push({ label: t("common.step", { n: parts[3] }) });
    if (parts[2] === "documents") crumbs.push({ label: t("nav.documents") });
    if (parts[2] === "implementation") crumbs.push({ label: t("nav.implementation") });
    return crumbs;
  }
  const map: Record<string, string> = {
    tasks: t("nav.myTasks"),
    documents: t("nav.documents"),
    stakeholders: t("nav.stakeholders"),
    settings: t("nav.settings"),
  };
  return parts[0] && map[parts[0]] ? [{ label: map[parts[0]] }] : [];
}

function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  const options: { value: Lang; label: string }[] = [
    { value: "nl", label: "Nederlands" },
    { value: "en", label: "English" },
  ];
  return (
    <div role="group" aria-label={t("header.language")} className="flex rounded-lg border border-line bg-canvas p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          lang={o.value}
          aria-pressed={lang === o.value}
          onClick={() => setLang(o.value)}
          className={cn(
            "rounded-md px-2 py-1 text-xs font-medium transition-colors sm:px-2.5",
            lang === o.value ? "bg-navy-800 text-white shadow-sm" : "text-ink-muted hover:text-navy-800",
          )}
        >
          <span className="sm:hidden">{o.value.toUpperCase()}</span>
          <span className="hidden sm:inline">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function PrototypeIndicator() {
  const { t } = useI18n();
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
        >
          <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">{t("app.prototype")}</span>
          <span className="sr-only sm:hidden">{t("app.prototypeTitle")}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={8} align="end" className="z-50 w-80 rounded-xl border border-line bg-surface p-4 text-sm shadow-raised animate-fade-in">
          <p className="font-semibold text-navy-900">{t("app.prototypeTitle")}</p>
          <p className="mt-1.5 leading-relaxed text-ink-muted">{t("app.prototypeBody")}</p>
          <Popover.Arrow className="fill-surface" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

const menuItem =
  "flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-2 text-sm text-ink outline-none data-[highlighted]:bg-navy-50";

function UserMenu() {
  const { t, td } = useI18n();
  const { state, currentUser, setCurrentUserId, notify } = useApp();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg border border-line bg-surface py-1 pl-1 pr-2 text-left hover:bg-navy-50"
          aria-label={`${t("header.currentUser")}: ${currentUser.fullName}`}
        >
          <Initials name={currentUser.fullName} />
          <span className="hidden min-w-0 leading-tight md:block">
            <span className="block truncate text-sm font-medium text-ink">{currentUser.fullName}</span>
            <span className="block truncate text-xs text-ink-muted">{currentUser.roles.map((r) => td(`roles.${r}`)).join(", ")}</span>
          </span>
          <ChevronDown className="h-4 w-4 text-ink-muted" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 w-80 rounded-xl border border-line bg-surface p-1.5 shadow-raised animate-fade-in">
          <DropdownMenu.Label className="px-2 pb-1 pt-1.5 text-xs text-ink-muted">{t("profile.signedInAs")}</DropdownMenu.Label>
          <DropdownMenu.Item asChild className={menuItem}>
            <Link href={`/stakeholders?edit=${currentUser.id}`}>
              <UserRound className="h-4 w-4 text-ink-muted" aria-hidden="true" />
              {t("header.myContactRecord")}
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1.5 h-px bg-line" />
          <DropdownMenu.Label className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {t("header.switchUser")}
          </DropdownMenu.Label>
          <p className="px-2 pb-1.5 text-xs text-amber-700">{t("header.demoUserNote")}</p>
          <DropdownMenu.RadioGroup
            value={currentUser.id}
            onValueChange={(id) => {
              setCurrentUserId(id);
              const name = state.stakeholders.find((s) => s.id === id)?.fullName ?? "";
              notify(`${t("header.currentUser")}: ${name}`, "info");
            }}
          >
            {state.stakeholders.map((s) => (
              <DropdownMenu.RadioItem key={s.id} value={s.id} className={menuItem}>
                <Initials name={s.fullName} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate font-medium">{s.fullName}</span>
                  <span className="block truncate text-xs text-ink-muted">{s.roles.map((r) => td(`roles.${r}`)).join(", ")}</span>
                </span>
                <DropdownMenu.ItemIndicator>
                  <Check className="h-4 w-4 text-teal-700" aria-hidden="true" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function Header({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { t } = useI18n();
  const crumbs = useBreadcrumbs();
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-8">
      <button type="button" onClick={onOpenMenu} className="rounded-md p-2 text-navy-800 hover:bg-navy-50 lg:hidden" aria-label={t("nav.openMenu")}>
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1 text-sm">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={i} className={cn("flex min-w-0 items-center gap-1", !last && "hidden sm:flex")}>
                {i > 0 && <ChevronRight className="hidden h-4 w-4 shrink-0 text-ink-subtle sm:block" aria-hidden="true" />}
                {c.href && !last ? (
                  <Link href={c.href} className="truncate text-ink-muted hover:text-navy-800">
                    {c.label}
                  </Link>
                ) : (
                  <span className="truncate font-medium text-navy-900" aria-current={last ? "page" : undefined}>
                    {c.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <PrototypeIndicator />
      <LanguageSwitch />
      <UserMenu />
    </header>
  );
}
