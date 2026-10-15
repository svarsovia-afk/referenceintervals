import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../config";
import { calendarDaysBetween, checkOutlier, overallAverage, personalAverage, selectBenchmark } from "../durations";
import type { DurationRecord } from "../types";
import { run, seed, tryRun, U } from "./helpers";

const rec = (id: string, who: string, days: number, status: DurationRecord["status"] = "accepted"): DurationRecord => ({
  id, roadmapId: "r", stepNo: 4, templateKey: "k", stakeholderId: who, actualDays: days, method: "manual",
  recordedBy: who, recordedAt: "2026-01-01", status, isSample: false,
});

describe("durations", () => {
  it("counts elapsed calendar days", () => {
    expect(calendarDaysBetween("2026-01-01", "2026-01-31")).toBe(30);
    expect(calendarDaysBetween("2026-03-01", "2026-03-01")).toBe(0);
  });

  it("averages accepted records only", () => {
    const records = [rec("1", "a", 10), rec("2", "a", 20), rec("3", "b", 30), rec("4", "a", 99, "submitted"), rec("5", "a", 99, "cancelled")];
    expect(personalAverage(records, "k", "a")).toEqual({ average: 15, sampleSize: 2 });
    expect(overallAverage(records, "k")).toEqual({ average: 20, sampleSize: 3 });
  });

  it("selects personal benchmark, then provisional overall, then none", () => {
    const settings = DEFAULT_SETTINGS;
    expect(selectBenchmark([rec("1", "a", 10), rec("2", "a", 20)], "k", "a", settings)).toEqual({ kind: "personal", average: 15, sampleSize: 2 });
    expect(selectBenchmark([rec("1", "a", 10), rec("3", "b", 30)], "k", "a", settings)).toEqual({ kind: "overall", average: 20, sampleSize: 2 });
    expect(selectBenchmark([], "k", "a", settings)).toBeUndefined();
  });

  it("flags deviations beyond ±30 %", () => {
    const b = { kind: "personal" as const, average: 20, sampleSize: 3 };
    expect(checkOutlier(14, b, DEFAULT_SETTINGS).isOutlier).toBe(false); // exactly 0.70×
    expect(checkOutlier(13, b, DEFAULT_SETTINGS)).toMatchObject({ isOutlier: true, direction: "shorter" });
    expect(checkOutlier(26, b, DEFAULT_SETTINGS).isOutlier).toBe(false); // exactly 1.30×
    expect(checkOutlier(27, b, DEFAULT_SETTINGS)).toMatchObject({ isOutlier: true, direction: "longer" });
    expect(checkOutlier(1000, undefined, DEFAULT_SETTINGS).isOutlier).toBe(false);
  });

  it("requires a reason for outliers, then updates averages once accepted", () => {
    let s = seed();
    const task = s.tasks.find((t) => t.templateKey === "s4.paho" && t.roadmapId === "rsv-infants")!;
    // Ruben's sample history for this task: 28 and 34 days → personal average 31.
    expect(personalAverage(s.durationRecords, "s4.paho", U.immun)).toEqual({ average: 31, sampleSize: 2 });

    const noReason = tryRun(s, { type: "duration.submit", taskId: task.id, input: { method: "dates", startDate: "2026-09-15", endDate: "2026-11-14" } }, U.immun);
    expect(!noReason.ok && noReason.error.code).toBe("reasonRequired");

    s = run(s, { type: "duration.submit", taskId: task.id, input: { method: "dates", startDate: "2026-09-15", endDate: "2026-11-14", reason: "Waiting on PAHO reply" } }, U.immun);
    const record = s.durationRecords.at(-1)!;
    expect(record).toMatchObject({ actualDays: 60, status: "submitted", benchmark: { kind: "personal", average: 31, sampleSize: 2 } });
    // Not yet accepted → averages unchanged.
    expect(personalAverage(s.durationRecords, "s4.paho", U.immun).sampleSize).toBe(2);

    // Ruben cannot accept his own record.
    expect(tryRun(s, { type: "duration.review", recordId: record.id, decision: "accepted", note: "" }, U.immun).ok).toBe(false);
    s = run(s, { type: "duration.review", recordId: record.id, decision: "accepted", note: "" }, U.headJgz);
    expect(personalAverage(s.durationRecords, "s4.paho", U.immun)).toEqual({ average: (28 + 34 + 60) / 3, sampleSize: 3 });
    expect(overallAverage(s.durationRecords, "s4.paho")).toEqual({ average: (28 + 34 + 41 + 60) / 4, sampleSize: 4 });
  });

  it("allows the first record without a baseline", () => {
    let s = seed();
    const task = s.tasks.find((t) => t.templateKey === "s4.islandsBurden")!;
    s = run(s, { type: "duration.submit", taskId: task.id, input: { method: "manual", manualDays: 90 } }, U.youth);
    expect(s.durationRecords.at(-1)!.benchmark).toBeUndefined();
  });
});
