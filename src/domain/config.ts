import type { ApprovalKey, ApprovalStatus, PermissionKey, RoleId, Settings } from "./types";

/** Maximum number of primary items (steps, tasks, documents, history rows) visible at once. */
export const PAGE_SIZE = 6;

export const ALL_ROLES: RoleId[] = ["admin", "lead", "taskOwner", "reviewer", "approver", "viewer"];

export const ALL_PERMISSIONS: PermissionKey[] = [
  "roadmap.create",
  "roadmap.edit",
  "task.create",
  "task.editAny",
  "task.editOwn",
  "task.assign",
  "score.propose",
  "score.review",
  "score.approve",
  "score.override",
  "document.upload",
  "document.delete",
  "deliberation.edit",
  "pathway.decide",
  "approval.record",
  "implementation.activate",
  "duration.record",
  "duration.review",
  "stakeholder.editAny",
  "stakeholder.editSelf",
  "history.viewAllTime",
  "settings.manage",
];

export const DEFAULT_ROLE_PERMISSIONS: Record<RoleId, PermissionKey[]> = {
  admin: [...ALL_PERMISSIONS],
  lead: [
    "roadmap.create",
    "roadmap.edit",
    "task.create",
    "task.editAny",
    "task.editOwn",
    "task.assign",
    "score.propose",
    "score.review",
    "document.upload",
    "document.delete",
    "deliberation.edit",
    "pathway.decide",
    "approval.record",
    "implementation.activate",
    "duration.record",
    "duration.review",
    "stakeholder.editSelf",
    "history.viewAllTime",
  ],
  taskOwner: [
    "task.editOwn",
    "score.propose",
    "document.upload",
    "deliberation.edit",
    "duration.record",
    "stakeholder.editSelf",
  ],
  reviewer: ["score.review", "duration.review", "stakeholder.editSelf"],
  approver: ["score.approve", "approval.record", "stakeholder.editSelf"],
  viewer: ["stakeholder.editSelf"],
};

export const DEFAULT_SETTINGS: Settings = {
  rolePermissions: DEFAULT_ROLE_PERMISSIONS,
  stepOverrides: {},
  separationOfDuties: true,
  outlierLower: 0.7,
  outlierUpper: 1.3,
  minPersonalSamples: 2,
  minOverallSamples: 1,
  implementationRequirements: ["leadershipApproval", "financeApproval"],
};

export const APPROVAL_KEYS: ApprovalKey[] = [
  "advisoryReport",
  "submittedToLeadership",
  "leadershipApproval",
  "ministerLetter",
  "jgzFeedback",
  "financeApproval",
  "budgetYear",
  "grcRequest",
];

/** Statuses a user may choose for each approval checklist item. */
export const APPROVAL_STATUS_OPTIONS: Record<ApprovalKey, ApprovalStatus[]> = {
  advisoryReport: ["notStarted", "inProgress", "done"],
  submittedToLeadership: ["notStarted", "submitted"],
  leadershipApproval: ["notStarted", "submitted", "approved", "returned", "rejected"],
  ministerLetter: ["notStarted", "inProgress", "done"],
  jgzFeedback: ["notStarted", "done"],
  financeApproval: ["notStarted", "submitted", "approved", "rejected", "notRequired"],
  budgetYear: ["notStarted", "done"],
  grcRequest: ["notStarted", "submitted", "approved", "returned"],
};

/** Statuses that satisfy an approval item when it is a configured requirement. */
export const APPROVAL_SATISFIED_BY: Record<ApprovalKey, ApprovalStatus[]> = {
  advisoryReport: ["done"],
  submittedToLeadership: ["submitted"],
  leadershipApproval: ["approved"],
  ministerLetter: ["done"],
  jgzFeedback: ["done"],
  // "notRequired" = expenditure falls within the GMN budget (note required).
  financeApproval: ["approved", "notRequired"],
  budgetYear: ["done"],
  grcRequest: ["approved"],
};
