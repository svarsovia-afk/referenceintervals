/**
 * The single entry point for state changes. Every action is validated against
 * permissions and workflow rules, applied immutably, and appended to the audit log.
 * There is deliberately no action that edits or deletes audit entries.
 *
 * A production backend should run the same logic server-side.
 */
import { implementationGate, validateApprovalUpdate } from "./approvals";
import { applyOptionalDecision, applyPathwayToSteps, validateOptionalDecision, validatePathway } from "./branching";
import { evaluateDurationInput, selectBenchmark, type DurationInput } from "./durations";
import { createRoadmap, type NewRoadmapInput } from "./factory";
import { makeId } from "./ids";
import { selectionNeedsExplanation, weightedTotals } from "./matrix";
import { canApproveProposal, canEditRoles, canEditStakeholder, canEditTask, canReviewProposal, hasPermission, hasStepPermission, isAdmin } from "./permissions";
import { allowedScores, missingPrerequisites, validateProposal } from "./readiness";
import { getTemplate } from "./stepTemplates";
import type {
  ApprovalKey,
  ApprovalStatus,
  AppState,
  AuditEntry,
  CurativeHandover,
  Deliberation,
  DocumentMeta,
  LocalizedText,
  OptionalDecision,
  Pathway,
  PreventionOption,
  ProcurementInfo,
  Roadmap,
  Settings,
  Stakeholder,
  StepState,
  Task,
  WeightedMatrix,
} from "./types";

export type Action =
  | { type: "roadmap.create"; input: NewRoadmapInput }
  | { type: "roadmap.update"; roadmapId: string; patch: Partial<Pick<Roadmap, "disease" | "targetPopulation" | "geographicScope" | "ownerId">> }
  | { type: "option.add"; roadmapId: string; option: PreventionOption }
  | { type: "option.update"; roadmapId: string; option: PreventionOption }
  | { type: "option.remove"; roadmapId: string; optionId: string }
  | { type: "step.update"; roadmapId: string; stepNo: number; patch: Partial<Pick<StepState, "ownerId" | "summary" | "uncertainties" | "sources" | "customDescription" | "optionAssessments">> }
  | { type: "procurement.update"; roadmapId: string; patch: Partial<ProcurementInfo> }
  | { type: "pathway.set"; roadmapId: string; pathway: Pathway; preferredOptionIds?: string[]; handover?: CurativeHandover; changeReason?: string }
  | { type: "step.optionalDecision"; roadmapId: string; stepNo: number; decision: OptionalDecision; reason: string }
  | { type: "matrix.update"; roadmapId: string; matrix: WeightedMatrix }
  | { type: "deliberation.update"; roadmapId: string; stepNo: number; deliberation: Deliberation }
  | { type: "finalSelection.record"; roadmapId: string; optionId: string; rationale: LocalizedText; deviationReason: string; uncertainties: LocalizedText; nextSteps: LocalizedText }
  | { type: "approval.update"; roadmapId: string; key: ApprovalKey; status: ApprovalStatus; note: string; date?: string; value?: string }
  | { type: "implementation.activate"; roadmapId: string }
  | { type: "score.propose"; roadmapId: string; stepNo: number; score: number; note: string }
  | { type: "score.review"; proposalId: string; decision: "reviewed" | "returned"; note: string }
  | { type: "score.approve"; proposalId: string; decision: "approved" | "returned"; note: string }
  | { type: "score.override"; roadmapId: string; stepNo: number; score: number; reason: string }
  | { type: "task.create"; task: Task }
  | { type: "task.update"; taskId: string; patch: Partial<Omit<Task, "id" | "roadmapId">> }
  | { type: "duration.submit"; taskId: string; input: DurationInput }
  | { type: "duration.review"; recordId: string; decision: "accepted" | "returned"; note: string }
  | { type: "document.add"; doc: DocumentMeta }
  | { type: "document.replace"; oldId: string; doc: DocumentMeta }
  | { type: "document.delete"; documentId: string }
  | { type: "stakeholder.create"; stakeholder: Stakeholder }
  | { type: "stakeholder.update"; stakeholderId: string; patch: Partial<Omit<Stakeholder, "id">> }
  | { type: "settings.update"; settings: Settings };

