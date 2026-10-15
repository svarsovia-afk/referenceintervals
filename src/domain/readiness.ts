/**
 * Readiness score rules: scale, per-step maxima, and prerequisites for the
 * formal "Deliberated" status (score 3) on the two deliberation milestones.
 *
 * Prerequisites are enforced when a score-3 proposal is APPROVED (and shown as
 * guidance when it is proposed). Meeting records and documents can always be
 * recorded independently of the score, so there is no circular dependency.
 */
import { getTemplate } from "./stepTemplates";
import type { DocumentMeta, Roadmap, ScoreProposal } from "./types";

export const SCORE_LABEL_KEYS = ["notStarted", "inProgress", "completed", "deliberated"] as const;
export type ScoreLabelKey = (typeof SCORE_LABEL_KEYS)[number];

export function scoreLabelKey(score: number): ScoreLabelKey {
  return SCORE_LABEL_KEYS[Math.max(0, Math.min(3, score))];
}

export function allowedScores(stepNo: number): number[] {
  const max = getTemplate(stepNo).maxScore;
  return Array.from({ length: max + 1 }, (_, i) => i);
}

export type PrerequisiteCode =
  | "meetingDate"
  | "meetingDateFuture"
  | "meetingHeld"
  | "participants"
  | "preparationDocs"
  | "minutes"
  | "pathwayDecided"
  | "firstDeliberationApproved"
  | "finalSelection";

function activeDocs(documents: DocumentMeta[], roadmapId: string, stepNo: number) {
  return documents.filter((d) => d.roadmapId === roadmapId && d.stepNo === stepNo && !d.supersededById);
}

/** Lists what is still missing before `score` can be approved for the step. Empty = all met. */
export function missingPrerequisites(
  roadmap: Roadmap,
  documents: DocumentMeta[],
  stepNo: number,
  score: number,
  today: string = new Date().toISOString().slice(0, 10),
): PrerequisiteCode[] {
  const tpl = getTemplate(stepNo);
  if (tpl.kind !== "deliberation" || score < 3) return [];
  const step = roadmap.steps.find((s) => s.stepNo === stepNo);
  const missing: PrerequisiteCode[] = [];

  if (stepNo === 8) {
    const first = roadmap.steps.find((s) => s.stepNo === 3);
    if (!first || first.approvedScore < 3) missing.push("firstDeliberationApproved");
  }

  const d = step?.deliberation;
  if (!d?.date) missing.push("meetingDate");
  else if (d.date > today) missing.push("meetingDateFuture");
  if (!d?.held) missing.push("meetingHeld");
  if (!d || d.participantIds.length + (d.externalParticipants.trim() ? 1 : 0) === 0) missing.push("participants");

  const docs = activeDocs(documents, roadmap.id, stepNo);
  if (!docs.some((doc) => doc.category === "meetingPreparation")) missing.push("preparationDocs");
  if (!docs.some((doc) => doc.category === "meetingMinutes")) missing.push("minutes");

  if (stepNo === 3 && roadmap.pathway === "undecided") missing.push("pathwayDecided");
  if (stepNo === 8 && !roadmap.finalSelection) missing.push("finalSelection");

  return missing;
}

export type ProposalError = "notApplicable" | "outOfRange" | "unchanged" | "openProposal";

export function validateProposal(
  roadmap: Roadmap,
  proposals: ScoreProposal[],
  stepNo: number,
  score: number,
): ProposalError | null {
  const step = roadmap.steps.find((s) => s.stepNo === stepNo);
  if (!step || step.notApplicable) return "notApplicable";
  if (!allowedScores(stepNo).includes(score)) return "outOfRange";
  if (score === step.approvedScore) return "unchanged";
  const open = proposals.some(
    (p) => p.roadmapId === roadmap.id && p.stepNo === stepNo && (p.status === "proposed" || p.status === "reviewed"),
  );
  if (open) return "openProposal";
  return null;
}
