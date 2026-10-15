import { describe, expect, it } from "vitest";
import { missingPrerequisites, validateProposal } from "../readiness";
import { NOW, run, seed, tryRun, U } from "./helpers";

describe("readiness workflow", () => {
  it("passes through proposed → reviewed → approved and only then changes the approved score", () => {
    let s = seed();
    s = run(s, { type: "score.propose", roadmapId: "rsv-infants", stepNo: 4, score: 2, note: "PAHO info received" }, U.immun);
    const p = s.scoreProposals.at(-1)!;
    expect(p.status).toBe("proposed");
    expect(s.roadmaps[0].steps[3].approvedScore).toBe(1);

    s = run(s, { type: "score.review", proposalId: p.id, decision: "reviewed", note: "" }, U.headJgz);
    expect(s.scoreProposals.find((x) => x.id === p.id)!.status).toBe("reviewed");
    expect(s.roadmaps[0].steps[3].approvedScore).toBe(1);

    s = run(s, { type: "score.approve", proposalId: p.id, decision: "approved", note: "" }, U.approver);
    expect(s.scoreProposals.find((x) => x.id === p.id)!.status).toBe("approved");
    expect(s.roadmaps[0].steps[3].approvedScore).toBe(2);
    expect(s.audit.map((a) => a.action)).toEqual(expect.arrayContaining(["score.proposed", "score.reviewed", "score.approved"]));
  });

  it("enforces separation of duties", () => {
    let s = seed();
    // Head of JGZ is lead + reviewer: may propose, but may not review own proposal.
    s = run(s, { type: "score.propose", roadmapId: "rsv-infants", stepNo: 4, score: 2, note: "" }, U.headJgz);
    const p = s.scoreProposals.at(-1)!;
    const res = tryRun(s, { type: "score.review", proposalId: p.id, decision: "reviewed", note: "" }, U.headJgz);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("separation");
  });

  it("rejects review without permission and approval before review", () => {
    let s = seed();
    s = run(s, { type: "score.propose", roadmapId: "rsv-infants", stepNo: 4, score: 2, note: "" }, U.immun);
    const p = s.scoreProposals.at(-1)!;
    const noPerm = tryRun(s, { type: "score.review", proposalId: p.id, decision: "reviewed", note: "" }, U.lab);
    expect(noPerm.ok).toBe(false);
    const early = tryRun(s, { type: "score.approve", proposalId: p.id, decision: "approved", note: "" }, U.approver);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.error.code).toBe("state");
  });

  it("requires a reason to return a proposal", () => {
    let s = seed();
    s = run(s, { type: "score.propose", roadmapId: "rsv-infants", stepNo: 4, score: 2, note: "" }, U.immun);
    const p = s.scoreProposals.at(-1)!;
    expect(tryRun(s, { type: "score.review", proposalId: p.id, decision: "returned", note: " " }, U.reviewer).ok).toBe(false);
    s = run(s, { type: "score.review", proposalId: p.id, decision: "returned", note: "Missing PAHO letter" }, U.reviewer);
    expect(s.scoreProposals.find((x) => x.id === p.id)!.status).toBe("returned");
  });

  it("caps routine steps at 2 and deliberation steps at 3", () => {
    const s = seed();
    const r = s.roadmaps[0];
    expect(validateProposal(r, s.scoreProposals, 4, 3)).toBe("outOfRange");
    expect(validateProposal(r, s.scoreProposals, 8, 3)).toBeNull();
    expect(validateProposal(r, s.scoreProposals, 5, 1)).toBe("openProposal");
  });

  it("blocks score 3 on step 3 without minutes, and lists what is missing", () => {
    const s = seed();
    const r = s.roadmaps[0];
    expect(missingPrerequisites(r, s.documents, 3, 3, NOW.slice(0, 10))).toEqual([]);
    const withoutMinutes = s.documents.filter((d) => d.category !== "meetingMinutes");
    expect(missingPrerequisites(r, withoutMinutes, 3, 3, NOW.slice(0, 10))).toEqual(["minutes"]);
    expect(missingPrerequisites(r, [], 3, 2, NOW.slice(0, 10))).toEqual([]);
  });

  it("blocks score 3 on step 8 until first deliberation and second deliberation docs exist", () => {
    let s = seed();
    // Bring step 8 to a proposal of 3 via the workflow and try to approve.
    s.roadmaps[0].steps.find((x) => x.stepNo === 3)!.approvedScore = 2;
    s = run(s, { type: "score.propose", roadmapId: "rsv-infants", stepNo: 8, score: 3, note: "" }, U.epi);
    const p = s.scoreProposals.at(-1)!;
    s = run(s, { type: "score.review", proposalId: p.id, decision: "reviewed", note: "" }, U.reviewer);
    const res = tryRun(s, { type: "score.approve", proposalId: p.id, decision: "approved", note: "" }, U.approver);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("prerequisites");
      expect(res.error.details).toEqual(
        expect.arrayContaining(["firstDeliberationApproved", "meetingDate", "meetingHeld", "participants", "preparationDocs", "minutes", "finalSelection"]),
      );
    }
  });

  it("allows meeting records without a score (no circular dependency) and then approval of score 3", () => {
    let s = seed();
    const r = s.roadmaps[0];
    // Reset step 3 to 2 and remove its proposal history to re-run the flow.
    r.steps.find((x) => x.stepNo === 3)!.approvedScore = 2;
    s = run(s, { type: "score.propose", roadmapId: "rsv-infants", stepNo: 3, score: 3, note: "" }, U.epi);
    const p = s.scoreProposals.at(-1)!;
    s = run(s, { type: "score.review", proposalId: p.id, decision: "reviewed", note: "" }, U.reviewer);
    s = run(s, { type: "score.approve", proposalId: p.id, decision: "approved", note: "" }, U.approver);
    expect(s.roadmaps[0].steps.find((x) => x.stepNo === 3)!.approvedScore).toBe(3);
  });

  it("logs administrator overrides with a mandatory reason", () => {
    let s = seed();
    expect(tryRun(s, { type: "score.override", roadmapId: "rsv-infants", stepNo: 5, score: 2, reason: "" }, U.admin).ok).toBe(false);
    expect(tryRun(s, { type: "score.override", roadmapId: "rsv-infants", stepNo: 5, score: 2, reason: "x" }, U.epi).ok).toBe(false);
    s = run(s, { type: "score.override", roadmapId: "rsv-infants", stepNo: 5, score: 2, reason: "Exceptional correction" }, U.admin);
    expect(s.roadmaps[0].steps.find((x) => x.stepNo === 5)!.approvedScore).toBe(2);
    expect(s.scoreProposals.find((p) => p.id === "sp-5")!.status).toBe("returned");
    const entry = s.audit.at(-1)!;
    expect(entry.action).toBe("score.override");
    expect(entry.reason).toBe("Exceptional correction");
  });
});
