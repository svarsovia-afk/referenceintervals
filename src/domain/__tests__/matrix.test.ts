import { describe, expect, it } from "vitest";
import { highestScoring, selectionNeedsExplanation, weightedTotals } from "../matrix";
import type { WeightedMatrix } from "../types";
import { run, seed, tryRun, U } from "./helpers";

const m: WeightedMatrix = {
  criteria: [
    { id: "a", label: { nl: "A", en: "A" }, weight: 3 },
    { id: "b", label: { nl: "B", en: "B" }, weight: 1 },
  ],
  scaleMax: 5,
  isSample: false,
  scores: {
    x: { a: { score: 4, evidence: "" }, b: { score: 0, evidence: "" } },
    y: { a: { score: 2, evidence: "" }, b: { score: 5, evidence: "" } },
    z: { a: { score: undefined, evidence: "" } },
  },
};

describe("weighted matrix", () => {
  it("computes weighted averages over scored criteria", () => {
    const totals = weightedTotals(m, ["x", "y", "z"]);
    expect(totals[0].weightedScore).toBeCloseTo((3 * 4 + 1 * 0) / 4);
    expect(totals[1].weightedScore).toBeCloseTo((3 * 2 + 1 * 5) / 4);
    expect(totals[2].weightedScore).toBeNull();
    expect(totals[2].scoredCriteria).toBe(0);
    expect(highestScoring(totals)).toEqual(["x"]);
  });

  it("requires explanation when a non-top option is selected", () => {
    const totals = weightedTotals(m, ["x", "y"]);
    expect(selectionNeedsExplanation(totals, "y")).toBe(true);
    expect(selectionNeedsExplanation(totals, "x")).toBe(false);
  });

  it("final selection of a lower-scoring option needs a deviation reason", () => {
    const s = seed();
    // Seed sample scores: monoclonal antibody scores highest.
    const totals = weightedTotals(s.roadmaps[0].matrix, s.roadmaps[0].options.map((o) => o.id));
    expect(highestScoring(totals)).toEqual(["opt-mab"]);
    const base = { type: "finalSelection.record" as const, roadmapId: "rsv-infants", rationale: { nl: "r", en: "r" }, uncertainties: { nl: "", en: "" }, nextSteps: { nl: "", en: "" } };
    const res = tryRun(s, { ...base, optionId: "opt-maternal", deviationReason: "" }, U.epi);
    expect(!res.ok && res.error.code).toBe("deviationRequired");
    const ok = run(s, { ...base, optionId: "opt-maternal", deviationReason: "Delivery fits antenatal care" }, U.epi);
    expect(ok.roadmaps[0].finalSelection?.optionId).toBe("opt-maternal");
    expect(ok.audit.at(-1)!.action).toBe("finalSelection.recorded");
  });
});
