"use client";

import { Download, FlaskConical, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useStakeholderLookup } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { EmptyState, Notice, PageHeader, Pagination, usePaged } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ALL_PERMISSIONS, ALL_ROLES, APPROVAL_KEYS } from "@/domain/config";
import { stepAverage } from "@/domain/durations";
import { hasPermission } from "@/domain/permissions";
import { SAMPLE_HISTORY_ROADMAP_ID } from "@/domain/seed";
import { STEP_TEMPLATES } from "@/domain/stepTemplates";
import type { AuditAction, AuditEntry, PermissionKey, RoleId, Settings } from "@/domain/types";
import { useI18n } from "@/i18n/I18nProvider";
import { errorMessage } from "@/lib/errors";
import { useApp } from "@/state/AppStateProvider";

const th = "px-3 py-2 text-left text-xs font-medium text-ink-muted";
const td_ = "px-3 py-2.5 align-top";

function useRoadmapName() {
  const { state } = useApp();
  const { loc, t } = useI18n();
  return (id: string) => {
    if (id === SAMPLE_HISTORY_ROADMAP_ID) return t("common.sample");
    const r = state.roadmaps.find((x) => x.id === id);
    return r ? `${loc(r.disease).split(" (")[0]} — ${loc(r.targetPopulation)}` : id;
  };
}

