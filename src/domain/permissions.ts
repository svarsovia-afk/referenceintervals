/**
 * Role-based permission model. In this prototype it is enforced in the domain
 * reducer and the UI only; a production backend must enforce the same rules server-side.
 */
import type { PermissionKey, ScoreProposal, Settings, Stakeholder, Task } from "./types";

export function hasPermission(user: Stakeholder | undefined, permission: PermissionKey, settings: Settings): boolean {
  if (!user) return false;
  return user.roles.some((role) => settings.rolePermissions[role]?.includes(permission));
}

export function isAdmin(user: Stakeholder | undefined): boolean {
  return !!user && user.roles.includes("admin");
}

/** Applies the optional per-step restriction for review/approve/deliberation permissions. */
export function hasStepPermission(
  user: Stakeholder | undefined,
  permission: "score.review" | "score.approve" | "deliberation.edit",
  stepNo: number,
  settings: Settings,
): boolean {
  if (!hasPermission(user, permission, settings)) return false;
  if (isAdmin(user)) return true;
  const restricted = settings.stepOverrides[stepNo]?.[permission];
  if (!restricted || restricted.length === 0) return true;
  return restricted.includes(user!.id);
}

export function canEditTask(user: Stakeholder | undefined, task: Task, settings: Settings): boolean {
  if (!user) return false;
  if (hasPermission(user, "task.editAny", settings)) return true;
  const involved = task.ownerId === user.id || task.collaboratorIds.includes(user.id);
  return involved && hasPermission(user, "task.editOwn", settings);
}

export type WorkflowCheck = { allowed: true } | { allowed: false; reason: "permission" | "separation" | "state" };

export function canReviewProposal(user: Stakeholder | undefined, proposal: ScoreProposal, settings: Settings): WorkflowCheck {
  if (proposal.status !== "proposed") return { allowed: false, reason: "state" };
  if (!hasStepPermission(user, "score.review", proposal.stepNo, settings)) return { allowed: false, reason: "permission" };
  if (settings.separationOfDuties && user!.id === proposal.proposedBy) return { allowed: false, reason: "separation" };
  return { allowed: true };
}

export function canApproveProposal(user: Stakeholder | undefined, proposal: ScoreProposal, settings: Settings): WorkflowCheck {
  if (proposal.status !== "reviewed") return { allowed: false, reason: "state" };
  if (!hasStepPermission(user, "score.approve", proposal.stepNo, settings)) return { allowed: false, reason: "permission" };
  if (settings.separationOfDuties && (user!.id === proposal.proposedBy || user!.id === proposal.reviewedBy)) {
    return { allowed: false, reason: "separation" };
  }
  return { allowed: true };
}

export function canEditStakeholder(user: Stakeholder | undefined, target: Stakeholder, settings: Settings): boolean {
  if (!user) return false;
  if (hasPermission(user, "stakeholder.editAny", settings)) return true;
  return user.id === target.id && hasPermission(user, "stakeholder.editSelf", settings);
}

/** Self-editing users may not change their own roles or application permissions. */
export function canEditRoles(user: Stakeholder | undefined, settings: Settings): boolean {
  return hasPermission(user, "stakeholder.editAny", settings);
}
