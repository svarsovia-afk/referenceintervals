/**
 * Progress and step-status calculations.
 *
 * Overall progress = mean over APPLICABLE steps of (approved score / step max score).
 *  - Only approved readiness scores count (proposals and reviews do not).
 *  - Steps formally marked not applicable (with a reason) are excluded, including
 *    the optional Step 6 when it has been skipped and the public-health steps
 *    when the curative route was chosen.
 *  - Reaching 100 % does NOT mean the strategy is approved; approval is tracked
 *    separately in the Step 9 checklist (see approvals.ts).
 */
import { getTemplate, STEP_TEMPLATES } from "./stepTemplates";
import type { Roadmap, ScoreProposal, StepState, Task } from "./types";

export function isStepApplicable(step: StepState): boolean {
  return !step.notApplicable;
}

export interface ProgressBreakdownRow {
  stepNo: number;
  approvedScore: number;
  maxScore: number;
  applicable: boolean;
  fraction: number;
}

export interface ProgressResult {
  /** 0–1 */
  fraction: number;
  percent: number;
  applicableCount: number;
  breakdown: ProgressBreakdownRow[];
}

export function computeProgress(roadmap: Roadmap): ProgressResult {
  const breakdown: ProgressBreakdownRow[] = roadmap.steps.map((s) => {
    const max = getTemplate(s.stepNo).maxScore;
    const applicable = isStepApplicable(s);
    const score = Math.max(0, Math.min(max, s.approvedScore));
    return { stepNo: s.stepNo, approvedScore: score, maxScore: max, applicable, fraction: applicable ? score / max : 0 };
  });
  const applicable = breakdown.filter((b) => b.applicable);
  const fraction = applicable.length === 0 ? 0 : applicable.reduce((sum, b) => sum + b.fraction, 0) / applicable.length;
  return { fraction, percent: Math.round(fraction * 100), applicableCount: applicable.length, breakdown };
}

export function isStepComplete(step: StepState): boolean {
  return step.approvedScore >= getTemplate(step.stepNo).maxScore;
}

/** The current step is the first applicable step that has not reached its maximum approved score. */
export function currentStepNo(roadmap: Roadmap): number | null {
  const step = [...roadmap.steps].sort((a, b) => a.stepNo - b.stepNo).find((s) => isStepApplicable(s) && !isStepComplete(s));
  return step ? step.stepNo : null;
}

export type StepStatus = "notApplicable" | "completed" | "awaitingReview" | "blocked" | "active" | "inProgress" | "upcoming";

export function openProposalFor(proposals: ScoreProposal[], roadmapId: string, stepNo: number): ScoreProposal | undefined {
  return proposals.find(
    (p) => p.roadmapId === roadmapId && p.stepNo === stepNo && (p.status === "proposed" || p.status === "reviewed"),
  );
}

export function stepStatus(roadmap: Roadmap, stepNo: number, tasks: Task[], proposals: ScoreProposal[]): StepStatus {
  const step = roadmap.steps.find((s) => s.stepNo === stepNo);
  if (!step) throw new Error(`Unknown step ${stepNo}`);
  if (!isStepApplicable(step)) return "notApplicable";
  if (isStepComplete(step)) return "completed";
  if (openProposalFor(proposals, roadmap.id, stepNo)) return "awaitingReview";
  const stepTasks = tasks.filter((t) => t.roadmapId === roadmap.id && t.stepNo === stepNo);
  if (stepTasks.some((t) => t.status === "blocked")) return "blocked";
  if (currentStepNo(roadmap) === stepNo) return "active";
  if (step.approvedScore > 0 || stepTasks.some((t) => t.status === "inProgress" || t.status === "done")) return "inProgress";
  return "upcoming";
}

export interface TaskSummary {
  total: number;
  done: number;
  open: number;
}

export function taskSummary(tasks: Task[], roadmapId: string, stepNo: number | null): TaskSummary {
  const relevant = tasks.filter((t) => t.roadmapId === roadmapId && t.stepNo === stepNo && t.status !== "cancelled");
  const done = relevant.filter((t) => t.status === "done").length;
  return { total: relevant.length, done, open: relevant.length - done };
}

/** Sum of estimated days of the step's unfinished tasks; null when no estimates exist. */
export function remainingEstimateDays(tasks: Task[], roadmapId: string, stepNo: number): number | null {
  const open = tasks.filter((t) => t.roadmapId === roadmapId && t.stepNo === stepNo && t.status !== "done" && t.status !== "cancelled");
  if (open.length === 0) return 0;
  const withEstimate = open.filter((t) => typeof t.estimatedDays === "number");
  if (withEstimate.length === 0) return null;
  // Tasks within a step may run in parallel; the longest open estimate is a conservative lower bound.
  return Math.max(...withEstimate.map((t) => t.estimatedDays as number));
}

/**
 * Estimated days until a milestone step is reached, by summing per-step remaining
 * estimates for applicable steps from the current step up to the milestone.
 * Returns null when any step on the way lacks estimates (insufficient data).
 */
export function estimateDaysToStep(roadmap: Roadmap, tasks: Task[], targetStepNo: number): number | null {
  const current = currentStepNo(roadmap);
  if (current === null || current > targetStepNo) return 0;
  let total = 0;
  for (const tpl of STEP_TEMPLATES) {
    if (tpl.stepNo < current || tpl.stepNo > targetStepNo) continue;
    const step = roadmap.steps.find((s) => s.stepNo === tpl.stepNo);
    if (!step || !isStepApplicable(step) || isStepComplete(step)) continue;
    const days = remainingEstimateDays(tasks, roadmap.id, tpl.stepNo);
    if (days === null) return null;
    total += days;
  }
  return total;
}
