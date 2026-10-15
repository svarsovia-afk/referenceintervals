import { applyAction, type Action } from "../actions";
import { createSeedState } from "../seed";
import type { AppState } from "../types";

export const NOW = "2026-10-15T12:00:00.000Z";

export function seed(): AppState {
  return createSeedState();
}

/** Applies an action and throws if it fails. */
export function run(state: AppState, action: Action, actor: string): AppState {
  const res = applyAction(state, action, actor, NOW);
  if (!res.ok) throw new Error(`${action.type} failed: ${res.error.code} ${res.error.details?.join(",") ?? ""}`);
  return res.state;
}

export function tryRun(state: AppState, action: Action, actor: string) {
  return applyAction(state, action, actor, NOW);
}

export const U = {
  admin: "sh-admin",
  epi: "sh-epi",
  headJgz: "sh-headjgz",
  immun: "sh-immun",
  youth: "sh-youth",
  reviewer: "sh-reviewer",
  approver: "sh-approver",
  lab: "sh-lab",
};
