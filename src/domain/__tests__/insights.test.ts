import { describe, expect, it } from "vitest";
import { isOverdue, nextAction, outstandingTasks, stepEstimateDays, stepOwnerId } from "../insights";
import { NOW, run, seed, U } from "./helpers";

const today = NOW.slice(0, 10);

describe("insights", () => {
  it("surfaces pending reviews/approvals for authorized users first", () => {
    const s = seed();
    const r = s.roadmaps[0];
    // Seed: step 5 proposal (by Nadia) awaits review.
    expect(nextAction(s, r, U.reviewer, today)).toMatchObject({ kind: "review" });
    expect(nextAction(s, r, U.youth, today)).toMatchObject({ kind: "task" });
    const reviewed = run(s, { type: "score.review", proposalId: "sp-5", decision: "reviewed", note: "" }, U.reviewer);
    expect(nextAction(reviewed, reviewed.roadmaps[0], U.approver, today)).toMatchObject({ kind: "approve" });
  });

  it("prioritizes overdue tasks and the user's own current-step work", () => {
    const s = seed();
    const r = s.roadmaps[0];
    const list = outstandingTasks(s, r, today);
    expect(isOverdue(list[0], today)).toBe(true);
    expect(list[0].templateKey).toBe("s4.paho");
    const na = nextAction(s, r, U.immun, today);
    expect(na?.kind === "task" && na.task.templateKey).toBe("s4.paho");
    // Implementation tasks are not outstanding before the phase is active.
    expect(list.some((t) => t.stepNo === null)).toBe(false);
  });

  it("derives step owner and estimate", () => {
    const s = seed();
    const r = s.roadmaps[0];
    expect(stepOwnerId(s, r, 2)).toBe(U.youth);
    r.steps[1].ownerId = U.epi;
    expect(stepOwnerId(s, r, 2)).toBe(U.epi);
    expect(stepEstimateDays(s, r.id, 4)).toBe(30);
  });
});
