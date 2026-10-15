/**
 * Seed data for the local prototype.
 *
 * Everything here is FICTIONAL sample data: demo identities use example.org
 * addresses, clinical/economic fields are empty placeholders, the matrix holds
 * clearly flagged sample scores, and duration observations are flagged
 * `isSample` so they cannot be mistaken for real Curaçao performance data.
 */
import { DEFAULT_SETTINGS } from "./config";
import { createRoadmap } from "./factory";
import type { AppState, AuditEntry, DocumentMeta, DurationRecord, ScoreProposal, Stakeholder, Task } from "./types";

export const SCHEMA_VERSION = 1;
export const SAMPLE_HISTORY_ROADMAP_ID = "sample-history";
export const RSV_ID = "rsv-infants";

const S = {
  admin: "sh-admin",
  epi: "sh-epi",
  headJgz: "sh-headjgz",
  immun: "sh-immun",
  youth: "sh-youth",
  reviewer: "sh-reviewer",
  approver: "sh-approver",
  lab: "sh-lab",
} as const;

export const DEMO_STAKEHOLDERS: Stakeholder[] = [
  { id: S.epi, fullName: "Mila Voorbeeld", email: "mila.voorbeeld@example.org", position: "epiManager", organization: "JGZ (demo)", coveringPosition: true, roles: ["lead", "taskOwner"], isPrimaryContact: true, ccOnCommunications: false, isDemo: true },
  { id: S.headJgz, fullName: "Sara Voorbeeld", email: "sara.voorbeeld@example.org", position: "headJgz", organization: "JGZ (demo)", coveringPosition: true, roles: ["lead", "reviewer"], isPrimaryContact: false, ccOnCommunications: true, isDemo: true },
  { id: S.immun, fullName: "Ruben Voorbeeld", email: "ruben.voorbeeld@example.org", position: "immunizationPhysician", organization: "JGZ (demo)", coveringPosition: true, roles: ["taskOwner"], isPrimaryContact: false, ccOnCommunications: true, isDemo: true },
  { id: S.youth, fullName: "Nadia Voorbeeld", email: "nadia.voorbeeld@example.org", position: "youthPhysician", organization: "JGZ (demo)", coveringPosition: true, roles: ["taskOwner"], isPrimaryContact: false, ccOnCommunications: true, isDemo: true },
  { id: S.reviewer, fullName: "Jules Voorbeeld", email: "jules.voorbeeld@example.org", position: "committeeMember", organization: "Vaccinatiecommissie (demo)", coveringPosition: true, roles: ["reviewer"], isPrimaryContact: false, ccOnCommunications: false, isDemo: true },
  { id: S.approver, fullName: "Eva Voorbeeld", email: "eva.voorbeeld@example.org", position: "ggdHead", organization: "GGD (demo)", coveringPosition: true, roles: ["approver"], isPrimaryContact: false, ccOnCommunications: false, isDemo: true },
  { id: S.lab, fullName: "Tom Voorbeeld", email: "", position: "laboratory", organization: "Laboratorium (demo)", coveringPosition: false, roles: ["viewer"], isPrimaryContact: false, ccOnCommunications: false, isDemo: true },
  { id: S.admin, fullName: "Alex Voorbeeld", email: "alex.voorbeeld@example.org", position: "administrator", organization: "Prototypebeheer (demo)", coveringPosition: true, roles: ["admin"], isPrimaryContact: false, ccOnCommunications: false, isDemo: true },
];

export const DEFAULT_USER_ID = S.epi;

/** Plain-text contents for the example documents (stored in IndexedDB on first load). */
export const SEED_FILES: Record<string, { content: string; type: string }> = {};

function exampleDoc(
  id: string,
  stepNo: number,
  category: DocumentMeta["category"],
  title: string,
  uploadedBy: string,
  uploadedAt: string,
  description: string,
): DocumentMeta {
  const fileName = `${id}.txt`;
  const content = [
    "VOORBEELDDOCUMENT / EXAMPLE DOCUMENT",
    "",
    `${title}`,
    "",
    "Dit is een fictief voorbeeldbestand voor de demonstratie van het prototype.",
    "Het bevat geen echt bewijs, geen echte notulen en geen officiële besluiten.",
    "",
    "This is a fictional example file for demonstrating the prototype.",
    "It contains no real evidence, no real minutes and no official decisions.",
  ].join("\n");
  SEED_FILES[id] = { content, type: "text/plain" };
  return {
    id,
    roadmapId: RSV_ID,
    stepNo,
    title,
    category,
    description,
    fileName,
    fileType: "text/plain",
    size: content.length,
    uploadedBy,
    uploadedAt,
    version: 1,
    isExample: true,
  };
}

