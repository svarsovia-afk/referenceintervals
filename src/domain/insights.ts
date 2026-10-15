/**
 * Derived information for dashboards and task lists: next action, outstanding
 * work, step ownership and estimates. Pure functions over the app state.
 */
import { canApproveProposal, canReviewProposal } from "./permissions";
import { currentStepNo, isStepApplicable } from "./progress";
import type { AppState, Roadmap, ScoreProposal, Task } from "./types";

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 } as const;

export function isOpenTask(t: Task): boolean {
  return t.status !== "done" && t.status !== "cancelled";
}

export function isOverdue(t: Task, today: string): boolean {
  return isOpenTask(t) && !!t.plannedEnd && t.plannedEnd < today;
}

/** Orders tasks so the next actionable work comes first. */
export function compareActionable(today: string) {
  return (a: Task, b: Task): number => {
    const blockedA = a.status === "blocked" ? 1 : 0;
    const blockedB = b.status === "blocked" ? 1 : 0;
    const overdueA = isOverdue(a, today) ? 0 : 1;
    const overdueB = isOverdue(b, today) ? 0 : 1;
    if (overdueA !== overdueB) return overdueA - overdueB;
    if (blockedA !== blockedB) return blockedA - blockedB;
    const stepA = a.stepNo ?? 99;
    const stepB = b.stepNo ?? 99;
    if (stepA !== stepB) return stepA - stepB;
    if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    return (a.plannedEnd ?? "9999").localeCompare(b.plannedEnd ?? "9999");
  };
}

/** Open tasks of applicable steps (and the active implementation phase), next-actionable first. */
export function outstandingTasks(state: AppState, roadmap: Roadmap, today: string): Task[] {
  const applicable = new Set(roadmap.steps.filter(isStepApplicable).map((s) => s.stepNo));
  return state.tasks
    .filter((t) => t.roadmapId === roadmap.id && isOpenTask(t))
    .filter((t) => (t.stepNo === null ? roadmap.implementationActive : applicable.has(t.stepNo)))
    .sort(compareActionable(today));
}

export type NextAction =
  | { kind: "review"; proposal: ScoreProposal }
  | { kind: "approve"; proposal: ScoreProposal }
  | { kind: "task"; task: Task }
  | null;

export function nextAction(state: AppState, roadmap: Roadmap, userId: string, today: string): NextAction {
  const user = state.stakeholders.find((s) => s.id === userId);
  const open = state.scoreProposals.filter((p) => p.roadmapId === roadmap.id && (p.status === "proposed" || p.status === "reviewed"));
  const toApprove = open.find((p) => canApproveProposal(user, p, state.settings).allowed);
  if (toApprove) return { kind: "approve", proposal: toApprove };
  const toReview = open.find((p) => canReviewProposal(user, p, state.settings).allowed);
  if (toReview) return { kind: "review", proposal: toReview };

  const current = currentStepNo(roadmap);
  const tasks = outstandingTasks(state, roadmap, today);
  const mine = tasks.filter((t) => t.ownerId === userId || t.collaboratorIds.includes(userId));
  const pick =
    mine.find((t) => t.stepNo === current && t.status !== "blocked") ??
    mine.find((t) => t.status !== "blocked") ??
    tasks.find((t) => t.stepNo === current && t.status !== "blocked") ??
    tasks[0];
  return pick ? { kind: "task", task: pick } : null;
}

/** Explicit step owner, otherwise the most frequent task owner in the step. */
export function stepOwnerId(state: AppState, roadmap: Roadmap, stepNo: number): string | undefined {
  const explicit = roadmap.steps.find((s) => s.stepNo === stepNo)?.ownerId;
  if (explicit) return explicit;
  const counts = new Map<string, number>();
  for (const t of state.tasks) {
    if (t.roadmapId === roadmap.id && t.stepNo === stepNo && t.ownerId && t.status !== "cancelled") {
      counts.set(t.ownerId, (counts.get(t.ownerId) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Typical step duration: tasks may run in parallel, so the longest task estimate. */
export function stepEstimateDays(state: AppState, roadmapId: string, stepNo: number | null): number | undefined {
  const est = state.tasks
    .filter((t) => t.roadmapId === roadmapId && t.stepNo === stepNo && t.status !== "cancelled" && typeof t.estimatedDays === "number")
    .map((t) => t.estimatedDays as number);
  return est.length ? Math.max(...est) : undefined;
}
