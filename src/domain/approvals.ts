/**
 * Step 9 approval checklist and the gate for the post-approval implementation phase.
 * Approval, budget and GRC registration are tracked explicitly; nothing is granted
 * automatically by uploading a report or reaching 100 % progress.
 */
import { APPROVAL_KEYS, APPROVAL_SATISFIED_BY, APPROVAL_STATUS_OPTIONS } from "./config";
import type { ApprovalItem, ApprovalKey, ApprovalStatus, Roadmap, Settings } from "./types";

export function defaultApprovals(): ApprovalItem[] {
  return APPROVAL_KEYS.map((key) => ({ key, status: "notStarted", note: "" }));
}

export function approvalItem(roadmap: Roadmap, key: ApprovalKey): ApprovalItem {
  return roadmap.approvals.find((a) => a.key === key) ?? { key, status: "notStarted", note: "" };
}

export function isApprovalSatisfied(item: ApprovalItem): boolean {
  return APPROVAL_SATISFIED_BY[item.key].includes(item.status);
}

export type ApprovalUpdateError = "invalidStatus" | "noteRequired" | "yearRequired";

export function validateApprovalUpdate(key: ApprovalKey, status: ApprovalStatus, note: string, value?: string): ApprovalUpdateError | null {
  if (!APPROVAL_STATUS_OPTIONS[key].includes(status)) return "invalidStatus";
  // Finance "not required" means the expense falls within the GMN budget — document why.
  if (key === "financeApproval" && status === "notRequired" && !note.trim()) return "noteRequired";
  if ((status === "returned" || status === "rejected") && !note.trim()) return "noteRequired";
  if (key === "budgetYear" && status === "done" && !/^\d{4}$/.test(value ?? "")) return "yearRequired";
  return null;
}

export interface ImplementationGate {
  canActivate: boolean;
  missing: ApprovalKey[];
}

/** The implementation phase may only be activated once all configured requirements are met. */
export function implementationGate(roadmap: Roadmap, settings: Settings): ImplementationGate {
  if (roadmap.pathway === "curative") return { canActivate: false, missing: [...settings.implementationRequirements] };
  const missing = settings.implementationRequirements.filter((key) => !isApprovalSatisfied(approvalItem(roadmap, key)));
  return { canActivate: missing.length === 0, missing };
}

/** "Approval requirements recorded" — derived only from explicit approval records. */
export function approvalsRecorded(roadmap: Roadmap, settings: Settings): boolean {
  return implementationGate(roadmap, settings).canActivate;
}