function sampleDuration(
  id: string,
  roadmapId: string,
  stepNo: number | null,
  templateKey: string,
  stakeholderId: string,
  actualDays: number,
  recordedAt: string,
  extra: Partial<DurationRecord> = {},
): DurationRecord {
  return {
    id,
    roadmapId,
    stepNo,
    templateKey,
    stakeholderId,
    actualDays,
    method: "manual",
    recordedBy: stakeholderId,
    recordedAt,
    status: "accepted",
    reviewedBy: S.headJgz,
    reviewedAt: recordedAt,
    isSample: true,
    ...extra,
  };
}

export function createSeedState(): AppState {
  const now = "2026-10-01T09:00:00.000Z";
  const { roadmap, tasks } = createRoadmap(
    {
      id: RSV_ID,
      disease: { nl: "RSV (respiratoir syncytieel virus)", en: "RSV (respiratory syncytial virus)" },
      targetPopulation: { nl: "Zuigelingen", en: "Infants" },
      geographicScope: { nl: "Curaçao", en: "Curaçao" },
      ownerId: S.epi,
      isSample: true,
    },
    "2026-06-01T09:00:00.000Z",
  );

  roadmap.options = [
    {
      id: "opt-maternal",
      name: { nl: "Maternale RSV-vaccinatie", en: "Maternal RSV vaccination" },
      type: "vaccine",
      description: { nl: "Placeholder — kenmerken nog in te vullen.", en: "Placeholder — characteristics to be completed." },
      sources: "",
      isPlaceholder: true,
    },
    {
      id: "opt-mab",
      name: { nl: "Langwerkend monoklonaal antilichaam voor zuigelingen", en: "Long-acting monoclonal antibody for infants" },
      type: "monoclonal",
      description: { nl: "Placeholder — kenmerken nog in te vullen.", en: "Placeholder — characteristics to be completed." },
      sources: "",
      isPlaceholder: true,
    },
    {
      id: "opt-current",
      name: { nl: "Huidige zorg zonder programma (vergelijking)", en: "Current care without programme (comparator)" },
      type: "other",
      description: { nl: "Vergelijkingsoptie.", en: "Comparator option." },
      sources: "",
      isPlaceholder: true,
    },
  ];

  const criteria = [
    { id: "c-impact", label: { nl: "Verwachte gezondheidswinst (voorbeeldcriterium)", en: "Expected health impact (example criterion)" }, weight: 3 },
    { id: "c-safety", label: { nl: "Veiligheidsprofiel (voorbeeldcriterium)", en: "Safety profile (example criterion)" }, weight: 3 },
    { id: "c-feasibility", label: { nl: "Uitvoerbaarheid (voorbeeldcriterium)", en: "Feasibility of delivery (example criterion)" }, weight: 2 },
    { id: "c-affordability", label: { nl: "Betaalbaarheid (voorbeeldcriterium)", en: "Affordability (example criterion)" }, weight: 2 },
  ];
  const sampleScores: Record<string, number[]> = {
    "opt-maternal": [3, 4, 3, 3],
    "opt-mab": [4, 4, 3, 2],
    "opt-current": [1, 4, 5, 4],
  };
  roadmap.matrix = {
    criteria,
    scaleMax: 5,
    isSample: true,
    scores: Object.fromEntries(
      Object.entries(sampleScores).map(([optId, values]) => [
        optId,
        Object.fromEntries(criteria.map((c, i) => [c.id, { score: values[i], evidence: "" }])),
      ]),
    ),
  };

  const step = (n: number) => roadmap.steps.find((s) => s.stepNo === n)!;
  step(1).approvedScore = 2;
  step(1).summary = { nl: "Voorbeeld: drie opties geïnventariseerd (placeholders).", en: "Sample: three options inventoried (placeholders)." };
  step(2).approvedScore = 2;
  step(2).summary = {
    nl: "Placeholder — nog geen echte ziektelastgegevens ingevoerd.",
    en: "Placeholder — no real disease-burden data entered yet.",
  };
  step(2).uncertainties = { nl: "Placeholder.", en: "Placeholder." };
  step(3).approvedScore = 3;
  step(3).deliberation = {
    date: "2026-09-10",
    participantIds: [S.epi, S.headJgz, S.immun, S.reviewer],
    externalParticipants: "",
    held: true,
    rationale: {
      nl: "Voorbeeld: beraad besloot tot de publieke-gezondheidsroute met twee voorkeursopties (fictief).",
      en: "Sample: deliberation chose the public-health route with two preferred options (fictional).",
    },
  };
  roadmap.pathway = "publicHealth";
  roadmap.preferredOptionIds = ["opt-maternal", "opt-mab"];
  step(4).approvedScore = 1;

  // Task states demonstrating the workflow.
  const setTask = (key: string, patch: Partial<Task>) => {
    const t = tasks.find((x) => x.templateKey === key)!;
    Object.assign(t, patch);
  };
  const doneTask = (key: string, owner: string, start: string, end: string) =>
    setTask(key, { ownerId: owner, status: "done", actualStart: start, actualEnd: end, plannedStart: start, plannedEnd: end });

  doneTask("s1.inventory", S.immun, "2026-06-02", "2026-06-15");
  doneTask("s1.sources", S.immun, "2026-06-10", "2026-06-18");
  doneTask("s1.documents", S.youth, "2026-06-12", "2026-06-20");
  doneTask("s2.collect", S.youth, "2026-06-22", "2026-07-16");
  doneTask("s2.summary", S.youth, "2026-07-10", "2026-07-22");
  doneTask("s2.uncertainties", S.youth, "2026-07-20", "2026-07-25");
  doneTask("s3.prepare", S.epi, "2026-08-10", "2026-08-24");
  doneTask("s3.matrix", S.epi, "2026-08-18", "2026-09-01");
  doneTask("s3.meeting", S.epi, "2026-09-10", "2026-09-10");
  doneTask("s3.minutes", S.headJgz, "2026-09-10", "2026-09-17");
  setTask("s4.paho", { ownerId: S.immun, status: "inProgress", priority: "high", actualStart: "2026-09-15", plannedStart: "2026-09-15", plannedEnd: "2026-10-10" });
  setTask("s4.islandsProcurement", { ownerId: S.epi, status: "inProgress", actualStart: "2026-09-20", plannedStart: "2026-09-20", plannedEnd: "2026-10-30" });
  setTask("s4.islandsBurden", { ownerId: S.youth, status: "notStarted", plannedStart: "2026-10-05", plannedEnd: "2026-10-25" });
  setTask("s5.routes", { ownerId: S.youth, status: "inProgress", actualStart: "2026-09-25", plannedStart: "2026-09-25", plannedEnd: "2026-11-05" });
  setTask("s5.implications", { ownerId: S.immun });
  setTask("s6.decide", { ownerId: S.headJgz });
  setTask("s7.model", { collaboratorIds: [S.reviewer] });

  // Score proposals: approved history for steps 1–4 and one pending proposal for step 5.
  const approved = (
    id: string,
    stepNo: number,
    prev: number,
    score: number,
    proposer: string,
    date: string,
    note: string,
  ): ScoreProposal => ({
    id,
    roadmapId: RSV_ID,
    stepNo,
    previousScore: prev,
    proposedScore: score,
    note,
    proposedBy: proposer,
    proposedAt: `${date}T10:00:00.000Z`,
    status: "approved",
    reviewedBy: S.headJgz,
    reviewedAt: `${date}T14:00:00.000Z`,
    reviewNote: "",
    approvedBy: S.approver,
    approvedAt: `${date}T16:00:00.000Z`,
    approvalNote: "",
  });
  const scoreProposals: ScoreProposal[] = [
    approved("sp-1", 1, 0, 2, S.immun, "2026-06-22", "Voorbeeld / sample"),
    approved("sp-2", 2, 0, 2, S.youth, "2026-07-28", "Voorbeeld / sample"),
    approved("sp-3", 3, 0, 3, S.epi, "2026-09-18", "Voorbeeld: agenda, notulen en uitkomst vastgelegd / sample"),
    approved("sp-4", 4, 0, 1, S.immun, "2026-09-22", "Voorbeeld: PAHO-contact gestart / sample"),
    {
      id: "sp-5",
      roadmapId: RSV_ID,
      stepNo: 5,
      previousScore: 0,
      proposedScore: 1,
      note: "Voorbeeld: werk aan toedieningsroutes is gestart / sample: work on administration routes started",
      proposedBy: S.youth,
      proposedAt: "2026-10-02T10:00:00.000Z",
      status: "proposed",
    },
  ];

  const documents: DocumentMeta[] = [
    exampleDoc("doc-s1-lit", 1, "scientificLiterature", "Voorbeeld: overzicht preventieopties", S.immun, "2026-06-18T12:00:00.000Z", "Fictief voorbeelddocument."),
    exampleDoc("doc-s2-epi", 2, "epidemiologicalReport", "Voorbeeld: geaggregeerd ziektelastrapport (placeholder)", S.youth, "2026-07-16T12:00:00.000Z", "Fictief voorbeelddocument — geen echte gegevens."),
    exampleDoc("doc-s3-agenda", 3, "meetingPreparation", "Voorbeeld: agenda eerste beraad", S.epi, "2026-08-24T12:00:00.000Z", "Fictief voorbeelddocument."),
    exampleDoc("doc-s3-minutes", 3, "meetingMinutes", "Voorbeeld: notulen eerste beraad", S.headJgz, "2026-09-17T12:00:00.000Z", "Fictief voorbeelddocument."),
  ];

  // Accepted durations for the completed RSV tasks (from their actual dates)…
  const durationRecords: DurationRecord[] = tasks
    .filter((t) => t.status === "done" && t.actualStart && t.actualEnd)
    .map((t) => {
      const days = Math.round((Date.parse(t.actualEnd!) - Date.parse(t.actualStart!)) / 86_400_000);
      return sampleDuration(`dr-${t.id}`, RSV_ID, t.stepNo, t.templateKey, t.ownerId!, days, `${t.actualEnd}T12:00:00.000Z`, {
        taskId: t.id,
        estimatedDays: t.estimatedDays,
        method: "dates",
        startDate: t.actualStart,
        endDate: t.actualEnd,
      });
    });
  // …plus fictional observations from an earlier training exercise, so averages and
  // the outlier prompt can be demonstrated (e.g. complete "Contact PAHO" as Ruben).
  durationRecords.push(
    sampleDuration("dr-h1", SAMPLE_HISTORY_ROADMAP_ID, 4, "s4.paho", S.immun, 28, "2025-11-03T12:00:00.000Z", { estimatedDays: 30 }),
    sampleDuration("dr-h2", SAMPLE_HISTORY_ROADMAP_ID, 4, "s4.paho", S.immun, 34, "2026-02-14T12:00:00.000Z", { estimatedDays: 30 }),
    sampleDuration("dr-h3", SAMPLE_HISTORY_ROADMAP_ID, 4, "s4.paho", S.epi, 41, "2026-03-20T12:00:00.000Z", { estimatedDays: 30 }),
    sampleDuration("dr-h4", SAMPLE_HISTORY_ROADMAP_ID, 4, "s4.islandsProcurement", S.epi, 19, "2026-03-28T12:00:00.000Z", { estimatedDays: 21 }),
    sampleDuration("dr-h5", SAMPLE_HISTORY_ROADMAP_ID, 5, "s5.routes", S.youth, 15, "2026-04-15T12:00:00.000Z", { estimatedDays: 14 }),
    sampleDuration("dr-h6", SAMPLE_HISTORY_ROADMAP_ID, 5, "s5.routes", S.youth, 12, "2026-05-02T12:00:00.000Z", { estimatedDays: 14 }),
  );

  const audit: AuditEntry[] = [
    {
      id: "au-seed",
      at: now,
      actorId: S.admin,
      action: "data.reset",
      objectType: "system",
      objectId: "seed",
      objectLabel: "Voorbeeldgegevens geladen / sample data loaded",
    },
  ];

  return {
    schemaVersion: SCHEMA_VERSION,
    roadmaps: [roadmap],
    tasks,
    documents,
    stakeholders: DEMO_STAKEHOLDERS.map((s) => ({ ...s })),
    scoreProposals,
    durationRecords,
    audit,
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}
