/**
 * Core domain model for the Immunization Decision & Implementation Roadmap.
 * Pure data types only — no React, no storage concerns.
 */

export type Lang = "nl" | "en";

/** User-editable content kept in both languages. */
export interface LocalizedText {
  nl: string;
  en: string;
}

export type RoleId = "admin" | "lead" | "taskOwner" | "reviewer" | "approver" | "viewer";

export type PositionKey =
  | "headJgz"
  | "epiManager"
  | "immunizationPhysician"
  | "youthPhysician"
  | "ggdHead"
  | "sectorDirector"
  | "secretaryGeneral"
  | "committeeMember"
  | "laboratory"
  | "clinician"
  | "policyAdvisor"
  | "administrator"
  | "other";

export interface Stakeholder {
  id: string;
  fullName: string;
  email: string;
  position: PositionKey;
  /** Free-text position title, used when position is "other" or to refine it. */
  positionTitle?: string;
  organization: string;
  /** Whether this person is currently covering the position. */
  coveringPosition: boolean;
  roles: RoleId[];
  /** Configurable primary accountable contact for roadmaps (JGZ / EPI). */
  isPrimaryContact: boolean;
  /** Copied on roadmap communications. */
  ccOnCommunications: boolean;
  isDemo: boolean;
}

export type Pathway = "undecided" | "publicHealth" | "curative";

export type OptionType = "vaccine" | "monoclonal" | "other";

export interface PreventionOption {
  id: string;
  name: LocalizedText;
  type: OptionType;
  description: LocalizedText;
  sources: string;
  isPlaceholder: boolean;
}

export interface MatrixCriterion {
  id: string;
  label: LocalizedText;
  weight: number;
}

export interface MatrixCell {
  score?: number;
  evidence: string;
}

export interface WeightedMatrix {
  criteria: MatrixCriterion[];
  scaleMax: number;
  /** scores[optionId][criterionId] */
  scores: Record<string, Record<string, MatrixCell>>;
  /** True while the matrix holds fictional sample scores. */
  isSample: boolean;
}

export interface Deliberation {
  date?: string; // ISO date (yyyy-mm-dd)
  participantIds: string[];
  externalParticipants: string;
  /** Explicit confirmation that the meeting took place. */
  held: boolean;
  rationale: LocalizedText;
}

export interface HandoverRecord {
  recipient: "svb" | "pharmacies" | "clinicians";
  transferred: string;
  recipientContact: string;
  date?: string;
}

export interface CurativeHandover {
  records: HandoverRecord[];
  naReason: string;
}

export interface FinalSelection {
  optionId: string;
  rationale: LocalizedText;
  deviationReason: string;
  uncertainties: LocalizedText;
  nextSteps: LocalizedText;
  confirmedBy: string;
  confirmedAt: string;
}

export interface OptionAssessment {
  optionId: string;
  assigneeId?: string;
  text: LocalizedText;
  implications: LocalizedText;
}

export interface ProcurementInfo {
  pahoContactDate?: string;
  pahoFollowUp: LocalizedText;
  otherIslandsProcurement: LocalizedText;
  otherIslandsBurden: LocalizedText;
}

export type OptionalDecision = "undecided" | "activated" | "skipped";

export interface StepState {
  stepNo: number;
  approvedScore: number;
  notApplicable: boolean;
  naReason?: string;
  /** Why the step is not applicable: curative route or skipped optional step. */
  naSource?: "pathway" | "optionalSkip";
  customDescription?: LocalizedText;
  summary: LocalizedText;
  uncertainties: LocalizedText;
  sources: string;
  /** Step 6 only. */
  optionalDecision?: OptionalDecision;
  optionalReason?: string;
  /** Steps 3 and 8. */
  deliberation?: Deliberation;
  /** Steps 5 and 7. */
  optionAssessments?: OptionAssessment[];
}

export type ApprovalKey =
  | "advisoryReport"
  | "submittedToLeadership"
  | "leadershipApproval"
  | "ministerLetter"
  | "jgzFeedback"
  | "financeApproval"
  | "budgetYear"
  | "grcRequest";

export type ApprovalStatus =
  | "notStarted"
  | "inProgress"
  | "submitted"
  | "approved"
  | "returned"
  | "rejected"
  | "notRequired"
  | "done";

export interface ApprovalItem {
  key: ApprovalKey;
  status: ApprovalStatus;
  date?: string;
  note: string;
  /** budgetYear item stores the intended year here. */
  value?: string;
}

export interface Roadmap {
  id: string;
  disease: LocalizedText;
  targetPopulation: LocalizedText;
  geographicScope: LocalizedText;
  ownerId: string;
  createdAt: string;
  isSample: boolean;
  options: PreventionOption[];
  steps: StepState[];
  pathway: Pathway;
  preferredOptionIds: string[];
  curativeHandover?: CurativeHandover;
  matrix: WeightedMatrix;
  procurement: ProcurementInfo;
  finalSelection?: FinalSelection;
  approvals: ApprovalItem[];
  implementationActive: boolean;
  implementationActivatedAt?: string;
}

export type TaskStatus = "notStarted" | "inProgress" | "blocked" | "done" | "cancelled";
export type Priority = "low" | "normal" | "high";

