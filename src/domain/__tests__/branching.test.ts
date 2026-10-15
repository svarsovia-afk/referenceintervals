import { describe, expect, it } from "vitest";
import { computeProgress } from "../progress";
import { run, seed, tryRun, U } from "./helpers";

const handover = {
  records: [
    { recipient: "svb" as const, transferred: "Aggregated summary + outcome", recipientContact: "SVB policy dept" },
    { recipient: "pharmacies" as const, transferred: "Outcome letter", recipientContact: "Pharmacy association" },
    { recipient: "clinicians" as const, transferred: "Outcome letter", recipientContact: "Paediatricians" },
  ],
  naReason: "Curative matter: handled within regular care",
};

describe("branching after first deliberation", () => {
  it("curative route requires a complete handover and a reason, then marks steps 4–9 not applicable", () => {
    let s = seed();
    const incomplete = tryRun(s, { type: "pathway.set", roadmapId: "rsv-infants", pathway: "curative", handover: { records: handover.records.slice(0, 2), naReason: "x" }, changeReason: "re-deliberated" }, U.epi);
    expect(!incomplete.ok && incomplete.error.code).toBe("handoverIncomplete");
    const noChangeReason = tryRun(s, { type: "pathway.set", roadmapId: "rsv-infants", pathway: "curative", handover }, U.epi);
    expect(!noChangeReason.ok && noChangeReason.error.code).toBe("changeReasonRequired");

    s = run(s, { type: "pathway.set", roadmapId: "rsv-infants", pathway: "curative", handover, changeReason: "Second look" }, U.epi);
    const r = s.roadmaps[0];
    expect(r.steps.filter((x) => x.notApplicable).map((x) => x.stepNo)).toEqual([4, 5, 6, 7, 8, 9]);
    expect(r.steps.find((x) => x.stepNo === 4)!.naReason).toBe(handover.naReason);
    // Progress now only counts steps 1–3, which are complete.
    expect(computeProgress(r).percent).toBe(100);
    expect(s.audit.some((a) => a.action === "pathway.changed")).toBe(true);
  });

  it("public-health route requires preferred options and restores steps", () => {
    let s = seed();
    s = run(s, { type: "pathway.set", roadmapId: "rsv-infants", pathway: "curative", handover, changeReason: "x" }, U.epi);
    const none = tryRun(s, { type: "pathway.set", roadmapId: "rsv-infants", pathway: "publicHealth", preferredOptionIds: [], changeReason: "y" }, U.epi);
    expect(!none.ok && none.error.code).toBe("noPreferredOptions");
    s = run(s, { type: "pathway.set", roadmapId: "rsv-infants", pathway: "publicHealth", preferredOptionIds: ["opt-mab"], changeReason: "y" }, U.epi);
    expect(s.roadmaps[0].steps.some((x) => x.notApplicable)).toBe(false);
    expect(s.roadmaps[0].preferredOptionIds).toEqual(["opt-mab"]);
  });

  it("only users allowed to decide the pathway can change it", () => {
    const s = seed();
    const res = tryRun(s, { type: "pathway.set", roadmapId: "rsv-infants", pathway: "publicHealth", preferredOptionIds: ["opt-mab"] }, U.immun);
    expect(!res.ok && res.error.code).toBe("permission");
  });

  it("optional step 6 needs a reason and is not applicable (not unfinished) when skipped", () => {
    let s = seed();
    const noReason = tryRun(s, { type: "step.optionalDecision", roadmapId: "rsv-infants", stepNo: 6, decision: "skipped", reason: "" }, U.epi);
    expect(!noReason.ok && noReason.error.code).toBe("reasonRequired");
    const routine = tryRun(s, { type: "step.optionalDecision", roadmapId: "rsv-infants", stepNo: 5, decision: "skipped", reason: "x" }, U.epi);
    expect(!routine.ok && routine.error.code).toBe("notOptional");
    const before = computeProgress(s.roadmaps[0]).applicableCount;
    s = run(s, { type: "step.optionalDecision", roadmapId: "rsv-infants", stepNo: 6, decision: "skipped", reason: "Low cost, stable sentiment" }, U.epi);
    const step6 = s.roadmaps[0].steps.find((x) => x.stepNo === 6)!;
    expect(step6.notApplicable).toBe(true);
    expect(computeProgress(s.roadmaps[0]).applicableCount).toBe(before - 1);
    // Switching to curative and back keeps the deliberate skip.
    s = run(s, { type: "pathway.set", roadmapId: "rsv-infants", pathway: "curative", handover, changeReason: "x" }, U.epi);
    s = run(s, { type: "pathway.set", roadmapId: "rsv-infants", pathway: "publicHealth", preferredOptionIds: ["opt-mab"], changeReason: "y" }, U.epi);
    expect(s.roadmaps[0].steps.find((x) => x.stepNo === 6)!.notApplicable).toBe(true);
    expect(s.roadmaps[0].steps.find((x) => x.stepNo === 5)!.notApplicable).toBe(false);
  });
});