function GeneralTab() {
  const { t, td } = useI18n();
  const { state, can, dispatch, notify } = useApp();
  const [draft, setDraft] = useState<Settings>(state.settings);
  const [error, setError] = useState<string>();
  const [overrideStep, setOverrideStep] = useState(3);
  const stored = JSON.stringify(state.settings);
  useEffect(() => setDraft(JSON.parse(stored)), [stored]);
  const editable = can("settings.manage");
  const togglePerm = (role: RoleId, perm: PermissionKey) => {
    const list = draft.rolePermissions[role];
    setDraft({ ...draft, rolePermissions: { ...draft.rolePermissions, [role]: list.includes(perm) ? list.filter((p) => p !== perm) : [...list, perm] } });
  };
  type OverridePerm = "score.review" | "score.approve" | "deliberation.edit";
  const overridePerms: OverridePerm[] = ["score.review", "score.approve", "deliberation.edit"];
  const toggleOverride = (perm: OverridePerm, id: string) => {
    const stepO = { ...(draft.stepOverrides[overrideStep] ?? {}) };
    const list = stepO[perm] ?? [];
    stepO[perm] = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    setDraft({ ...draft, stepOverrides: { ...draft.stepOverrides, [overrideStep]: stepO } });
  };

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        const res = dispatch({ type: "settings.update", settings: draft });
        if (!res.ok) return setError(errorMessage(td, res.error));
        setError(undefined);
        notify(t("common.saved"));
      }}
    >
      {!editable && <Notice tone="info">{t("settings.manageOnly")}</Notice>}
      <fieldset disabled={!editable} className="space-y-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("settings.permissions")}</CardTitle>
              <p className="mt-0.5 text-xs text-ink-muted">{t("settings.permissionsIntro")}</p>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            <Checkbox label={t("settings.separation")} checked={draft.separationOfDuties} onChange={(e) => setDraft({ ...draft, separationOfDuties: e.target.checked })} />
            <details className="rounded-lg border border-line">
              <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium">{t("common.showDetails")}</summary>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem] text-sm">
                  <thead className="bg-canvas">
                    <tr>
                      <th className={th}>{t("settings.columns.action")}</th>
                      {ALL_ROLES.map((r) => (
                        <th key={r} className={`${th} text-center`}>
                          {td(`roles.${r}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {ALL_PERMISSIONS.map((perm) => (
                      <tr key={perm}>
                        <th scope="row" className="px-3 py-1.5 text-left font-mono text-xs font-normal">
                          {perm}
                        </th>
                        {ALL_ROLES.map((r) => (
                          <td key={r} className="px-3 py-1.5 text-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-teal-700"
                              aria-label={`${td(`roles.${r}`)}: ${perm}`}
                              checked={draft.rolePermissions[r].includes(perm)}
                              onChange={() => togglePerm(r, perm)}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("settings.stepOverrides")}</CardTitle>
              <p className="mt-0.5 text-xs text-ink-muted">{t("settings.stepOverridesIntro")}</p>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            <Field label={t("common.stepShort")} className="max-w-xs">
              {(p) => (
                <Select {...p} value={overrideStep} onChange={(e) => setOverrideStep(Number(e.target.value))}>
                  {STEP_TEMPLATES.map((s) => (
                    <option key={s.stepNo} value={s.stepNo}>
                      {t("common.step", { n: s.stepNo })} · {td(`steps.s${s.stepNo}.short`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div className="grid gap-4 md:grid-cols-3">
              {overridePerms.map((perm) => {
                const list = draft.stepOverrides[overrideStep]?.[perm] ?? [];
                return (
                  <fieldset key={perm} className="space-y-1.5 rounded-lg border border-line p-3">
                    <legend className="px-1 font-mono text-xs">{perm}</legend>
                    <p className="text-xs text-ink-muted">{list.length === 0 ? t("settings.noRestriction") : ""}</p>
                    {state.stakeholders
                      .filter((s) => hasPermission(s, perm, draft))
                      .map((s) => (
                        <Checkbox key={s.id} label={s.fullName} checked={list.includes(s.id)} onChange={() => toggleOverride(perm, s.id)} />
                      ))}
                  </fieldset>
                );
              })}
            </div>
          </CardBody>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.outlierThresholds")}</CardTitle>
            </CardHeader>
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label={t("settings.lower")}>
                {(p) => <Input {...p} type="number" step={0.05} min={0.05} max={0.95} value={draft.outlierLower} onChange={(e) => setDraft({ ...draft, outlierLower: Number(e.target.value) })} />}
              </Field>
              <Field label={t("settings.upper")}>
                {(p) => <Input {...p} type="number" step={0.05} min={1.05} value={draft.outlierUpper} onChange={(e) => setDraft({ ...draft, outlierUpper: Number(e.target.value) })} />}
              </Field>
              <Field label={t("settings.minPersonal")}>
                {(p) => <Input {...p} type="number" min={1} value={draft.minPersonalSamples} onChange={(e) => setDraft({ ...draft, minPersonalSamples: Math.max(1, Number(e.target.value)) })} />}
              </Field>
              <Field label={t("settings.minOverall")}>
                {(p) => <Input {...p} type="number" min={1} value={draft.minOverallSamples} onChange={(e) => setDraft({ ...draft, minOverallSamples: Math.max(1, Number(e.target.value)) })} />}
              </Field>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.implementationReqs")}</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2">
              {APPROVAL_KEYS.map((k) => (
                <Checkbox
                  key={k}
                  label={td(`approvals.items.${k}`)}
                  checked={draft.implementationRequirements.includes(k)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      implementationRequirements: e.target.checked ? [...draft.implementationRequirements, k] : draft.implementationRequirements.filter((x) => x !== k),
                    })
                  }
                />
              ))}
            </CardBody>
          </Card>
        </div>
      </fieldset>
      {error && <Notice tone="danger">{error}</Notice>}
      {editable && <Button type="submit">{t("settings.saveSettings")}</Button>}
    </form>
  );
}

function ScoreHistoryTab() {
  const { t, td, formatDateTime } = useI18n();
  const { state } = useApp();
  const people = useStakeholderLookup();
  const roadmapName = useRoadmapName();
  const items = [...state.scoreProposals].sort((a, b) => b.proposedAt.localeCompare(a.proposedAt));
  const paged = usePaged(items);
  if (!items.length) return <EmptyState title={t("settings.noScoreHistory")} />;
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="bg-canvas">
            <tr>
              {(["date", "roadmap", "step", "previous", "proposed", "reviewer", "approver", "outcome", "note"] as const).map((c) => (
                <th key={c} className={th}>
                  {t(`settings.columns.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {paged.visible.map((p) => (
              <tr key={p.id}>
                <td className={td_}>{formatDateTime(p.approvedAt ?? p.reviewedAt ?? p.proposedAt)}</td>
                <td className={td_}>{roadmapName(p.roadmapId)}</td>
                <td className={td_}>{p.stepNo}</td>
                <td className={`${td_} tabular-nums`}>{p.previousScore}</td>
                <td className={`${td_} tabular-nums`}>
                  {p.proposedScore}
                  <span className="block text-xs text-ink-muted">{people.name(p.proposedBy)}</span>
                </td>
                <td className={td_}>{p.reviewedBy ? people.name(p.reviewedBy) : "—"}</td>
                <td className={td_}>{p.approvedBy ? people.name(p.approvedBy) : "—"}</td>
                <td className={td_}>
                  <Badge tone={p.status === "approved" ? "teal" : p.status === "returned" ? "coral" : "amber"}>{td(`proposalStatus.${p.status}`)}</Badge>
                  {p.overrideReason && (
                    <Badge tone="coral" className="mt-1">
                      {t("readiness.override")}
                    </Badge>
                  )}
                </td>
                <td className={`${td_} max-w-xs text-xs text-ink-muted`}>{[p.note, p.reviewNote, p.approvalNote].filter(Boolean).join(" · ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 pb-3">
        <Pagination page={paged.page} total={paged.total} count={paged.count} onChange={paged.setPage} />
      </div>
    </Card>
  );
}

/** Aggregated duration per step (all accepted records) — for spotting bottlenecks, not people. */
function DurationTrends() {
  const { t, td } = useI18n();
  const { state } = useApp();
  const rows = [...STEP_TEMPLATES.map((s) => s.stepNo), null].map((stepNo) => {
    const avg = stepAverage(state.durationRecords, stepNo);
    const ests = state.durationRecords.filter((d) => d.status === "accepted" && d.stepNo === stepNo && d.estimatedDays !== undefined).map((d) => d.estimatedDays as number);
    const est = ests.length ? ests.reduce((a, b) => a + b, 0) / ests.length : null;
    return { stepNo, avg: avg.average, n: avg.sampleSize, est };
  });
  const max = Math.max(1, ...rows.flatMap((r) => [r.avg ?? 0, r.est ?? 0]));
  const withData = rows.filter((r) => r.n > 0);
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{t("durations.trends")}</CardTitle>
          <p className="mt-0.5 text-xs text-ink-muted">{t("durations.trendsHint")}</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-ink-muted" aria-hidden="true">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm bg-teal-600" />
            {t("tasks.actual")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-0.5 bg-navy-800" />
            {t("tasks.estimated")}
          </span>
        </div>
      </CardHeader>
      <CardBody>
        {withData.length === 0 ? (
          <EmptyState title={t("durations.noHistory")} />
        ) : (
          <ul className="space-y-2.5">
            {withData.map((r) => {
              const label = r.stepNo === null ? t("tasks.implementationPhase") : `${t("common.step", { n: r.stepNo })} · ${td(`steps.s${r.stepNo}.short`)}`;
              const summary = `${t("durations.averageVsEstimate", { avg: (r.avg ?? 0).toFixed(1), est: r.est === null ? "—" : r.est.toFixed(1) })} · n = ${r.n}`;
              return (
                <li key={String(r.stepNo)} className="grid items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[12rem_1fr_13rem]" title={`${label}: ${summary}`}>
                  <span className="truncate text-ink">{label}</span>
                  <span className="relative h-4 rounded bg-navy-50" aria-hidden="true">
                    <span className="absolute inset-y-0 left-0 rounded-r bg-teal-600" style={{ width: `${((r.avg ?? 0) / max) * 100}%` }} />
                    {r.est !== null && <span className="absolute -inset-y-0.5 w-0.5 bg-navy-800" style={{ left: `${(r.est / max) * 100}%` }} />}
                  </span>
                  <span className="text-xs tabular-nums text-ink-muted">{summary}</span>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function TimeHistoryTab() {
  const { t, td, loc, formatDate } = useI18n();
  const { state, currentUser, can } = useApp();
  const people = useStakeholderLookup();
  const roadmapName = useRoadmapName();
  const viewAll = can("history.viewAllTime");
  const items = useMemo(
    () =>
      [...state.durationRecords]
        .filter((d) => viewAll || d.stakeholderId === currentUser.id || d.recordedBy === currentUser.id)
        .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
    [state.durationRecords, viewAll, currentUser.id],
  );
  const paged = usePaged(items);
  const taskTitle = (id: string | undefined, key: string) => {
    const task = id ? state.tasks.find((x) => x.id === id) : undefined;
    if (task) return loc(task.title);
    const tpl = td(`taskTemplates.${key}.title`);
    return tpl.startsWith("taskTemplates.") ? key : tpl;
  };
  return (
    <div className="space-y-6">
      <DurationTrends />
      {!viewAll && <Notice tone="info">{t("settings.historyRestricted")}</Notice>}
      <p className="text-xs text-ink-muted">{t("durations.learningNote")}</p>
      {items.length === 0 ? (
        <EmptyState title={t("durations.noHistory")} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[60rem] text-sm">
              <thead className="bg-canvas">
                <tr>
                  {(["date", "task", "person", "estimated", "actual", "comparison", "reason", "review"] as const).map((c) => (
                    <th key={c} className={th}>
                      {t(`settings.columns.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {paged.visible.map((d) => {
                  const dev = d.benchmark ? ((d.actualDays - d.benchmark.average) / d.benchmark.average) * 100 : null;
                  return (
                    <tr key={d.id}>
                      <td className={td_}>
                        {formatDate(d.recordedAt)}
                        {d.isSample && (
                          <Badge tone="amber" className="mt-1" title={t("common.sampleHint")}>
                            <FlaskConical className="h-3 w-3" aria-hidden="true" />
                            {t("common.sample")}
                          </Badge>
                        )}
                      </td>
                      <td className={td_}>
                        {taskTitle(d.taskId, d.templateKey)}
                        <span className="block text-xs text-ink-muted">
                          {roadmapName(d.roadmapId)} · {d.stepNo ? t("common.step", { n: d.stepNo }) : t("tasks.implementationPhase")}
                        </span>
                      </td>
                      <td className={td_}>{people.name(d.stakeholderId)}</td>
                      <td className={`${td_} tabular-nums`}>{d.estimatedDays ?? "—"}</td>
                      <td className={`${td_} tabular-nums`}>
                        {d.actualDays}
                        <span className="block text-xs text-ink-muted">{d.method === "manual" ? t("durations.manual").split(" (")[0] : t("durations.byDates").split(" ").slice(0, 3).join(" ")}</span>
                      </td>
                      <td className={`${td_} text-xs`}>
                        {d.benchmark ? (
                          <>
                            {d.benchmark.kind === "personal" ? t("durations.personalAvg") : `${t("durations.overallAvg")} (${t("durations.provisional")})`}: {d.benchmark.average.toFixed(1)} (n = {d.benchmark.sampleSize})
                            {dev !== null && <span className="block text-ink-muted">{`${dev > 0 ? "+" : ""}${dev.toFixed(0)}%`}</span>}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={`${td_} max-w-xs text-xs`}>{d.reason ?? "—"}</td>
                      <td className={td_}>
                        <Badge tone={d.status === "accepted" ? "teal" : d.status === "returned" ? "coral" : "amber"}>{td(`durations.statuses.${d.status}`)}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-3">
            <Pagination page={paged.page} total={paged.total} count={paged.count} onChange={paged.setPage} />
          </div>
        </Card>
      )}
    </div>
  );
}

function AuditTab() {
  const { t, td, loc, formatDateTime } = useI18n();
  const { state } = useApp();
  const people = useStakeholderLookup();
  const [action, setAction] = useState<"all" | AuditAction>("all");
  const actions = useMemo(() => [...new Set(state.audit.map((a) => a.action))].sort(), [state.audit]);
  const items = useMemo(() => [...state.audit].filter((a) => action === "all" || a.action === action).reverse(), [state.audit, action]);
  const paged = usePaged(items);
  const roadmapName = useRoadmapName();
  /** Labels are rendered in the current language where the object can still be resolved. */
  const objectLabel = (a: AuditEntry) => {
    if (a.stepNo && a.roadmapId) return `${roadmapName(a.roadmapId)} · ${t("common.step", { n: a.stepNo })}`;
    const taskId = a.objectType === "task" ? a.objectId : a.objectType === "duration" ? state.durationRecords.find((d) => d.id === a.objectId)?.taskId : undefined;
    const task = taskId ? state.tasks.find((x) => x.id === taskId) : undefined;
    if (task) return loc(task.title);
    if (a.objectType === "approval") return td(`approvals.items.${a.objectLabel}`);
    return a.objectLabel ?? a.objectId;
  };
  const value = (action: AuditAction, v?: string) => {
    if (v === undefined) return "—";
    if (action === "task.statusChanged") return td(`taskStatus.${v}`);
    if (action === "pathway.changed") return td(`pathway.${v}`);
    if (action.startsWith("score.") && /^(proposed|reviewed|returned|approved)$/.test(v)) return td(`proposalStatus.${v}`);
    return v;
  };
  return (
    <div className="space-y-4">
      <Notice tone="info">{t("settings.auditAppendOnly")}</Notice>
      <Field label={t("settings.filterAction")} className="max-w-sm">
        {(p) => (
          <Select {...p} value={action} onChange={(e) => setAction(e.target.value as AuditAction | "all")}>
            <option value="all">{t("common.all")}</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {td(`audit.${a}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {items.length === 0 ? (
        <EmptyState title={t("settings.noAudit")} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="bg-canvas">
                <tr>
                  {(["date", "actor", "action", "object", "change", "reason"] as const).map((c) => (
                    <th key={c} className={th}>
                      {t(`settings.columns.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {paged.visible.map((a) => (
                  <tr key={a.id}>
                    <td className={`${td_} whitespace-nowrap`}>{formatDateTime(a.at)}</td>
                    <td className={td_}>{people.name(a.actorId)}</td>
                    <td className={td_}>{td(`audit.${a.action}`)}</td>
                    <td className={`${td_} text-xs`}>{objectLabel(a)}</td>
                    <td className={`${td_} max-w-xs break-words font-mono text-xs text-ink-muted`}>
                      {a.previous !== undefined || a.next !== undefined ? `${value(a.action, a.previous)} → ${value(a.action, a.next)}` : "—"}
                    </td>
                    <td className={`${td_} max-w-xs text-xs`}>{a.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-3">
            <Pagination page={paged.page} total={paged.total} count={paged.count} onChange={paged.setPage} />
          </div>
        </Card>
      )}
    </div>
  );
}

function DataTab() {
  const { t } = useI18n();
  const { state, can, resetDemoData, notify } = useApp();
  const [confirm, setConfirm] = useState(false);
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `immunization-roadmap-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Card>
      <CardBody className="space-y-4">
        <Notice tone="warning" icon={FlaskConical} title={t("app.prototypeTitle")}>
          {t("settings.storageInfo")}
        </Notice>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportJson}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {t("settings.exportData")}
          </Button>
          {can("settings.manage") && (
            <Button variant="danger" onClick={() => setConfirm(true)}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {t("settings.resetData")}
            </Button>
          )}
        </div>
        {!can("settings.manage") && <p className="text-sm text-ink-muted">{t("settings.manageOnly")}</p>}
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          description={t("settings.resetConfirm")}
          destructive
          onConfirm={async () => {
            await resetDemoData();
            setConfirm(false);
            notify(t("settings.resetDone"));
          }}
        />
      </CardBody>
    </Card>
  );
}

export default function SettingsPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t("settings.title")} />
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">{t("settings.general")}</TabsTrigger>
          <TabsTrigger value="scores">{t("settings.scoreHistory")}</TabsTrigger>
          <TabsTrigger value="time">{t("settings.timeHistory")}</TabsTrigger>
          <TabsTrigger value="audit">{t("settings.auditLog")}</TabsTrigger>
          <TabsTrigger value="data">{t("settings.data")}</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <GeneralTab />
        </TabsContent>
        <TabsContent value="scores">
          <ScoreHistoryTab />
        </TabsContent>
        <TabsContent value="time">
          <TimeHistoryTab />
        </TabsContent>
        <TabsContent value="audit">
          <AuditTab />
        </TabsContent>
        <TabsContent value="data">
          <DataTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