export interface Task {
  id: string;
  roadmapId: string;
  /** 1–9 for core steps, null for the post-approval implementation phase. */
  stepNo: number | null;
  /** Stable key shared by equivalent tasks across roadmaps (used for averages). */
  templateKey: string;
  title: LocalizedText;
  description: LocalizedText;
  ownerId?: string;
  collaboratorIds: string[];
  status: TaskStatus;
  priority: Priority;
  estimatedDays?: number;
  plannedStart?: string;
  plannedEnd?: string;
  actualStart?: string;
  actualEnd?: string;
  notes: string;
  blocker: string;
}

export type ProposalStatus = "proposed" | "reviewed" | "returned" | "approved";

export interface ScoreProposal {
  id: string;
  roadmapId: string;
  stepNo: number;
  previousScore: number;
  proposedScore: number;
  note: string;
  proposedBy: string;
  proposedAt: string;
  status: ProposalStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalNote?: string;
  /** Set when an administrator resolved the proposal outside the normal workflow. */
  overrideReason?: string;
}

export type DurationStatus = "submitted" | "accepted" | "returned" | "cancelled";

export interface DurationBenchmark {
  kind: "personal" | "overall";
  average: number;
  sampleSize: number;
}

export interface DurationRecord {
  id: string;
  taskId?: string;
  roadmapId: string;
  stepNo: number | null;
  templateKey: string;
  stakeholderId: string;
  estimatedDays?: number;
  actualDays: number;
  method: "dates" | "manual";
  startDate?: string;
  endDate?: string;
  recordedBy: string;
  recordedAt: string;
  benchmark?: DurationBenchmark;
  reason?: string;
  status: DurationStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
  /** Fictional sample observation — never real performance data. */
  isSample: boolean;
}

export type DocumentCategory =
  | "scientificLiterature"
  | "epidemiologicalReport"
  | "procurementCost"
  | "surveyMaterial"
  | "surveyResults"
  | "costEffectiveness"
  | "meetingPreparation"
  | "meetingMinutes"
  | "policyBrief"
  | "advisoryReport"
  | "approvalLetter"
  | "correspondence"
  | "dataSharingAgreement"
  | "dataManagementPlan"
  | "surveillancePlan"
  | "other";

export interface DocumentMeta {
  id: string;
  roadmapId: string;
  stepNo: number | null;
  taskId?: string;
  title: string;
  category: DocumentCategory;
  description: string;
  fileName: string;
  fileType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: string;
  version: number;
  /** Id of the document this one replaced. */
  replacesId?: string;
  /** Set when a newer version replaced this one. */
  supersededById?: string;
  isExample: boolean;
}

export type AuditAction =
  | "roadmap.created"
  | "roadmap.updated"
  | "option.added"
  | "option.updated"
  | "option.removed"
  | "step.updated"
  | "step.markedNotApplicable"
  | "step.restored"
  | "step.optionalDecision"
  | "pathway.changed"
  | "handover.updated"
  | "preferredOptions.changed"
  | "matrix.updated"
  | "deliberation.updated"
  | "finalSelection.recorded"
  | "approval.updated"
  | "implementation.activated"
  | "score.proposed"
  | "score.reviewed"
  | "score.returned"
  | "score.approved"
  | "score.override"
  | "task.created"
  | "task.updated"
  | "task.assigned"
  | "task.statusChanged"
  | "task.estimateChanged"
  | "duration.submitted"
  | "duration.accepted"
  | "duration.returned"
  | "document.uploaded"
  | "document.replaced"
  | "document.deleted"
  | "stakeholder.created"
  | "stakeholder.updated"
  | "settings.updated"
  | "data.reset";

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string;
  action: AuditAction;
  objectType: string;
  objectId: string;
  objectLabel?: string;
  roadmapId?: string;
  previous?: string;
  next?: string;
  reason?: string;
}

export type PermissionKey =
  | "roadmap.create"
  | "roadmap.edit"
  | "task.create"
  | "task.editAny"
  | "task.editOwn"
  | "task.assign"
  | "score.propose"
  | "score.review"
  | "score.approve"
  | "score.override"
  | "document.upload"
  | "document.delete"
  | "deliberation.edit"
  | "pathway.decide"
  | "approval.record"
  | "implementation.activate"
  | "duration.record"
  | "duration.review"
  | "stakeholder.editAny"
  | "stakeholder.editSelf"
  | "history.viewAllTime"
  | "settings.manage";

/** Per-step restriction: only listed stakeholders (plus admins) hold the permission there. */
export type StepPermissionOverrides = Record<number, Partial<Record<"score.review" | "score.approve" | "deliberation.edit", string[]>>>;

export interface Settings {
  rolePermissions: Record<RoleId, PermissionKey[]>;
  stepOverrides: StepPermissionOverrides;
  separationOfDuties: boolean;
  outlierLower: number;
  outlierUpper: number;
  minPersonalSamples: number;
  minOverallSamples: number;
  implementationRequirements: ApprovalKey[];
}

export interface AppState {
  schemaVersion: number;
  roadmaps: Roadmap[];
  tasks: Task[];
  documents: DocumentMeta[];
  stakeholders: Stakeholder[];
  scoreProposals: ScoreProposal[];
  durationRecords: DurationRecord[];
  audit: AuditEntry[];
  settings: Settings;
}
