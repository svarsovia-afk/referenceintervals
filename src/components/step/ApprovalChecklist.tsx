"use client";

import { CheckCircle2, Circle, Landmark } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { approvalItem, implementationGate, isApprovalSatisfied } from "@/domain/approvals";
import { APPROVAL_STATUS_OPTIONS } from "@/domain/config";
import { hasPermission } from "@/domain/permissions";
import type { ApprovalItem, ApprovalKey, ApprovalStatus, Roadmap } from "@/domain/types";
import { useI18n } from "@/i18n/I18nProvider";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppStateProvider";

const GROUPS: { key: "decision" | "funding"; items: ApprovalKey[] }[] = [
  { key: "decision", items: ["advisoryReport", "submittedToLeadership", "leadershipApproval", "ministerLetter", "jgzFeedback"] },
  { key: "funding", items: ["financeApproval", "budgetYear", "grcRequest"] },
];

function ApprovalRow({ roadmap, item, index, editable, required }: { roadmap: Roadmap; item: ApprovalItem; index: number; editable: boolean; required: boolean }) {
  const { t, td, formatDate } = useI18n();
  const { dispatch, notify } = useApp();
  const [status, setStatus] = useState<ApprovalStatus>(item.status);
  const [note, setNote] = useState(item.note);
  const [date, setDate] = useState(item.date ?? "");
  const [value, setValue] = useState(item.value ?? "");
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState(false);
  const satisfied = isApprovalSatisfied(item);
  const hint = item.key === "financeApproval" || item.key === "budgetYear" || item.key === "grcRequest" ? td(`approvals.hints.${item.key}`) : undefined;

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start gap-3">
        {satisfied ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-teal-600" aria-hidden="true" /> : <Circle className="mt-0.5 h-5 w-5 text-ink-subtle" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">
            <span className="mr-1 tabular-nums text-ink-muted">{index}.</span>
            {td(`approvals.items.${item.key}`)}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
            <Badge tone={satisfied ? "teal" : item.status === "rejected" || item.status === "returned" ? "coral" : item.status === "notStarted" ? "neutral" : "amber"}>
              {td(`approvals.statuses.${item.status}`)}
            </Badge>
            {required && <Badge tone="navy">{t("approvals.requiredForImplementation")}</Badge>}
            {item.value && <span>{t("approvals.year")}: {item.value}</span>}
            {item.date && <span>· {formatDate(item.date)}</span>}
          </div>
          {item.note && <p className="mt-1 text-sm text-ink-muted">{item.note}</p>}
        </div>
        {editable && (
          <Button variant="outline" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
            {t("approvals.update")}
          </Button>
        )}
      </div>
      {open && (
        <form
          className="ml-8 mt-3 grid gap-3 rounded-lg border border-line bg-canvas p-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            const res = dispatch({ type: "approval.update", roadmapId: roadmap.id, key: item.key, status, note, date: date || undefined, value: value || undefined });
            if (!res.ok) return setError(errorMessage(td, res.error));
            setError(undefined);
            setOpen(false);
            notify(t("common.saved"));
          }}
        >
          <Field label={t("common.status")}>
            {(p) => (
              <Select {...p} value={status} onChange={(e) => setStatus(e.target.value as ApprovalStatus)}>
                {APPROVAL_STATUS_OPTIONS[item.key].map((s) => (
                  <option key={s} value={s}>
                    {td(`approvals.statuses.${s}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("common.date")}>{(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          {item.key === "budgetYear" ? (
            <Field label={t("approvals.year")}>{(p) => <Input {...p} inputMode="numeric" placeholder="2027" value={value} onChange={(e) => setValue(e.target.value)} />}</Field>
          ) : (
            <div />
          )}
          <Field label={t("common.note")} hint={hint} className="sm:col-span-3">
            {(p) => <Textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          {error && (
            <Notice tone="danger" className="sm:col-span-3">
              {error}
            </Notice>
          )}
          <div className="flex gap-2 sm:col-span-3">
            <Button type="submit" size="sm">
              {t("common.save")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

export function ApprovalChecklist({ roadmap }: { roadmap: Roadmap }) {
  const { t, td } = useI18n();
  const { state, currentUser } = useApp();
  const [group, setGroup] = useState<"decision" | "funding">("decision");
  const editable = hasPermission(currentUser, "approval.record", state.settings);
  const gate = implementationGate(roadmap, state.settings);
  const current = GROUPS.find((g) => g.key === group)!;
  const offset = group === "decision" ? 0 : GROUPS[0].items.length;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-navy-700" aria-hidden="true" />
            {t("approvals.title")}
          </CardTitle>
          <p className="mt-0.5 max-w-2xl text-xs text-ink-muted">{t("approvals.intro")}</p>
        </div>
      </CardHeader>
      <CardBody className="space-y-3 pb-0">
        <Notice tone={gate.canActivate ? "success" : "warning"}>
          {gate.canActivate
            ? t("approvals.approvalsRecorded")
            : t("approvals.approvalsOutstanding", { items: gate.missing.map((k) => td(`approvals.items.${k}`)).join("; ") })}
        </Notice>
        <div role="group" aria-label={t("approvals.title")} className="inline-flex rounded-lg border border-line bg-canvas p-0.5">
          {GROUPS.map((g, i) => (
            <button
              key={g.key}
              type="button"
              aria-pressed={group === g.key}
              onClick={() => setGroup(g.key)}
              className={cn("rounded-md px-3 py-1.5 text-sm font-medium", group === g.key ? "bg-navy-800 text-white" : "text-ink-muted hover:text-navy-800")}
            >
              {i === 0 ? `1–5` : `6–8`}
            </button>
          ))}
        </div>
      </CardBody>
      <ul className="divide-y divide-line">
        {current.items.map((key, i) => (
          <ApprovalRow
            key={`${key}-${JSON.stringify(approvalItem(roadmap, key))}`}
            roadmap={roadmap}
            item={approvalItem(roadmap, key)}
            index={offset + i + 1}
            editable={editable && roadmap.pathway !== "curative"}
            required={state.settings.implementationRequirements.includes(key)}
          />
        ))}
      </ul>
    </Card>
  );
}
