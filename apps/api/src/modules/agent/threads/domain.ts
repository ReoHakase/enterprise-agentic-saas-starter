import type { OrganizationRole } from "../../authorization/public"

export type LiveSession = {
  id: string
  userId: string
  activeOrganizationId: string
}

export type ValidGrant = {
  organizationId: string
  threadId: string
  runId: string | null
  sessionId: string
  userId: string
  contextEpoch: number
  webSearchQueryHash: string | null
  role: OrganizationRole
  runStatus:
    | "running"
    | "waiting_approval"
    | "completed"
    | "failed"
    | "canceled"
    | "expired"
    | null
  runScope: "chat" | "action_resume" | null
  rootRunId: string | null
  resumedActionId: string | null
}

export const AGENT_GRANT_TTL_MS = 5 * 60_000
