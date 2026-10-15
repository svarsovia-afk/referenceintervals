import { describe, expect, it } from "vitest";
import { implementationGate } from "../approvals";
import { computeProgress } from "../progress";
import { run, seed, tryRun, U } from "./helpers";

describe("approvals and implementation gate", () => {
  it("does not treat 100 % progress or completed tasks as approval", () => {
    const s = seed();
    const r = s.roadmaps[0];
    r.steps.forEach((x) => (x.approvedScore = x.stepNo === 3 || x.stepNo === 8 ? 3 : 2));
    s.tasks.forEach((t) => (t.status = "done"));
    expect(computeProgress(r).percent).toBe(100);
    expect(implementationGate(r, s.settings).canActivate).toBe(false);
    const res = tryRun(s, { type: "implementation.activate", roadmapId: r.id }, U.epi);
    expect(!res.ok && res.error.code).toBe("gateNotMet");
  });

  it("uploading an advisory report does not grant approval", () => {
    let s = seed();
    s = run(s, { type: "approval.update", roadmapId: "rsv-infants", key: "advisoryReport", status: "done", note: "" }, U.epi);
    expect(implementationGate(s.roadmaps[0], s.settings).missing).toEqual(["leadershipApproval", "financeApproval"]);
  });

  it("activates the implementation phase only after configured approvals are recorded", () => {
    let s = seed();
    s = run(s, { type: "approval.update", roadmapId: "rsv-infants", key: "leadershipApproval", status: "approved", note: "" }, U.approver);
    expect(tryRun(s, { type: "approval.update", roadmapId: "rsv-infants", key: "financeApproval", status: "notRequired", note: "" }, U.approver).ok).toBe(false);
    s = run(s, { type: "approval.update", roadmapId: "rsv-infants", key: "financeApproval", status: "notRequired", note: "Within GMN budget" }, U.approver);
    expect(implementationGate(s.roadmaps[0], s.settings).canActivate).toBe(true);
    s = run(s, { type: "implementation.activate", roadmapId: "rsv-infants" }, U.epi);
    expect(s.roadmaps[0].implementationActive).toBe(true);
  });

  it("supports configurable requirements", () => {
    let s = seed();
    s = run(s, { type: "settings.update", settings: { ...s.settings, implementationRequirements: ["grcRequest"] } }, U.admin);
    expect(implementationGate(s.roadmaps[0], s.settings).missing).toEqual(["grcRequest"]);
    expect(tryRun(s, { type: "settings.update", settings: s.settings }, U.epi).ok).toBe(false);
  });

  it("validates budget year", () => {
    const s = seed();
    expect(tryRun(s, { type: "approval.update", roadmapId: "rsv-infants", key: "budgetYear", status: "done", note: "", value: "next" }, U.epi).ok).toBe(false);
    expect(tryRun(s, { type: "approval.update", roadmapId: "rsv-infants", key: "budgetYear", status: "done", note: "", value: "2027" }, U.epi).ok).toBe(true);
  });
});
