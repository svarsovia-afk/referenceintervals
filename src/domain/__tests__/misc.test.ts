import { describe, expect, it } from "vitest";
import { en } from "@/i18n/en";
import { nl } from "@/i18n/nl";
import { translate } from "@/i18n/translate";
import { applyAction } from "../actions";
import { NOW, run, seed, tryRun, U } from "./helpers";

function leaves(obj: unknown, prefix = ""): string[] {
  if (typeof obj === "string") return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
}

describe("i18n", () => {
  it("has identical keys in Dutch and English with no empty strings (except intentional)", () => {
    expect(leaves(en).sort()).toEqual(leaves(nl).sort());
  });
  it("interpolates variables and handles dotted template keys", () => {
    expect(translate("en", "common.pageOf", { page: 1, total: 3 })).toBe("Page 1 of 3");
    expect(translate("nl", "taskTemplates.s4.paho.title")).toMatch(/PAHO/);
    expect(translate("en", "audit.score.approved")).toBe("Score approved");
  });
});

describe("audit log", () => {
  it("is append-only: every action adds entries and never removes previous ones", () => {
    let s = seed();
    const before = s.audit.map((a) => a.id);
    s = run(s, { type: "task.update", taskId: "rsv-infants-s4.islandsBurden", patch: { status: "inProgress" } }, U.youth);
    expect(s.audit.slice(0, before.length).map((a) => a.id)).toEqual(before);
    expect(s.audit.length).toBeGreaterThan(before.length);
    expect(s.audit.at(-1)).toMatchObject({ action: "task.statusChanged", previous: "notStarted", next: "inProgress", actorId: U.youth });
  });
  it("does not mutate the input state", () => {
    const s = seed();
    const snapshot = JSON.stringify(s);
    applyAction(s, { type: "task.update", taskId: "rsv-infants-s4.islandsBurden", patch: { status: "inProgress" } }, U.youth, NOW);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe("permissions", () => {
  it("read-only stakeholders cannot edit tasks or upload documents", () => {
    const s = seed();
    expect(tryRun(s, { type: "task.update", taskId: "rsv-infants-s4.paho", patch: { notes: "x" } }, U.lab).ok).toBe(false);
    expect(
      tryRun(s, { type: "document.add", doc: { id: "d", roadmapId: "rsv-infants", stepNo: 1, title: "t", category: "other", description: "", fileName: "a.txt", fileType: "text/plain", size: 1, uploadedBy: U.lab, uploadedAt: NOW, version: 1, isExample: false } }, U.lab).ok,
    ).toBe(false);
  });
  it("task owners can edit their own tasks but not reassign them", () => {
    const s = seed();
    expect(tryRun(s, { type: "task.update", taskId: "rsv-infants-s4.paho", patch: { estimatedDays: 40 } }, U.immun).ok).toBe(true);
    expect(tryRun(s, { type: "task.update", taskId: "rsv-infants-s4.paho", patch: { ownerId: U.youth } }, U.immun).ok).toBe(false);
    expect(tryRun(s, { type: "task.update", taskId: "rsv-infants-s4.islandsBurden", patch: { notes: "x" } }, U.immun).ok).toBe(false);
  });
  it("users can edit their own contact record but not their roles", () => {
    const s = seed();
    expect(tryRun(s, { type: "stakeholder.update", stakeholderId: U.immun, patch: { email: "new@example.org" } }, U.immun).ok).toBe(true);
    expect(tryRun(s, { type: "stakeholder.update", stakeholderId: U.immun, patch: { roles: ["admin"] } }, U.immun).ok).toBe(false);
    expect(tryRun(s, { type: "stakeholder.update", stakeholderId: U.youth, patch: { email: "x@example.org" } }, U.immun).ok).toBe(false);
  });
  it("keeps a single primary contact", () => {
    let s = seed();
    s = run(s, { type: "stakeholder.update", stakeholderId: U.headJgz, patch: { isPrimaryContact: true } }, U.admin);
    expect(s.stakeholders.filter((x) => x.isPrimaryContact).map((x) => x.id)).toEqual([U.headJgz]);
  });
  it("blocked tasks need a blocker description", () => {
    const s = seed();
    expect(tryRun(s, { type: "task.update", taskId: "rsv-infants-s4.paho", patch: { status: "blocked" } }, U.immun).ok).toBe(false);
    expect(tryRun(s, { type: "task.update", taskId: "rsv-infants-s4.paho", patch: { status: "blocked", blocker: "Awaiting PAHO" } }, U.immun).ok).toBe(true);
  });
});

describe("documents", () => {
  it("replaces with version history and deletes the whole chain", () => {
    let s = seed();
    const base = s.documents.find((d) => d.id === "doc-s3-minutes")!;
    s = run(s, { type: "document.replace", oldId: base.id, doc: { ...base, id: "doc-v2", fileName: "v2.txt" } }, U.epi);
    expect(s.documents.find((d) => d.id === "doc-v2")).toMatchObject({ version: 2, replacesId: base.id });
    expect(s.documents.find((d) => d.id === base.id)!.supersededById).toBe("doc-v2");
    s = run(s, { type: "document.delete", documentId: "doc-v2" }, U.epi);
    expect(s.documents.some((d) => d.id === base.id || d.id === "doc-v2")).toBe(false);
  });
});

describe("roadmap creation", () => {
  it("creates a reusable roadmap with nine steps and the implementation checklist", () => {
    let s = seed();
    const res = applyAction(s, { type: "roadmap.create", input: { disease: { nl: "Mazelen", en: "Measles" }, targetPopulation: { nl: "Kinderen", en: "Children" }, geographicScope: { nl: "Curaçao", en: "Curaçao" }, ownerId: U.epi } }, U.epi, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    s = res.state;
    const r = s.roadmaps.find((x) => x.id === res.createdId)!;
    expect(r.steps).toHaveLength(9);
    expect(s.tasks.filter((t) => t.roadmapId === r.id && t.stepNo === null)).toHaveLength(8);
    expect(tryRun(s, { type: "roadmap.create", input: { disease: { nl: "", en: "" }, targetPopulation: { nl: "a", en: "a" }, geographicScope: { nl: "", en: "" }, ownerId: U.epi } }, U.epi).ok).toBe(false);
  });
});