/** Error codes map to i18n keys under `errors.*` (or `prerequisites.*` for listed items). */
export interface ActionError {
  code: string;
  details?: string[];
}

export type ActionResult = { ok: true; state: AppState; createdId?: string } | { ok: false; error: ActionError };

const fail = (code: string, details?: string[]): ActionResult => ({ ok: false, error: { code, details } });

function clip(text: string | undefined, max = 140): string | undefined {
  if (text === undefined) return undefined;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Collects all document ids in a version chain (both directions). */
export function versionChain(documents: DocumentMeta[], id: string): string[] {
  const ids = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const cur = queue.pop()!;
    if (ids.has(cur)) continue;
    ids.add(cur);
    const doc = documents.find((d) => d.id === cur);
    if (doc?.replacesId) queue.push(doc.replacesId);
    if (doc?.supersededById) queue.push(doc.supersededById);
  }
  return [...ids];
}

export function applyAction(state: AppState, action: Action, actorId: string, nowIso: string = new Date().toISOString()): ActionResult {
  const s: AppState = structuredClone(state);
  const actor = s.stakeholders.find((x) => x.id === actorId);
  if (!actor) return fail("permission");
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(actor, p, s.settings);
  const today = nowIso.slice(0, 10);

  const log = (entry: Omit<AuditEntry, "id" | "at" | "actorId">) => {
    s.audit.push({ id: makeId("audit"), at: nowIso, actorId, ...entry, previous: clip(entry.previous), next: clip(entry.next), reason: clip(entry.reason, 500) });
  };
  const roadmapById = (id: string) => s.roadmaps.find((r) => r.id === id);
  const stepOf = (r: Roadmap, n: number) => r.steps.find((x) => x.stepNo === n);
  const stepLabel = (r: Roadmap, n: number) => `${r.disease.nl} · stap ${n}`;
  const ownsStepWork = (roadmapId: string, stepNo: number | null) =>
    s.tasks.some((t) => t.roadmapId === roadmapId && t.stepNo === stepNo && (t.ownerId === actorId || t.collaboratorIds.includes(actorId)));
  const done = (createdId?: string): ActionResult => ({ ok: true, state: s, createdId });

  switch (action.type) {
    case "roadmap.create": {
      if (!can("roadmap.create")) return fail("permission");
      const { disease, targetPopulation } = action.input;
      if (!disease.nl.trim() || !disease.en.trim()) return fail("diseaseRequired");
      if (!targetPopulation.nl.trim() || !targetPopulation.en.trim()) return fail("populationRequired");
      const { roadmap, tasks } = createRoadmap(action.input, nowIso);
      s.roadmaps.push(roadmap);
      s.tasks.push(...tasks);
      log({ action: "roadmap.created", objectType: "roadmap", objectId: roadmap.id, objectLabel: `${disease.nl} — ${targetPopulation.nl}`, roadmapId: roadmap.id });
      return done(roadmap.id);
    }

    case "roadmap.update": {
      const r = roadmapById(action.roadmapId);
      if (!r) return fail("generic");
      if (!can("roadmap.edit")) return fail("permission");
      const prev = JSON.stringify({ disease: r.disease, targetPopulation: r.targetPopulation, ownerId: r.ownerId });
      Object.assign(r, action.patch);
      log({ action: "roadmap.updated", objectType: "roadmap", objectId: r.id, objectLabel: r.disease.nl, roadmapId: r.id, previous: prev, next: JSON.stringify(action.patch) });
      return done();
    }

    case "option.add":
    case "option.update":
    case "option.remove": {
      const r = roadmapById(action.roadmapId);
      if (!r) return fail("generic");
      if (!can("roadmap.edit") && !ownsStepWork(r.id, 1)) return fail("permission");
      if (action.type === "option.add") {
        if (!action.option.name.nl.trim() && !action.option.name.en.trim()) return fail("nameRequired");
        r.options.push(action.option);
        log({ action: "option.added", objectType: "option", objectId: action.option.id, objectLabel: action.option.name.nl || action.option.name.en, roadmapId: r.id });
      } else if (action.type === "option.update") {
        const idx = r.options.findIndex((o) => o.id === action.option.id);
        if (idx < 0) return fail("generic");
        const prev = r.options[idx];
        r.options[idx] = action.option;
        log({ action: "option.updated", objectType: "option", objectId: action.option.id, objectLabel: action.option.name.nl, roadmapId: r.id, previous: prev.name.nl, next: action.option.name.nl });
      } else {
        const opt = r.options.find((o) => o.id === action.optionId);
        if (!opt) return fail("generic");
        r.options = r.options.filter((o) => o.id !== action.optionId);
        delete r.matrix.scores[action.optionId];
        r.preferredOptionIds = r.preferredOptionIds.filter((id) => id !== action.optionId);
        r.steps.forEach((st) => {
          if (st.optionAssessments) st.optionAssessments = st.optionAssessments.filter((a) => a.optionId !== action.optionId);
        });
        log({ action: "option.removed", objectType: "option", objectId: opt.id, objectLabel: opt.name.nl, roadmapId: r.id });
      }
      return done();
    }

    case "step.update": {
      const r = roadmapById(action.roadmapId);
      const st = r && stepOf(r, action.stepNo);
      if (!r || !st) return fail("generic");
      if (!can("roadmap.edit") && !ownsStepWork(r.id, action.stepNo)) return fail("permission");
      if (action.patch.ownerId !== undefined && action.patch.ownerId !== st.ownerId) {
        if (!can("task.assign")) return fail("permission");
        log({ action: "task.assigned", objectType: "step", objectId: `${r.id}:${st.stepNo}`, objectLabel: stepLabel(r, st.stepNo), roadmapId: r.id, previous: st.ownerId ?? "-", next: action.patch.ownerId || "-" });
      }
      const keys = Object.keys(action.patch).filter((k) => k !== "ownerId");
      Object.assign(st, action.patch);
      log({ action: "step.updated", objectType: "step", objectId: `${r.id}:${st.stepNo}`, objectLabel: stepLabel(r, st.stepNo), roadmapId: r.id, next: keys.join(", ") });
      return done();
    }

    case "procurement.update": {
      const r = roadmapById(action.roadmapId);
      if (!r) return fail("generic");
      if (!can("roadmap.edit") && !ownsStepWork(r.id, 4)) return fail("permission");
      Object.assign(r.procurement, action.patch);
      log({ action: "step.updated", objectType: "step", objectId: `${r.id}:4`, objectLabel: stepLabel(r, 4), roadmapId: r.id, next: Object.keys(action.patch).join(", ") });
      return done();
    }

    case "pathway.set": {
      const r = roadmapById(action.roadmapId);
      if (!r) return fail("generic");
      if (!can("pathway.decide")) return fail("permission");
      if (action.pathway !== "undecided") {
        const err = validatePathway(r, action.pathway, action);
        if (err) return fail(err);
      } else if (r.pathway !== "undecided" && !action.changeReason?.trim()) {
        return fail("changeReasonRequired");
      }
      const prev = r.pathway;
      const prevPreferred = r.preferredOptionIds.join(",");
      r.pathway = action.pathway;
      if (action.pathway === "publicHealth") {
        r.preferredOptionIds = (action.preferredOptionIds ?? []).filter((id) => r.options.some((o) => o.id === id));
        r.curativeHandover = undefined;
      } else if (action.pathway === "curative") {
        r.curativeHandover = action.handover;
        r.preferredOptionIds = [];
      } else {
        r.preferredOptionIds = [];
      }
      r.steps = applyPathwayToSteps(r.steps, action.pathway, action.handover?.naReason ?? "");
      if (prev !== action.pathway) {
        log({ action: "pathway.changed", objectType: "roadmap", objectId: r.id, objectLabel: r.disease.nl, roadmapId: r.id, previous: prev, next: action.pathway, reason: action.changeReason || action.handover?.naReason });
      }
      if (action.pathway === "curative") {
        log({ action: "handover.updated", objectType: "roadmap", objectId: r.id, objectLabel: r.disease.nl, roadmapId: r.id, next: action.handover?.records.map((h) => h.recipient).join(", "), reason: action.handover?.naReason });
        log({ action: "step.markedNotApplicable", objectType: "step", objectId: `${r.id}:4-9`, objectLabel: stepLabel(r, 4) + "–9", roadmapId: r.id, reason: action.handover?.naReason });
      }
      if (prevPreferred !== r.preferredOptionIds.join(",")) {
        log({ action: "preferredOptions.changed", objectType: "roadmap", objectId: r.id, objectLabel: r.disease.nl, roadmapId: r.id, previous: prevPreferred, next: r.preferredOptionIds.join(",") });
      }
      return done();
    }

    case "step.optionalDecision": {
      const r = roadmapById(action.roadmapId);
      const st = r && stepOf(r, action.stepNo);
      if (!r || !st) return fail("generic");
      if (!can("roadmap.edit") && !ownsStepWork(r.id, action.stepNo)) return fail("permission");
      const err = validateOptionalDecision(r, action.stepNo, action.decision, action.reason);
      if (err) return fail(err);
      const prev = st.optionalDecision ?? "undecided";
      Object.assign(st, applyOptionalDecision(st, action.decision, action.reason));
      log({ action: "step.optionalDecision", objectType: "step", objectId: `${r.id}:${st.stepNo}`, objectLabel: stepLabel(r, st.stepNo), roadmapId: r.id, previous: prev, next: action.decision, reason: action.reason });
      return done();
    }

    case "matrix.update": {
      const r = roadmapById(action.roadmapId);
      if (!r) return fail("generic");
      if (!hasStepPermission(actor, "deliberation.edit", 3, s.settings) && !can("roadmap.edit")) return fail("permission");
      const prev = JSON.stringify(weightedTotals(r.matrix, r.options.map((o) => o.id)).map((t) => [t.optionId, t.weightedScore?.toFixed(2)]));
      r.matrix = action.matrix;
      const next = JSON.stringify(weightedTotals(r.matrix, r.options.map((o) => o.id)).map((t) => [t.optionId, t.weightedScore?.toFixed(2)]));
      log({ action: "matrix.updated", objectType: "matrix", objectId: r.id, objectLabel: r.disease.nl, roadmapId: r.id, previous: prev, next });
      return done();
    }

    case "deliberation.update": {
      const r = roadmapById(action.roadmapId);
      const st = r && stepOf(r, action.stepNo);
      if (!r || !st || getTemplate(action.stepNo).kind !== "deliberation") return fail("generic");
      if (!hasStepPermission(actor, "deliberation.edit", action.stepNo, s.settings)) return fail("permission");
      const prev = st.deliberation;
      st.deliberation = action.deliberation;
      log({
        action: "deliberation.updated",
        objectType: "deliberation",
        objectId: `${r.id}:${st.stepNo}`,
        objectLabel: stepLabel(r, st.stepNo),
        roadmapId: r.id,
        previous: prev ? `${prev.date ?? "-"} · held=${prev.held} · n=${prev.participantIds.length}` : undefined,
        next: `${action.deliberation.date ?? "-"} · held=${action.deliberation.held} · n=${action.deliberation.participantIds.length}`,
      });
      return done();
    }

    case "finalSelection.record": {
      const r = roadmapById(action.roadmapId);
      if (!r) return fail("generic");
      if (!hasStepPermission(actor, "deliberation.edit", 8, s.settings) || !can("pathway.decide")) return fail("permission");
      if (r.pathway !== "publicHealth") return fail("pathwayCurative");
      if (!r.options.some((o) => o.id === action.optionId)) return fail("selectionRequired");
      const totals = weightedTotals(r.matrix, r.options.map((o) => o.id));
      if (selectionNeedsExplanation(totals, action.optionId) && !action.deviationReason.trim()) return fail("deviationRequired");
      const prev = r.finalSelection?.optionId;
      r.finalSelection = {
        optionId: action.optionId,
        rationale: action.rationale,
        deviationReason: action.deviationReason,
        uncertainties: action.uncertainties,
        nextSteps: action.nextSteps,
        confirmedBy: actorId,
        confirmedAt: nowIso,
      };
      log({ action: "finalSelection.recorded", objectType: "roadmap", objectId: r.id, objectLabel: r.disease.nl, roadmapId: r.id, previous: prev, next: action.optionId, reason: action.deviationReason || undefined });
      return done();
    }

    case "approval.update": {
      const r = roadmapById(action.roadmapId);
      if (!r) return fail("generic");
      if (!can("approval.record")) return fail("permission");
      if (r.pathway === "curative") return fail("pathwayCurative");
      const err = validateApprovalUpdate(action.key, action.status, action.note, action.value);
      if (err) return fail(err);
      const item = r.approvals.find((a) => a.key === action.key);
      const prev = item ? `${item.status}${item.value ? ` (${item.value})` : ""}` : "notStarted";
      const nextItem = { key: action.key, status: action.status, note: action.note, date: action.date, value: action.value };
      if (item) Object.assign(item, nextItem);
      else r.approvals.push(nextItem);
      log({ action: "approval.updated", objectType: "approval", objectId: `${r.id}:${action.key}`, objectLabel: action.key, roadmapId: r.id, previous: prev, next: `${action.status}${action.value ? ` (${action.value})` : ""}`, reason: action.note || undefined });
      return done();
    }

    case "implementation.activate": {
      const r = roadmapById(action.roadmapId);
      if (!r) return fail("generic");
      if (!can("implementation.activate")) return fail("permission");
      const gate = implementationGate(r, s.settings);
      if (!gate.canActivate) return fail("gateNotMet", gate.missing);
      if (r.implementationActive) return fail("state");
      r.implementationActive = true;
      r.implementationActivatedAt = nowIso;
      log({ action: "implementation.activated", objectType: "roadmap", objectId: r.id, objectLabel: r.disease.nl, roadmapId: r.id, previous: "inactive", next: "active" });
      return done();
    }

    case "score.propose": {
      const r = roadmapById(action.roadmapId);
      if (!r) return fail("generic");
      if (!can("score.propose")) return fail("permission");
      const leadLike = can("task.editAny");
      if (!leadLike && !ownsStepWork(r.id, action.stepNo)) return fail("permission");
      const err = validateProposal(r, s.scoreProposals, action.stepNo, action.score);
      if (err) return fail(err);
      const st = stepOf(r, action.stepNo)!;
      const id = makeId("score");
      s.scoreProposals.push({
        id,
        roadmapId: r.id,
        stepNo: action.stepNo,
        previousScore: st.approvedScore,
        proposedScore: action.score,
        note: action.note,
        proposedBy: actorId,
        proposedAt: nowIso,
        status: "proposed",
      });
      log({ action: "score.proposed", objectType: "score", objectId: id, objectLabel: stepLabel(r, action.stepNo), roadmapId: r.id, previous: String(st.approvedScore), next: String(action.score), reason: action.note || undefined });
      return done(id);
    }

    case "score.review": {
      const p = s.scoreProposals.find((x) => x.id === action.proposalId);
      if (!p) return fail("generic");
      const check = canReviewProposal(actor, p, s.settings);
      if (!check.allowed) return fail(check.reason);
      if (action.decision === "returned" && !action.note.trim()) return fail("reasonRequired");
      p.status = action.decision;
      p.reviewedBy = actorId;
      p.reviewedAt = nowIso;
      p.reviewNote = action.note;
      const r = roadmapById(p.roadmapId)!;
      log({ action: action.decision === "reviewed" ? "score.reviewed" : "score.returned", objectType: "score", objectId: p.id, objectLabel: stepLabel(r, p.stepNo), roadmapId: r.id, previous: "proposed", next: action.decision, reason: action.note || undefined });
      return done();
    }

    case "score.approve": {
      const p = s.scoreProposals.find((x) => x.id === action.proposalId);
      if (!p) return fail("generic");
      const check = canApproveProposal(actor, p, s.settings);
      if (!check.allowed) return fail(check.reason);
      const r = roadmapById(p.roadmapId)!;
      const st = stepOf(r, p.stepNo)!;
      if (action.decision === "returned") {
        if (!action.note.trim()) return fail("reasonRequired");
        p.status = "returned";
        p.approvalNote = action.note;
        p.approvedBy = actorId;
        p.approvedAt = nowIso;
        log({ action: "score.returned", objectType: "score", objectId: p.id, objectLabel: stepLabel(r, p.stepNo), roadmapId: r.id, previous: "reviewed", next: "returned", reason: action.note });
        return done();
      }
      if (st.notApplicable) return fail("notApplicable");
      const missing = missingPrerequisites(r, s.documents, p.stepNo, p.proposedScore, today);
      if (missing.length > 0) return fail("prerequisites", missing);
      const prev = st.approvedScore;
      p.previousScore = prev;
      p.status = "approved";
      p.approvedBy = actorId;
      p.approvedAt = nowIso;
      p.approvalNote = action.note;
      st.approvedScore = p.proposedScore;
      log({ action: "score.approved", objectType: "score", objectId: p.id, objectLabel: stepLabel(r, p.stepNo), roadmapId: r.id, previous: String(prev), next: String(p.proposedScore), reason: action.note || undefined });
      return done();
    }

    case "score.override": {
      const r = roadmapById(action.roadmapId);
      const st = r && stepOf(r, action.stepNo);
      if (!r || !st) return fail("generic");
      if (!isAdmin(actor) || !can("score.override")) return fail("permission");
      if (!action.reason.trim()) return fail("reasonRequired");
      if (!allowedScores(action.stepNo).includes(action.score)) return fail("outOfRange");
      if (st.notApplicable) return fail("notApplicable");
      for (const open of s.scoreProposals.filter((p) => p.roadmapId === r.id && p.stepNo === action.stepNo && (p.status === "proposed" || p.status === "reviewed"))) {
        open.status = "returned";
        open.approvalNote = `Override: ${action.reason}`;
        open.approvedBy = actorId;
        open.approvedAt = nowIso;
      }
      const id = makeId("score");
      s.scoreProposals.push({
        id,
        roadmapId: r.id,
        stepNo: action.stepNo,
        previousScore: st.approvedScore,
        proposedScore: action.score,
        note: action.reason,
        proposedBy: actorId,
        proposedAt: nowIso,
        status: "approved",
        approvedBy: actorId,
        approvedAt: nowIso,
        overrideReason: action.reason,
      });
      const prev = st.approvedScore;
      st.approvedScore = action.score;
      log({ action: "score.override", objectType: "score", objectId: id, objectLabel: stepLabel(r, action.stepNo), roadmapId: r.id, previous: String(prev), next: String(action.score), reason: action.reason });
      return done(id);
    }

    case "task.create": {
      if (!can("task.create")) return fail("permission");
      if (!action.task.title.nl.trim() && !action.task.title.en.trim()) return fail("titleRequired");
      if (!roadmapById(action.task.roadmapId)) return fail("generic");
      s.tasks.push(action.task);
      log({ action: "task.created", objectType: "task", objectId: action.task.id, objectLabel: action.task.title.nl || action.task.title.en, roadmapId: action.task.roadmapId, next: action.task.ownerId });
      return done(action.task.id);
    }

    case "task.update": {
      const t = s.tasks.find((x) => x.id === action.taskId);
      if (!t) return fail("generic");
      if (!canEditTask(actor, t, s.settings)) return fail("permission");
      const patch = action.patch;
      if (patch.title && !patch.title.nl.trim() && !patch.title.en.trim()) return fail("titleRequired");
      const label = t.title.nl || t.title.en;
      const base = { objectType: "task", objectId: t.id, objectLabel: label, roadmapId: t.roadmapId };
      if (patch.ownerId !== undefined && patch.ownerId !== t.ownerId) {
        if (!can("task.assign")) return fail("permission");
        log({ action: "task.assigned", ...base, previous: t.ownerId ?? "-", next: patch.ownerId || "-" });
      }
      if (patch.status !== undefined && patch.status !== t.status) {
        if (patch.status === "blocked" && !(patch.blocker ?? t.blocker).trim()) return fail("reasonRequired");
        log({ action: "task.statusChanged", ...base, previous: t.status, next: patch.status, reason: patch.status === "blocked" ? patch.blocker ?? t.blocker : undefined });
        if (patch.status === "cancelled") {
          s.durationRecords.filter((d) => d.taskId === t.id && d.status !== "accepted").forEach((d) => (d.status = "cancelled"));
        }
      }
      if (patch.estimatedDays !== undefined && patch.estimatedDays !== t.estimatedDays) {
        log({ action: "task.estimateChanged", ...base, previous: String(t.estimatedDays ?? "-"), next: String(patch.estimatedDays ?? "-") });
      }
      const otherKeys = Object.keys(patch).filter((k) => !["ownerId", "status", "estimatedDays"].includes(k) && JSON.stringify((patch as Record<string, unknown>)[k]) !== JSON.stringify((t as unknown as Record<string, unknown>)[k]));
      Object.assign(t, patch);
      if (otherKeys.length) log({ action: "task.updated", ...base, next: otherKeys.join(", ") });
      return done();
    }

    case "duration.submit": {
      const t = s.tasks.find((x) => x.id === action.taskId);
      if (!t) return fail("generic");
      if (!can("duration.record") || !canEditTask(actor, t, s.settings)) return fail("permission");
      if (s.durationRecords.some((d) => d.taskId === t.id && d.status === "submitted")) return fail("state");
      const stakeholderId = t.ownerId ?? actorId;
      const benchmark = selectBenchmark(s.durationRecords, t.templateKey, stakeholderId, s.settings);
      const evaluation = evaluateDurationInput(action.input, benchmark, s.settings);
      if (evaluation.error) return fail(evaluation.error);
      const id = makeId("duration");
      s.durationRecords.push({
        id,
        taskId: t.id,
        roadmapId: t.roadmapId,
        stepNo: t.stepNo,
        templateKey: t.templateKey,
        stakeholderId,
        estimatedDays: t.estimatedDays,
        actualDays: evaluation.days!,
        method: action.input.method,
        startDate: action.input.method === "dates" ? action.input.startDate : undefined,
        endDate: action.input.method === "dates" ? action.input.endDate : undefined,
        recordedBy: actorId,
        recordedAt: nowIso,
        benchmark,
        reason: action.input.reason?.trim() || undefined,
        status: "submitted",
        isSample: false,
      });
      const prevStatus = t.status;
      t.status = "done";
      if (action.input.method === "dates") {
        t.actualStart = action.input.startDate;
        t.actualEnd = action.input.endDate;
      }
      if (prevStatus !== "done") {
        log({ action: "task.statusChanged", objectType: "task", objectId: t.id, objectLabel: t.title.nl, roadmapId: t.roadmapId, previous: prevStatus, next: "done" });
      }
      log({ action: "duration.submitted", objectType: "duration", objectId: id, objectLabel: t.title.nl, roadmapId: t.roadmapId, previous: t.estimatedDays !== undefined ? `est ${t.estimatedDays}` : undefined, next: `${evaluation.days} d (${action.input.method})`, reason: action.input.reason?.trim() || undefined });
      return done(id);
    }

    case "duration.review": {
      const d = s.durationRecords.find((x) => x.id === action.recordId);
      if (!d) return fail("generic");
      if (!can("duration.review")) return fail("permission");
      if (d.status !== "submitted") return fail("state");
      if (s.settings.separationOfDuties && (d.stakeholderId === actorId || d.recordedBy === actorId)) return fail("separation");
      if (action.decision === "returned" && !action.note.trim()) return fail("reasonRequired");
      d.status = action.decision;
      d.reviewedBy = actorId;
      d.reviewedAt = nowIso;
      d.reviewNote = action.note;
      if (action.decision === "returned" && d.taskId) {
        const t = s.tasks.find((x) => x.id === d.taskId);
        if (t && t.status === "done") t.status = "inProgress";
      }
      const label = s.tasks.find((x) => x.id === d.taskId)?.title.nl ?? d.templateKey;
      log({ action: action.decision === "accepted" ? "duration.accepted" : "duration.returned", objectType: "duration", objectId: d.id, objectLabel: label, roadmapId: d.roadmapId, previous: "submitted", next: action.decision, reason: action.note || undefined });
      return done();
    }

    case "document.add": {
      if (!can("document.upload")) return fail("permission");
      if (!action.doc.title.trim()) return fail("titleRequired");
      if (!roadmapById(action.doc.roadmapId)) return fail("generic");
      s.documents.push(action.doc);
      log({ action: "document.uploaded", objectType: "document", objectId: action.doc.id, objectLabel: action.doc.title, roadmapId: action.doc.roadmapId, next: `${action.doc.fileName} · ${action.doc.category} · stap ${action.doc.stepNo ?? "impl"}` });
      return done(action.doc.id);
    }

    case "document.replace": {
      if (!can("document.upload")) return fail("permission");
      const old = s.documents.find((d) => d.id === action.oldId);
      if (!old || old.supersededById) return fail("state");
      const doc: DocumentMeta = { ...action.doc, replacesId: old.id, version: old.version + 1 };
      old.supersededById = doc.id;
      s.documents.push(doc);
      log({ action: "document.replaced", objectType: "document", objectId: doc.id, objectLabel: doc.title, roadmapId: doc.roadmapId, previous: `v${old.version} ${old.fileName}`, next: `v${doc.version} ${doc.fileName}` });
      return done(doc.id);
    }

    case "document.delete": {
      if (!can("document.delete")) return fail("permission");
      const doc = s.documents.find((d) => d.id === action.documentId);
      if (!doc) return fail("generic");
      const chain = versionChain(s.documents, doc.id);
      s.documents = s.documents.filter((d) => !chain.includes(d.id));
      log({ action: "document.deleted", objectType: "document", objectId: doc.id, objectLabel: doc.title, roadmapId: doc.roadmapId, previous: `${chain.length} version(s) · ${doc.fileName}` });
      return done();
    }

    case "stakeholder.create": {
      if (!can("stakeholder.editAny")) return fail("permission");
      const sh = action.stakeholder;
      if (!sh.fullName.trim()) return fail("nameRequired");
      if (sh.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sh.email)) return fail("emailInvalid");
      if (sh.isPrimaryContact) s.stakeholders.forEach((x) => (x.isPrimaryContact = false));
      s.stakeholders.push(sh);
      log({ action: "stakeholder.created", objectType: "stakeholder", objectId: sh.id, objectLabel: sh.fullName, next: `${sh.position} · ${sh.roles.join("/")}` });
      return done(sh.id);
    }

    case "stakeholder.update": {
      const target = s.stakeholders.find((x) => x.id === action.stakeholderId);
      if (!target) return fail("generic");
      if (!canEditStakeholder(actor, target, s.settings)) return fail("permission");
      const patch = { ...action.patch };
      // Roles are administrator-only; the lead may also configure primary/CC contacts.
      if (patch.roles && JSON.stringify(patch.roles) !== JSON.stringify(target.roles) && !canEditRoles(actor, s.settings)) return fail("permission");
      const contactFlagsChanged =
        (patch.isPrimaryContact !== undefined && patch.isPrimaryContact !== target.isPrimaryContact) ||
        (patch.ccOnCommunications !== undefined && patch.ccOnCommunications !== target.ccOnCommunications);
      if (contactFlagsChanged && !canEditRoles(actor, s.settings) && !can("roadmap.edit")) return fail("permission");
      if (patch.fullName !== undefined && !patch.fullName.trim()) return fail("nameRequired");
      if (patch.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.email)) return fail("emailInvalid");
      const changed = Object.keys(patch).filter((k) => JSON.stringify((patch as Record<string, unknown>)[k]) !== JSON.stringify((target as unknown as Record<string, unknown>)[k]));
      if (changed.length === 0) return done();
      const prev = changed.map((k) => `${k}=${JSON.stringify((target as unknown as Record<string, unknown>)[k])}`).join("; ");
      if (patch.isPrimaryContact) s.stakeholders.forEach((x) => (x.isPrimaryContact = false));
      Object.assign(target, patch);
      const next = changed.map((k) => `${k}=${JSON.stringify((target as unknown as Record<string, unknown>)[k])}`).join("; ");
      log({ action: "stakeholder.updated", objectType: "stakeholder", objectId: target.id, objectLabel: target.fullName, previous: prev, next });
      return done();
    }

    case "settings.update": {
      if (!can("settings.manage")) return fail("permission");
      const st = action.settings;
      if (!(st.outlierLower > 0 && st.outlierLower < 1 && st.outlierUpper > 1)) return fail("outOfRange");
      // Keep at least one administrator able to manage settings.
      if (!st.rolePermissions.admin.includes("settings.manage")) return fail("permission");
      const prev = s.settings;
      s.settings = st;
      const changed = (Object.keys(st) as (keyof Settings)[]).filter((k) => JSON.stringify(st[k]) !== JSON.stringify(prev[k]));
      log({ action: "settings.updated", objectType: "settings", objectId: "settings", objectLabel: "settings", previous: changed.map((k) => `${k}=${JSON.stringify(prev[k])}`).join("; "), next: changed.map((k) => `${k}=${JSON.stringify(st[k])}`).join("; ") });
      return done();
    }
  }
}

