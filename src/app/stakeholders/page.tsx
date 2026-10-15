"use client";

import { AlertTriangle, Mail, Pencil, Plus, Star, UserX } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ContactResponsibleButton } from "@/components/roadmap/ContactButton";
import { Initials } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Notice, PageHeader, Pagination, usePaged } from "@/components/ui/misc";
import { ALL_ROLES } from "@/domain/config";
import { makeId } from "@/domain/ids";
import { canEditRoles, canEditStakeholder, hasPermission } from "@/domain/permissions";
import type { PositionKey, RoleId, Stakeholder } from "@/domain/types";
import { useI18n } from "@/i18n/I18nProvider";
import { errorMessage } from "@/lib/errors";
import { buildMailto } from "@/lib/mailto";
import { useApp } from "@/state/AppStateProvider";

const POSITIONS: PositionKey[] = [
  "headJgz",
  "epiManager",
  "immunizationPhysician",
  "youthPhysician",
  "ggdHead",
  "sectorDirector",
  "secretaryGeneral",
  "committeeMember",
  "laboratory",
  "clinician",
  "policyAdvisor",
  "administrator",
  "other",
];
/** Positions whose coverage is tracked in the coverage table. */
const COVERAGE_POSITIONS: PositionKey[] = POSITIONS.slice(0, 10);

