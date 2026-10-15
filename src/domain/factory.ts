/**
 * Builds a new roadmap (nine core steps, default tasks, approval checklist and
 * implementation checklist) from the step templates. Used by the "Create roadmap"
 * flow and by the seed data, so new conditions need no code changes.
 */
import { defaultApprovals } from "./approvals";
import { makeId } from "./ids";
import { IMPLEMENTATION_TEMPLATES, STEP_TEMPLATES } from "./stepTemplates";
import type { LocalizedText, Roadmap, StepState, Task } from "./types";
import { DICTIONARIES } from "@/i18n/translate";

export interface NewRoadmapInput {
  id?: string;
  disease: LocalizedText;
  targetPopulation: LocalizedText;
  geographicScope: LocalizedText;
  ownerId: string;
  isSample?: boolean;
}

const empty = (): LocalizedText => ({ nl: "", en: "" });

export function templateText(key: string, field: "title" | "description"): LocalizedText {
  const nlT = (DICTIONARIES.nl.taskTemplates as Record<string, { title: string; description: string }>)[key];
  const enT = (DICTIONARIES.en.taskTemplates as Record<string, { title: string; description: string }>)[key];
  return { nl: nlT?.[field] ?? key, en: enT?.[field] ?? key };
}

export function newStepState(stepNo: number): StepState {
  const tpl = STEP_TEMPLATES.find((s) => s.stepNo === stepNo)!;
  const step: StepState = {
    stepNo,
    approvedScore: 0,
    notApplicable: false,
    summary: empty(),
    uncertainties: empty(),
    sources: "",
  };
  if (tpl.kind === "deliberation") {
    step.deliberation = { participantIds: [], externalParticipants: "", held: false, rationale: empty() };
  }
  if (tpl.optional) step.optionalDecision = "undecided";
  if (stepNo === 5 || stepNo === 7) step.optionAssessments = [];
  return step;
}

export function newTask(partial: Partial<Task> & Pick<Task, "roadmapId" | "stepNo" | "templateKey" | "title">): Task {
  return {
    id: partial.id ?? makeId("task"),
    description: empty(),
    collaboratorIds: [],
    status: "notStarted",
    priority: "normal",
    notes: "",
    blocker: "",
    ...partial,
  };
}

export function createRoadmap(input: NewRoadmapInput, nowIso: string): { roadmap: Roadmap; tasks: Task[] } {
  const id = input.id ?? makeId("roadmap");
  const roadmap: Roadmap = {
    id,
    disease: input.disease,
    targetPopulation: input.targetPopulation,
    geographicScope: input.geographicScope,
    ownerId: input.ownerId,
    createdAt: nowIso,
    isSample: input.isSample ?? false,
    options: [],
    steps: STEP_TEMPLATES.map((t) => newStepState(t.stepNo)),
    pathway: "undecided",
    preferredOptionIds: [],
    matrix: { criteria: [], scaleMax: 5, scores: {}, isSample: false },
    procurement: { pahoFollowUp: empty(), otherIslandsProcurement: empty(), otherIslandsBurden: empty() },
    approvals: defaultApprovals(),
    implementationActive: false,
  };

  const tasks: Task[] = [];
  for (const tpl of STEP_TEMPLATES) {
    for (const t of tpl.tasks) {
      tasks.push(
        newTask({
          id: `${id}-${t.key}`,
          roadmapId: id,
          stepNo: tpl.stepNo,
          templateKey: t.key,
          title: templateText(t.key, "title"),
          description: templateText(t.key, "description"),
          ownerId: input.ownerId,
          estimatedDays: t.estimatedDays,
        }),
      );
    }
  }
  for (const t of IMPLEMENTATION_TEMPLATES) {
    tasks.push(
      newTask({
        id: `${id}-${t.key}`,
        roadmapId: id,
        stepNo: null,
        templateKey: t.key,
        title: templateText(t.key, "title"),
        description: templateText(t.key, "description"),
        ownerId: input.ownerId,
        estimatedDays: t.estimatedDays,
      }),
    );
  }
  return { roadmap, tasks };
}
