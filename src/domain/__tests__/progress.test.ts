import { describe, expect, it } from "vitest";
import { computeProgress, currentStepNo, estimateDaysToStep, stepStatus } from "../progress";
import { seed } from "./helpers";

describe("progress", () => {
  it("normalizes approved scores against each step's maximum", () => {
    const s = seed();
    const r = s.roadmaps[0];
    // Seed: steps 1,2 = 2/2, step 3 = 3/3, step 4 = 1/2, rest 0 → 3.5 / 9
    const p = computeProgress(r);
    expect(p.applicableCount).toBe(9);
    expect(p.fraction).toBeCloseTo(3.5 / 9, 6);
    expect(p.percent).toBe(39);
  });

  it("excludes steps marked not applicable", () => {
    const r = seed().roadmaps[0];
    const step6 = r.steps.find((x) => x.stepNo === 6)!;
    step6.notApplicable = true;
    step6.naReason = "skipped";
    const p = computeProgress(r);
    expect(p.applicableCount).toBe(8);
    expect(p.fraction).toBeCloseTo(3.5 / 8, 6);
  });

  it("ignores pending (unapproved) proposals", () => {
    const s = seed();
    // Seed has a pending proposal for step 5 (0 → 1) — progress unchanged.
    expect(s.scoreProposals.some((p) => p.stepNo === 5 && p.status === "proposed")).toBe(true);
    expect(computeProgress(s.roadmaps[0]).breakdown.find((b) => b.stepNo === 5)!.approvedScore).toBe(0);
  });

  it("identifies the current step and step statuses", () => {
    const s = seed();
    const r = s.roadmaps[0];
    expect(currentStepNo(r)).toBe(4);
    expect(stepStatus(r, 1, s.tasks, s.scoreProposals)).toBe("completed");
    expect(stepStatus(r, 3, s.tasks, s.scoreProposals)).toBe("completed");
    expect(stepStatus(r, 4, s.tasks, s.scoreProposals)).toBe("active");
    expect(stepStatus(r, 5, s.tasks, s.scoreProposals)).toBe("awaitingReview");
    expect(stepStatus(r, 7, s.tasks, s.scoreProposals)).toBe("upcoming");
  });

  it("returns 0 progress when nothing is approved and null estimate without data", () => {
    const s = seed();
    const r = s.roadmaps[0];
    r.steps.forEach((x) => (x.approvedScore = 0));
    expect(computeProgress(r).percent).toBe(0);
    s.tasks.filter((t) => t.stepNo === 1).forEach((t) => {
      t.status = "notStarted";
      t.estimatedDays = undefined;
    });
    expect(estimateDaysToStep(r, s.tasks, 3)).toBeNull();
  });
});