function StakeholderEditor({ open, onOpenChange, stakeholder }: { open: boolean; onOpenChange: (o: boolean) => void; stakeholder?: Stakeholder }) {
  const { t, td } = useI18n();
  const { state, currentUser, dispatch, notify } = useApp();
  const blank: Stakeholder = {
    id: "",
    fullName: "",
    email: "",
    position: "other",
    organization: "",
    coveringPosition: true,
    roles: ["viewer"],
    isPrimaryContact: false,
    ccOnCommunications: false,
    isDemo: false,
  };
  const [draft, setDraft] = useState<Stakeholder>(stakeholder ?? blank);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (open) {
      setDraft(stakeholder ? { ...stakeholder } : { ...blank, id: makeId("sh") });
      setError(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stakeholder?.id]);

  const rolesEditable = canEditRoles(currentUser, state.settings);
  const contactFlagsEditable = rolesEditable || hasPermission(currentUser, "roadmap.edit", state.settings);
  const set = <K extends keyof Stakeholder>(k: K, v: Stakeholder[K]) => setDraft({ ...draft, [k]: v });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const { id, ...patch } = draft;
    const res = stakeholder ? dispatch({ type: "stakeholder.update", stakeholderId: id, patch }) : dispatch({ type: "stakeholder.create", stakeholder: draft });
    if (!res.ok) return setError(errorMessage(td, res.error));
    notify(t("common.saved"));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={stakeholder ? t("stakeholders.editTitle") : t("stakeholders.add")} wide>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("stakeholders.fullName")} required>
            {(p) => <Input {...p} autoComplete="off" value={draft.fullName} onChange={(e) => set("fullName", e.target.value)} />}
          </Field>
          <Field label={t("stakeholders.email")}>
            {(p) => <Input {...p} type="email" autoComplete="off" value={draft.email} onChange={(e) => set("email", e.target.value)} />}
          </Field>
          <Field label={t("stakeholders.position")}>
            {(p) => (
              <Select {...p} value={draft.position} onChange={(e) => set("position", e.target.value as PositionKey)}>
                {POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>
                    {td(`positions.${pos}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("stakeholders.positionTitle")}>
            {(p) => <Input {...p} value={draft.positionTitle ?? ""} onChange={(e) => set("positionTitle", e.target.value || undefined)} />}
          </Field>
          <Field label={t("stakeholders.organization")}>{(p) => <Input {...p} value={draft.organization} onChange={(e) => set("organization", e.target.value)} />}</Field>
          <div className="flex items-end pb-2">
            <Checkbox label={t("stakeholders.covering")} checked={draft.coveringPosition} onChange={(e) => set("coveringPosition", e.target.checked)} />
          </div>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("stakeholders.roles")}</legend>
          {!rolesEditable && <p className="text-xs text-ink-muted">{t("stakeholders.rolesLocked")}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {ALL_ROLES.map((r) => (
              <Checkbox
                key={r}
                disabled={!rolesEditable}
                label={
                  <>
                    <span className="font-medium">{td(`roles.${r}`)}</span>
                    <span className="block text-xs text-ink-muted">{td(`roleDescriptions.${r}`)}</span>
                  </>
                }
                checked={draft.roles.includes(r)}
                onChange={(e) => set("roles", (e.target.checked ? [...draft.roles, r] : draft.roles.filter((x) => x !== r)) as RoleId[])}
              />
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-6">
          <Checkbox disabled={!contactFlagsEditable} label={t("stakeholders.primaryContact")} checked={draft.isPrimaryContact} onChange={(e) => set("isPrimaryContact", e.target.checked)} />
          <Checkbox disabled={!contactFlagsEditable} label={t("stakeholders.cc")} checked={draft.ccOnCommunications} onChange={(e) => set("ccOnCommunications", e.target.checked)} />
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="submit">{t("common.save")}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function CoverageTable() {
  const { t, td } = useI18n();
  const { state } = useApp();
  const paged = usePaged(COVERAGE_POSITIONS);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("stakeholders.coverage")}</CardTitle>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="bg-canvas text-left text-xs text-ink-muted">
            <tr>
              <th scope="col" className="px-5 py-2 font-medium">{t("stakeholders.position")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("stakeholders.coveredBy")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("stakeholders.email")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {paged.visible.map((pos) => {
              const holders = state.stakeholders.filter((s) => s.position === pos && s.coveringPosition);
              return (
                <tr key={pos}>
                  <th scope="row" className="px-5 py-2.5 text-left font-medium">{td(`positions.${pos}`)}</th>
                  <td className="px-3 py-2.5">
                    {holders.length === 0 ? (
                      <Badge tone="coral">
                        <UserX className="h-3.5 w-3.5" aria-hidden="true" />
                        {t("stakeholders.vacant")}
                      </Badge>
                    ) : (
                      holders.map((h) => h.fullName).join(", ")
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {holders.map((h) =>
                      h.email ? (
                        <span key={h.id} className="block text-ink-muted">{h.email}</span>
                      ) : (
                        <Badge key={h.id} tone="amber">
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                          {t("stakeholders.missingEmail")}
                        </Badge>
                      ),
                    )}
                    {holders.length === 0 && "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-5 pb-3">
        <Pagination page={paged.page} total={paged.total} count={paged.count} onChange={paged.setPage} />
      </div>
    </Card>
  );
}

function StakeholdersInner() {
  const { t, td } = useI18n();
  const { state, currentUser, can } = useApp();
  const search = useSearchParams();
  const router = useRouter();
  const [editing, setEditing] = useState<Stakeholder | undefined>();
  const [open, setOpen] = useState(false);
  const paged = usePaged(state.stakeholders);

  useEffect(() => {
    const id = search.get("edit");
    const target = id ? state.stakeholders.find((s) => s.id === id) : undefined;
    if (target) {
      setEditing(target);
      setOpen(true);
      router.replace("/stakeholders", { scroll: false });
    }
  }, [search, state.stakeholders, router]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("stakeholders.title")}
        description={t("stakeholders.intro")}
        actions={
          <>
            <ContactResponsibleButton subject={t("app.name")} />
            {can("stakeholder.editAny") && (
              <Button
                onClick={() => {
                  setEditing(undefined);
                  setOpen(true);
                }}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("stakeholders.add")}
              </Button>
            )}
          </>
        }
      />
      <CoverageTable />

      <Card>
        <CardHeader>
          <CardTitle>{t("stakeholders.directory")}</CardTitle>
        </CardHeader>
        <ul className="divide-y divide-line">
          {paged.visible.map((s) => {
            const owned = state.tasks.filter((x) => x.ownerId === s.id && x.status !== "done" && x.status !== "cancelled").length;
            const assignmentTypes = [
              owned > 0 && t("stakeholders.roleTypes.owner"),
              s.roles.includes("reviewer") && t("stakeholders.roleTypes.reviewer"),
              s.roles.includes("approver") && t("stakeholders.roleTypes.approver"),
              s.roles.length === 1 && s.roles[0] === "viewer" && t("stakeholders.roleTypes.readOnly"),
            ].filter(Boolean);
            return (
              <li key={s.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                <Initials name={s.fullName} className="h-9 w-9" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink">{s.fullName}</p>
                    {s.isPrimaryContact && (
                      <Badge tone="teal">
                        <Star className="h-3 w-3" aria-hidden="true" />
                        {t("stakeholders.primaryContact")}
                      </Badge>
                    )}
                    {s.ccOnCommunications && <Badge tone="neutral">CC</Badge>}
                    {!s.coveringPosition && <Badge tone="amber">{t("stakeholders.vacant")}</Badge>}
                    {s.isDemo && <Badge tone="outline">{t("stakeholders.demoIdentity")}</Badge>}
                  </div>
                  <p className="text-sm text-ink-muted">
                    {s.positionTitle || td(`positions.${s.position}`)} · {s.organization || "—"}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {t("stakeholders.roles")}: {s.roles.map((r) => td(`roles.${r}`)).join(", ")}
                    {assignmentTypes.length > 0 && ` · ${t("stakeholders.assignments")}: ${assignmentTypes.join(", ")}`}
                    {owned > 0 && ` (${t("stakeholders.taskOwnerOf", { n: owned })})`}
                  </p>
                  {s.email ? (
                    <a href={buildMailto({ to: [s.email], subject: t("app.name") })} className="mt-1 inline-flex items-center gap-1 text-sm text-teal-700 hover:underline">
                      <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                      {s.email}
                    </a>
                  ) : (
                    <Badge tone="amber" className="mt-1">
                      {t("stakeholders.missingEmail")}
                    </Badge>
                  )}
                </div>
                {canEditStakeholder(currentUser, s, state.settings) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(s);
                      setOpen(true);
                    }}
                    aria-label={`${t("common.edit")}: ${s.fullName}`}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    {t("common.edit")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        <div className="px-5 pb-3">
          <Pagination page={paged.page} total={paged.total} count={paged.count} onChange={paged.setPage} />
        </div>
      </Card>
      <StakeholderEditor open={open} onOpenChange={setOpen} stakeholder={editing} />
    </div>
  );
}

export default function StakeholdersPage() {
  return (
    <Suspense>
      <StakeholdersInner />
    </Suspense>
  );
}
