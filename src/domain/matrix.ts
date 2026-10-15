/**
 * Weighted scoring matrix. Criteria, weights and the scale are configurable;
 * the result supports — but never replaces — human deliberation.
 *
 * Weighted total for an option = Σ(weight × score) / Σ(weight) over criteria
 * that have a score for that option, so it stays on the 0..scaleMax scale.
 * `completeness` tells how many criteria were scored.
 */
import type { WeightedMatrix } from "./types";

export interface OptionTotal {
  optionId: string;
  weightedScore: number | null;
  scoredCriteria: number;
  totalCriteria: number;
}

export function weightedTotals(matrix: WeightedMatrix, optionIds: string[]): OptionTotal[] {
  return optionIds.map((optionId) => {
    let weighted = 0;
    let weights = 0;
    let scored = 0;
    for (const c of matrix.criteria) {
      const cell = matrix.scores[optionId]?.[c.id];
      if (cell?.score === undefined || cell.score === null || Number.isNaN(cell.score)) continue;
      const w = Math.max(0, c.weight);
      weighted += w * cell.score;
      weights += w;
      scored += 1;
    }
    return {
      optionId,
      weightedScore: weights > 0 ? weighted / weights : null,
      scoredCriteria: scored,
      totalCriteria: matrix.criteria.length,
    };
  });
}

/** Ids of the option(s) with the highest weighted score (ties return several). */
export function highestScoring(totals: OptionTotal[]): string[] {
  const scored = totals.filter((t) => t.weightedScore !== null);
  if (scored.length === 0) return [];
  const best = Math.max(...scored.map((t) => t.weightedScore as number));
  return scored.filter((t) => Math.abs((t.weightedScore as number) - best) < 1e-9).map((t) => t.optionId);
}

/** A selection that differs from the highest-scoring option needs a short explanation. */
export function selectionNeedsExplanation(totals: OptionTotal[], selectedOptionId: string): boolean {
  const top = highestScoring(totals);
  return top.length > 0 && !top.includes(selectedOptionId);
}

export function weightShare(matrix: WeightedMatrix, criterionId: string): number {
  const total = matrix.criteria.reduce((sum, c) => sum + Math.max(0, c.weight), 0);
  const c = matrix.criteria.find((x) => x.id === criterionId);
  return total > 0 && c ? Math.max(0, c.weight) / total : 0;
}
