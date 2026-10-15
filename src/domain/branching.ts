/**
 * Branching after the first deliberation (Step 3) and the optional Step 6.
 *
 * - Public-health route: at least one initially preferred option; Steps 4–9 apply.
 * - Curative route: documented handover to SVB, pharmacies and clinicians plus a
 *   reason; the public-health steps (4–9) become not applicable with that reason.
 * - Step 6 is optional: it must be activated or skipped with a justification;
 *   a skipped Step 6 is "not applicable", never "unfinished".
 * - Routine steps cannot be marked not applicable by hand.
 */
import { STEP_TEMPLATES, getTemplate } from "./stepTemplates";
import type { CurativeHandover, OptionalDecision, Pathway, Roadmap, StepState } from "./types";

export const HANDOVER_RECIPIENTS = ["svb", "pharmacies", "clinicians"] as const;

export type PathwayError = "noPreferredOptions" | "handoverIncomplete" | "naReasonRequired" | "changeReasonRequired";

export function validatePathway(
  roadmap: Roadmap,
  pathway: Pathway,
  input: { preferredOptionIds?: string[]; handover?: CurativeHandover; changeReason?: string },
): PathwayError | null {
  if (roadmap.pathway !== "undecided" && roadmap.pathway !== pathway && !input.changeReason?.trim()) {
    return "changeReasonRequired";
  }
  if (pathway === "publicHealth") {
    const ids = (input.preferredOptionIds ?? []).filter((id) => roadmap.options.some((o) => o.id === id));
    if (ids.length === 0) return "noPreferredOptions";
  }
  if (pathway === "curative") {
    const h = input.handover;
    const complete = HANDOVER_RECIPIENTS.every((r) => h?.records.some((rec) => rec.recipient === r && rec.transferred.trim()));
    if (!complete) return "handoverIncomplete";
    if (!h?.naReason.trim()) return "naReasonRequired";
  }
  return null;
}

/** Returns the steps with applicability updated for the chosen pathway. */
export function applyPathwayToSteps(steps: StepState[], pathway: Pathway, naReason: string): StepState[] {
  return steps.map((step) => {
    const tpl = getTemplate(step.stepNo);
    if (tpl.pathway !== "publicHealth") return step;
    if (pathway === "curative") {
      return { ...step, notApplicable: true, naReason, naSource: "pathway" };
    }
    // Leaving the curative route restores pathway-NA steps, but keeps a deliberate Step 6 skip.
    if (step.naSource === "pathway") {
      const skipped = tpl.optional && step.optionalDecision === "skipped";
      return skipped
        ? { ...step, notApplicable: true, naReason: step.optionalReason, naSource: "optionalSkip" }
        : { ...step, notApplicable: false, naReason: undefined, naSource: undefined };
    }
    return step;
  });
}

export type OptionalError = "notOptional" | "reasonRequired" | "pathwayCurative";

export function validateOptionalDecision(roadmap: Roadmap, stepNo: number, decision: OptionalDecision, reason: string): OptionalError | null {
  if (!getTemplate(stepNo).optional) return "notOptional";
  if (roadmap.pathway === "curative") return "pathwayCurative";
  if (decision !== "undecided" && !reason.trim()) return "reasonRequired";
  return null;
}

export function applyOptionalDecision(step: StepState, decision: OptionalDecision, reason: string): StepState {
  if (decision === "skipped") {
    return { ...step, optionalDecision: decision, optionalReason: reason, notApplicable: true, naReason: reason, naSource: "optionalSkip" };
  }
  return { ...step, optionalDecision: decision, optionalReason: reason, notApplicable: false, naReason: undefined, naSource: undefined };
}

/** Steps that are required for the current pathway (used for UI hints). */
export function requiredStepNos(roadmap: Roadmap): number[] {
  return STEP_TEMPLATES.filter((t) => {
    if (roadmap.pathway === "curative" && t.pathway === "publicHealth") return false;
    if (t.optional) return false;
    return true;
  }).map((t) => t.stepNo);
}
