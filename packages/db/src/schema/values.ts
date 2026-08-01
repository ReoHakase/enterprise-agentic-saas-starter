export const issueStatuses = ["open", "in_progress", "closed"] as const
export type IssueStatus = (typeof issueStatuses)[number]

export const issuePriorities = [
  "no_priority",
  "low",
  "medium",
  "high",
  "urgent",
] as const
export type IssuePriority = (typeof issuePriorities)[number]

export const issueActivityFields = [
  "title",
  "description",
  "status",
  "priority",
  "assignee",
  "labels",
  "due_date",
] as const
export type IssueActivityField = (typeof issueActivityFields)[number]
export const issueActivityKinds = [
  "created",
  "field_changed",
  "legacy_updated",
  "file_added",
  "file_deleted",
] as const
export type IssueActivityKind = (typeof issueActivityKinds)[number]
export type IssueActivityValue = string | string[] | null

export type AuditLogMetadata = Record<string, string | number | boolean | null>

export const MAX_FILE_SIZE_BYTES = 20_000_000 as const
export const ORGANIZATION_FILE_QUOTA_BYTES = 1_073_741_824 as const
export const AGENT_ASSET_MAX_SIZE_BYTES = 10_000_000 as const
export const AGENT_RUN_MAX_ASSET_COUNT = 4 as const
export const AGENT_RUN_MAX_ASSET_BYTES = 20_000_000 as const
export const AGENT_ASSET_MAX_LIFETIME_MS = 604_800_000 as const
export const AGENT_ACTION_MAX_LIFETIME_MS = 900_000 as const
export const AGENT_RESUME_TICKET_MAX_LIFETIME_MS = 60_000 as const

export const fileOwnerTypes = ["issue"] as const
export type FileOwnerType = (typeof fileOwnerTypes)[number]

export const fileStatuses = ["pending", "ready"] as const
export type FileStatus = (typeof fileStatuses)[number]

export const profileImageSubjectTypes = ["user", "organization"] as const
export type ProfileImageSubjectType = (typeof profileImageSubjectTypes)[number]

export const profileImageStatuses = ["pending", "ready", "superseded"] as const
export type ProfileImageStatus = (typeof profileImageStatuses)[number]

export const profileImageCleanupJobStatuses = [
  "pending",
  "processing",
  "failed",
  "completed",
] as const
export type ProfileImageCleanupJobStatus =
  (typeof profileImageCleanupJobStatuses)[number]

export const detectedImageFormats = [
  "jpeg",
  "png",
  "webp",
  "gif",
  "avif",
] as const
export type DetectedImageFormat = (typeof detectedImageFormats)[number]

export const fileCleanupJobKinds = ["exact", "owner_prefix"] as const
export type FileCleanupJobKind = (typeof fileCleanupJobKinds)[number]

export const fileCleanupJobStatuses = [
  "pending",
  "processing",
  "failed",
  "completed",
] as const
export type FileCleanupJobStatus = (typeof fileCleanupJobStatuses)[number]

export const organizationDeletionJobStatuses = [
  "pending",
  "processing",
  "failed",
  "completed",
] as const
export type OrganizationDeletionJobStatus =
  (typeof organizationDeletionJobStatuses)[number]

export const agentThreadStatuses = ["active", "archived"] as const
export type AgentThreadStatus = (typeof agentThreadStatuses)[number]

export const agentThreadTitleStates = ["untitled", "agent", "user"] as const
export type AgentThreadTitleState = (typeof agentThreadTitleStates)[number]

export const agentMessageRoles = ["user", "assistant"] as const
export type AgentMessageRole = (typeof agentMessageRoles)[number]
export type AgentMessageDocument = Record<string, unknown>

export const agentRunStatuses = [
  "running",
  "waiting_approval",
  "completed",
  "failed",
  "canceled",
  "expired",
] as const
export type AgentRunStatus = (typeof agentRunStatuses)[number]

export const agentRunScopes = ["chat", "action_resume"] as const
export type AgentRunScope = (typeof agentRunScopes)[number]

export const agentGrantKinds = ["connection", "run"] as const
export type AgentGrantKind = (typeof agentGrantKinds)[number]

export const storageObjectKeyVersions = [1, 2] as const
export type StorageObjectKeyVersion = (typeof storageObjectKeyVersions)[number]

export const storageObjectStatuses = [
  "pending",
  "ready",
  "deleting",
  "deleted",
] as const
export type StorageObjectStatus = (typeof storageObjectStatuses)[number]

export const storageObjectClaimHolderTypes = [
  "agent_asset",
  "transferring",
  "file",
] as const
export type StorageObjectClaimHolderType =
  (typeof storageObjectClaimHolderTypes)[number]

export const agentAssetStatuses = [
  "pending",
  "ready",
  "promoting",
  "promoted",
  "expired",
  "deleted",
] as const
export type AgentAssetStatus = (typeof agentAssetStatuses)[number]

export const storageObjectCleanupJobStatuses = [
  "pending",
  "processing",
  "failed",
  "completed",
] as const
export type StorageObjectCleanupJobStatus =
  (typeof storageObjectCleanupJobStatuses)[number]

export const agentActionKinds = [
  "create_issue",
  "update_issue",
  "delete_issue",
] as const
export type AgentActionKind = (typeof agentActionKinds)[number]

export const agentActionStatuses = [
  "pending",
  "approved",
  "rejected",
  "expired",
  "canceled",
  "succeeded",
  "conflicted",
] as const
export type AgentActionStatus = (typeof agentActionStatuses)[number]

export const agentDecisionProvenances = ["manual", "auto_policy"] as const
export type AgentDecisionProvenance = (typeof agentDecisionProvenances)[number]

export const agentApprovalPolicyModes = [
  "ask_each",
  "auto_write",
  "auto_all",
] as const
export type AgentApprovalPolicyMode = (typeof agentApprovalPolicyModes)[number]

export const agentThreadPermissionModes = ["ask_always", "full_access"] as const
export type AgentThreadPermissionMode =
  (typeof agentThreadPermissionModes)[number]

export const agentResourceUsageKinds = [
  "asset_upload",
  "vision_transform",
  "write_action",
  "staged_asset",
  "pending_upload",
  "model_run",
  "web_search",
] as const
export type AgentResourceUsageKind = (typeof agentResourceUsageKinds)[number]

export type AgentActionDocument = Record<string, unknown>
