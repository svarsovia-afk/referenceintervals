/**
 * Duration tracking for institutional learning (not staff performance ranking).
 *
 * - Unit: elapsed calendar days (end − start), or a clearly labelled manual entry.
 * - Averages use ACCEPTED records only (cancelled, returned and pending records are excluded).
 * - Benchmark for the outlier check: the responsible person's own average for the
 *   same task template (≥ minPersonalSamples), else the overall average across
 *   roadmaps (≥ minOverallSamples, labelled provisional), else none.
 * - Outlier when actual < lower × benchmark or actual > upper × benchmark
 *   (defaults 0.70 / 1.30): a reason is then required before submission.
 */
import type { DurationBenchmark, DurationRecord, Settings, Task } from "./types";

const DAY_MS = 86_400_000;

export function calendarDaysBetween(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) throw new Error("Invalid date");
  return Math.round((b - a) / DAY_MS);
}

export interface AverageResult {
  average: number | null;
  sampleSize: number;
}

function average(values: number[]): AverageResult {
  if (values.length === 0) return { average: null, sampleSize: 0 };
  return { average: values.reduce((s, v) => s + v, 0) / values.length, sampleSize: values.length };
}

function accepted(records: DurationRecord[], excludeId?: string) {
  return records.filter((r) => r.status === "accepted" && r.id !== excludeId);
}

export function overallAverage(records: DurationRecord[], templateKey: string, excludeId?: string): AverageResult {
  return average(accepted(records, excludeId).filter((r) => r.templateKey === templateKey).map((r) => r.actualDays));
}

export function personalAverage(records: DurationRecord[], templateKey: string, stakeholderId: string, excludeId?: string): AverageResult {
  return average(
    accepted(records, excludeId)
      .filter((r) => r.templateKey === templateKey && r.stakeholderId === stakeholderId)
      .map((r) => r.actualDays),
  );
}

export function stepAverage(records: DurationRecord[], stepNo: number | null): AverageResult {
  return average(accepted(records).filter((r) => r.stepNo === stepNo).map((r) => r.actualDays));
}

export function selectBenchmark(
  records: DurationRecord[],
  templateKey: string,
  stakeholderId: string,
  settings: Pick<Settings, "minPersonalSamples" | "minOverallSamples">,
  excludeId?: string,
): DurationBenchmark | undefined {
  const personal = personalAverage(records, templateKey, stakeholderId, excludeId);
  if (personal.average !== null && personal.sampleSize >= settings.minPersonalSamples) {
    return { kind: "personal", average: personal.average, sampleSize: personal.sampleSize };
  }
  const overall = overallAverage(records, templateKey, excludeId);
  if (overall.average !== null && overall.sampleSize >= settings.minOverallSamples) {
    return { kind: "overall", average: overall.average, sampleSize: overall.sampleSize };
  }
  return undefined;
}

export interface OutlierResult {
  isOutlier: boolean;
  direction: "shorter" | "longer" | null;
  /** Signed relative deviation, e.g. 0.45 = 45 % longer. */
  deviation: number | null;
}

export function checkOutlier(
  actualDays: number,
  benchmark: DurationBenchmark | undefined,
  settings: Pick<Settings, "outlierLower" | "outlierUpper">,
): OutlierResult {
  if (!benchmark || benchmark.average <= 0) return { isOutlier: false, direction: null, deviation: null };
  const deviation = (actualDays - benchmark.average) / benchmark.average;
  if (actualDays < settings.outlierLower * benchmark.average) return { isOutlier: true, direction: "shorter", deviation };
  if (actualDays > settings.outlierUpper * benchmark.average) return { isOutlier: true, direction: "longer", deviation };
  return { isOutlier: false, direction: null, deviation };
}

export type DurationInputError = "missingDates" | "endBeforeStart" | "invalidManual" | "reasonRequired";

export interface DurationInput {
  method: "dates" | "manual";
  startDate?: string;
  endDate?: string;
  manualDays?: number;
  reason?: string;
}

/** Validates a duration submission and returns the computed number of days. */
export function evaluateDurationInput(
  input: DurationInput,
  benchmark: DurationBenchmark | undefined,
  settings: Pick<Settings, "outlierLower" | "outlierUpper">,
): { days?: number; outlier: OutlierResult; error?: DurationInputError } {
  let days: number | undefined;
  if (input.method === "dates") {
    if (!input.startDate || !input.endDate) return { outlier: checkOutlier(0, undefined, settings), error: "missingDates" };
    days = calendarDaysBetween(input.startDate, input.endDate);
    if (days < 0) return { outlier: checkOutlier(0, undefined, settings), error: "endBeforeStart" };
  } else {
    if (input.manualDays === undefined || !Number.isFinite(input.manualDays) || input.manualDays < 0) {
      return { outlier: checkOutlier(0, undefined, settings), error: "invalidManual" };
    }
    days = Math.round(input.manualDays);
  }
  const outlier = checkOutlier(days, benchmark, settings);
  if (outlier.isOutlier && !input.reason?.trim()) return { days, outlier, error: "reasonRequired" };
  return { days, outlier };
}

export function estimateDifference(task: Pick<Task, "estimatedDays">, actualDays: number): number | null {
  return typeof task.estimatedDays === "number" ? actualDays - task.estimatedDays : null;
}
