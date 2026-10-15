"use client";

import { CheckCircle2, ChevronRight, CircleAlert, ShieldAlert, XCircle } from "lucide-react";
import { useState } from "react";
import { ScoreBadge, useStakeholderLookup } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Notice, Pagination, usePaged } from "@/components/ui/misc";
import { canApproveProposal, canReviewProposal, hasPermission, isAdmin } from "@/domain/permissions";
import { openProposalFor } from "@/domain/progress";
import { allowedScores, missingPrerequisites, scoreLabelKey, type PrerequisiteCode } from "@/domain/readiness";
import { getTemplate } from "@/domain/stepTemplates";
import type { Roadmap, ScoreProposal } from "@/domain/types";
import { useI18n } from "@/i18n/I18nProvider";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppStateProvider";

const ALL_PREREQS_3: PrerequisiteCode[] = ["meetingDate", "meetingHeld", "participants", "preparationDocs", "minutes", "pathwayDecided"];
const ALL_PREREQS_8: PrerequisiteCode[] = ["firstDeliberationApproved", "meetingDate", "meetingHeld", "participants", "preparationDocs", "minutes", "finalSelection"];

function WorkflowStepper({ proposal }: { proposal?: ScoreProposal }) {
  const { t } = useI18n();
  const stages = ["proposed", "reviewed", "approved"] as const;
  const reached = proposal ? (proposal.status === "proposed" ? 0 : proposal.status === "reviewed" ? 1 : proposal.status === "approved" ? 2 : -1) : -1;
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs" aria-label={t("readiness.workflow")}>
      {stages.map((s, i) => (
        <li key={s} className="flex items-center gap-1">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium",
              i <= reached ? "border-teal-600 bg-teal-50 text-teal-800" : "border-line-strong text-ink-muted",
              i === reached + 1 && proposal && proposal.status !== "returned" && "border-amber-600 bg-amber-50 text-amber-800",
            )}
          >
            {i <= reached && <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
            {t(`proposalStatus.${s}`)}
          </span>
          {i < stages.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-ink-subtle" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}

export function PrerequisiteChecklist({ roadmap, stepNo }: { roadmap: Roadmap; stepNo: number }) {
  const { t, td } = useI18n();
  const { state } = useApp();
  const missing = missingPrerequisites(roadmap, state.documents, stepNo, 3);
  const all = stepNo === 3 ? ALL_PREREQS_3 : ALL_PREREQS_8;
  return (
    <div className="rounded-lg border border-line bg-canvas p-4">
      <p className="text-sm font-semibold text-navy-900">{t("readiness.prerequisites")}</p>
      <p className="mt-0.5 text-xs text-ink-muted">{missing.length ? t("readiness.prerequisitesMissing") : t("readiness.prerequisitesMet")}</p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {[...all, ...missing.filter((m) => !all.includes(m))].map((code) => {
          const isMissing = missing.includes(code) || (code === "meetingDate" && missing.includes("meetingDateFuture"));
          const label = code === "meetingDate" && missing.includes("meetingDateFuture") ? td("prerequisites.meetingDateFuture") : td(`prerequisites.${code}`);
          if (code === "meetingDateFuture") return null;
          return (
            <li key={code} className={cn("flex items-start gap-2", isMissing ? "text-coral-700" : "text-teal-800")}>
              {isMissing ? <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
              <span>
                <span className="sr-only">{isMissing ? "✗ " : "✓ "}</span>
                {label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ProposalHistory({ roadmap, stepNo }: { roadmap: Roadmap; stepNo: number }) {
  const { t, td, formatDateTime } = useI18n();
  const { state } = useApp();
  const people = useStakeholderLookup();
  const items = state.scoreProposals.filter((p) => p.roadmapId === roadmap.id && p.stepNo === stepNo).sort((a, b) => b.proposedAt.localeCompare(a.proposedAt));
  const paged = usePaged(items);
  if (!items.length) return <p className="text-sm text-ink-muted">{t("settings.noScoreHistory")}</p>;
  return (
    <div>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {paged.visible.map((p) => (
          <li key={p.id} className="flex flex-wrap items-start gap-2 px-3 py-2.5 text-sm">
            <span className="tabular-nums font-medium">
              {p.previousScore} → {p.proposedScore}
            </span>
            <Badge tone={p.status === "approved" ? "teal" : p.status === "returned" ? "coral" : "amber"}>{td(`proposalStatus.${p.status}`)}</Badge>
            {p.overrideReason && <Badge tone="coral">{t("readiness.override")}</Badge>}
            <span className="w-full text-xs text-ink-muted">
              {t("readiness.proposedBy", { name: people.name(p.proposedBy), date: formatDateTime(p.proposedAt) })}
              {p.reviewedBy && ` · ${t("readiness.reviewedBy", { name: people.name(p.reviewedBy), date: formatDateTime(p.reviewedAt) })}`}
              {p.approvedBy && p.status === "approved" && ` · ${t("readiness.approvedBy", { name: people.name(p.approvedBy), date: formatDateTime(p.approvedAt) })}`}
            </span>
            {(p.note || p.reviewNote || p.approvalNote) && (
              <span className="w-full text-xs text-ink">{[p.note, p.reviewNote, p.approvalNote].filter(Boolean).join(" · ")}</span>
            )}
          </li>
        ))}
      </ul>
      <Pagination page={paged.page} total={paged.total} count={paged.count} onChange={paged.setPage} />
    </div>
  );
}

export function ReadinessPanel({ roadmap, stepNo }: { roadmap: Roadmap; stepNo: number }) {
  const { t, td, formatDateTime } = useI18n();
  const { state, currentUser, dispatch, notify } = useApp();
  const people = useStakeholderLookup();
  const tpl = getTemplate(stepNo);
  const step = roadmap.steps.find((s) => s.stepNo === stepNo)!;
  const open = openProposalFor(state.scoreProposals, roadmap.id, stepNo);
  const scores = allowedScores(stepNo);
  const [proposed, setProposed] = useState<number>(Math.min(step.approvedScore + 1, tpl.maxScore));
  const [note, setNote] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [overrideScore, setOverrideScore] = useState(step.approvedScore);
  const [overrideReason, setOverrideReason] = useState("");
  const [confirmOverride, setConfirmOverride] = useState(false);
  const [error, setError] = useState<string>();

  const run = (action: Parameters<typeof dispatch>[0], success: string) => {
    const res = dispatch(action);
    if (!res.ok) {
      setError(errorMessage(td, res.error));
      return false;
    }
    setError(undefined);
    setNote("");
    setDecisionNote("");
    notify(success);
    return true;
  };

  if (step.notApplicable) return <Notice tone="info">{t("readiness.notApplicable")}</Notice>;

  const canPropose = hasPermission(currentUser, "score.propose", state.settings) && !open;
  const review = open ? canReviewProposal(currentUser, open, state.settings) : null;
  const approve = open ? canApproveProposal(currentUser, open, state.settings) : null;
  const missingForOpen = open ? missingPrerequisites(roadmap, state.documents, stepNo, open.proposedScore) : [];
  const blockedReason = (check: typeof review) =>
    check && !check.allowed && check.reason === "separation" ? t("readiness.separation") : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardBody className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("readiness.approvedScore")}</p>
            <div className="flex items-center gap-3">
              <span className="text-4xl font-semibold tabular-nums text-navy-900">{step.approvedScore}</span>
              <ScoreBadge score={step.approvedScore} max={tpl.maxScore} />
            </div>
            <p className="text-xs text-ink-muted">{t("readiness.onlyApprovedCounts")}</p>
            <p className="text-xs text-ink-muted">{t("readiness.maxScore", { max: tpl.maxScore })}</p>
          </CardBody>
        </Card>
        <Card className={cn(open && "border-amber-600")}>
          <CardBody className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("readiness.pending")}</p>
            {open ? (
              <>
                <div className="flex items-center gap-3">
                  <span className="text-4xl font-semibold tabular-nums text-amber-700">{open.proposedScore}</span>
                  <ScoreBadge score={open.proposedScore} max={tpl.maxScore} tone="amber" />
                </div>
                <WorkflowStepper proposal={open} />
                <p className="text-xs text-ink-muted">{t("readiness.proposedBy", { name: people.name(open.proposedBy), date: formatDateTime(open.proposedAt) })}</p>
                {open.reviewedBy && <p className="text-xs text-ink-muted">{t("readiness.reviewedBy", { name: people.name(open.reviewedBy), date: formatDateTime(open.reviewedAt) })}</p>}
                {open.note && <p className="rounded-md bg-canvas px-2 py-1.5 text-sm">{open.note}</p>}
              </>
            ) : (
              <p className="text-sm text-ink-muted">{t("readiness.noPending")}</p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 text-xs" aria-label={t("readiness.scale")}>
        {scores.map((s) => (
          <span key={s} className="rounded-md border border-line bg-surface px-2 py-1">
            <span className="font-semibold tabular-nums">{s}</span> · {td(`scores.${scoreLabelKey(s)}`)}
          </span>
        ))}
      </div>

      {tpl.kind === "deliberation" && <PrerequisiteChecklist roadmap={roadmap} stepNo={stepNo} />}

      {error && <Notice tone="danger" icon={CircleAlert}>{error}</Notice>}

      {open && review?.allowed && (
        <Card>
          <CardHeader>
            <CardTitle>{t("readiness.review")}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <Field label={t("common.note")} hint={t("readiness.returnReason")}>
              {(p) => <Textarea {...p} rows={2} value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} />}
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => run({ type: "score.review", proposalId: open.id, decision: "reviewed", note: decisionNote }, t("proposalStatus.reviewed"))}>
                {t("readiness.markReviewed")}
              </Button>
              <Button variant="outline" onClick={() => run({ type: "score.review", proposalId: open.id, decision: "returned", note: decisionNote }, t("proposalStatus.returned"))}>
                {t("readiness.returnProposal")}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {open && approve?.allowed && (
        <Card>
          <CardHeader>
            <CardTitle>{t("readiness.approve")}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            {missingForOpen.length > 0 && (
              <Notice tone="warning" title={t("readiness.prerequisitesMissing")}>
                <ul className="list-disc pl-4">
                  {missingForOpen.map((m) => (
                    <li key={m}>{td(`prerequisites.${m}`)}</li>
                  ))}
                </ul>
              </Notice>
            )}
            <Field label={t("readiness.approvalNote")} hint={t("readiness.returnReason")}>
              {(p) => <Textarea {...p} rows={2} value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} />}
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button disabled={missingForOpen.length > 0} onClick={() => run({ type: "score.approve", proposalId: open.id, decision: "approved", note: decisionNote }, t("proposalStatus.approved"))}>
                {t("readiness.approve")}
              </Button>
              <Button variant="outline" onClick={() => run({ type: "score.approve", proposalId: open.id, decision: "returned", note: decisionNote }, t("proposalStatus.returned"))}>
                {t("readiness.returnProposal")}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {open && (blockedReason(review) || blockedReason(approve)) && (
        <Notice tone="info" icon={ShieldAlert}>
          {blockedReason(review) || blockedReason(approve)}
        </Notice>
      )}

      {canPropose && (
        <Card>
          <CardHeader>
            <CardTitle>{t("readiness.proposeTitle")}</CardTitle>
          </CardHeader>
          <CardBody>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                run({ type: "score.propose", roadmapId: roadmap.id, stepNo, score: proposed, note }, t("proposalStatus.proposed"));
              }}
            >
              <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
                <Field label={t("readiness.proposedScore")}>
                  {(p) => (
                    <Select {...p} value={proposed} onChange={(e) => setProposed(Number(e.target.value))}>
                      {scores.map((s) => (
                        <option key={s} value={s}>
                          {s} · {td(`scores.${scoreLabelKey(s)}`)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label={t("readiness.note")}>{(p) => <Textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
              </div>
              {tpl.kind === "deliberation" && proposed === 3 && missingPrerequisites(roadmap, state.documents, stepNo, 3).length > 0 && (
                <p className="text-xs text-amber-700">{t("readiness.prerequisitesMissing")} ↑</p>
              )}
              <Button type="submit">{t("readiness.propose")}</Button>
            </form>
          </CardBody>
        </Card>
      )}

      {isAdmin(currentUser) && (
        <details className="rounded-lg border border-coral-100 bg-coral-50/40 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-coral-700">{t("readiness.override")}</summary>
          <p className="mt-2 text-xs text-ink-muted">{t("readiness.overrideHint")}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[12rem_1fr]">
            <Field label={t("readiness.approvedScore")}>
              {(p) => (
                <Select {...p} value={overrideScore} onChange={(e) => setOverrideScore(Number(e.target.value))}>
                  {scores.map((s) => (
                    <option key={s} value={s}>
                      {s} · {td(`scores.${scoreLabelKey(s)}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("readiness.overrideReason")} required>
              {(p) => <Textarea {...p} rows={2} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />}
            </Field>
          </div>
          <Button variant="danger" className="mt-3" onClick={() => (overrideReason.trim() ? setConfirmOverride(true) : setError(t("errors.reasonRequired")))}>
            {t("readiness.override")}
          </Button>
          <ConfirmDialog
            open={confirmOverride}
            onOpenChange={setConfirmOverride}
            description={`${t("readiness.overrideHint")} ${step.approvedScore} → ${overrideScore}`}
            destructive
            onConfirm={() => {
              if (run({ type: "score.override", roadmapId: roadmap.id, stepNo, score: overrideScore, reason: overrideReason }, t("audit.score.override"))) setOverrideReason("");
            }}
          />
        </details>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold text-navy-900">{t("readiness.history")}</h3>
        <ProposalHistory roadmap={roadmap} stepNo={stepNo} />
      </section>
    </div>
  );
}
