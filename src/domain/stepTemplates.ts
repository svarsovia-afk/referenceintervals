/**
 * Definitions of the nine core assessment steps and the post-approval phase.
 * Titles, descriptions and default task texts live in the i18n dictionaries
 * (src/i18n) and are looked up by key.
 */

export type StepKind = "work" | "deliberation" | "approval";

export interface StepTemplate {
  stepNo: number;
  kind: StepKind;
  /** Highest readiness score this step can reach. */
  maxScore: 2 | 3;
  optional: boolean;
  /** "publicHealth" steps become not applicable when the curative route is chosen. */
  pathway: "common" | "publicHealth";
  /** Default task templates (keys into i18n `taskTemplates`). */
  tasks: { key: string; estimatedDays: number }[];
}

export const STEP_TEMPLATES: StepTemplate[] = [
  {
    stepNo: 1,
    kind: "work",
    maxScore: 2,
    optional: false,
    pathway: "common",
    tasks: [
      { key: "s1.inventory", estimatedDays: 14 },
      { key: "s1.sources", estimatedDays: 7 },
      { key: "s1.documents", estimatedDays: 7 },
    ],
  },
  {
    stepNo: 2,
    kind: "work",
    maxScore: 2,
    optional: false,
    pathway: "common",
    tasks: [
      { key: "s2.collect", estimatedDays: 21 },
      { key: "s2.summary", estimatedDays: 10 },
      { key: "s2.uncertainties", estimatedDays: 5 },
    ],
  },
  {
    stepNo: 3,
    kind: "deliberation",
    maxScore: 3,
    optional: false,
    pathway: "common",
    tasks: [
      { key: "s3.prepare", estimatedDays: 10 },
      { key: "s3.matrix", estimatedDays: 7 },
      { key: "s3.meeting", estimatedDays: 1 },
      { key: "s3.minutes", estimatedDays: 7 },
    ],
  },
  {
    stepNo: 4,
    kind: "work",
    maxScore: 2,
    optional: false,
    pathway: "publicHealth",
    tasks: [
      { key: "s4.paho", estimatedDays: 30 },
      { key: "s4.islandsProcurement", estimatedDays: 21 },
      { key: "s4.islandsBurden", estimatedDays: 14 },
    ],
  },
  {
    stepNo: 5,
    kind: "work",
    maxScore: 2,
    optional: false,
    pathway: "publicHealth",
    tasks: [
      { key: "s5.routes", estimatedDays: 14 },
      { key: "s5.implications", estimatedDays: 10 },
    ],
  },
  {
    stepNo: 6,
    kind: "work",
    maxScore: 2,
    optional: true,
    pathway: "publicHealth",
    tasks: [
      { key: "s6.decide", estimatedDays: 3 },
      { key: "s6.survey", estimatedDays: 30 },
      { key: "s6.results", estimatedDays: 14 },
    ],
  },
  {
    stepNo: 7,
    kind: "work",
    maxScore: 2,
    optional: false,
    pathway: "publicHealth",
    tasks: [
      { key: "s7.assign", estimatedDays: 3 },
      { key: "s7.model", estimatedDays: 45 },
      { key: "s7.summary", estimatedDays: 10 },
    ],
  },
  {
    stepNo: 8,
    kind: "deliberation",
    maxScore: 3,
    optional: false,
    pathway: "publicHealth",
    tasks: [
      { key: "s8.prepare", estimatedDays: 10 },
      { key: "s8.meeting", estimatedDays: 1 },
      { key: "s8.minutes", estimatedDays: 7 },
      { key: "s8.confirm", estimatedDays: 3 },
    ],
  },
  {
    stepNo: 9,
    kind: "approval",
    maxScore: 2,
    optional: false,
    pathway: "publicHealth",
    tasks: [
      { key: "s9.report", estimatedDays: 14 },
      { key: "s9.submit", estimatedDays: 30 },
      { key: "s9.minister", estimatedDays: 30 },
      { key: "s9.grc", estimatedDays: 30 },
    ],
  },
];

/** Post-approval implementation checklist (not a tenth core step). */
export const IMPLEMENTATION_TEMPLATES: { key: string; estimatedDays: number }[] = [
  { key: "impl.surveillancePlan", estimatedDays: 30 },
  { key: "impl.dsaCmc", estimatedDays: 60 },
  { key: "impl.dsaMls", estimatedDays: 60 },
  { key: "impl.dsaAdc", estimatedDays: 60 },
  { key: "impl.dsaLabdemed", estimatedDays: 60 },
  { key: "impl.dmp", estimatedDays: 30 },
  { key: "impl.privacy", estimatedDays: 30 },
  { key: "impl.reporting", estimatedDays: 21 },
];

export const CORE_STEP_COUNT = STEP_TEMPLATES.length;

export function getTemplate(stepNo: number): StepTemplate {
  const tpl = STEP_TEMPLATES.find((s) => s.stepNo === stepNo);
  if (!tpl) throw new Error(`Unknown step ${stepNo}`);
  return tpl;
}

export const DELIBERATION_STEPS = STEP_TEMPLATES.filter((s) => s.kind === "deliberation").map((s) => s.stepNo);
