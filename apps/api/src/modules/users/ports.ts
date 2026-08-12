import type { McpOAuthCredentialFamily } from "@enterprise-agentic-saas/auth/mcp-oauth-credentials"

import type { OrganizationSummary } from "../organizations/public"

export type UserProfile = {
  email: string
  id: string
  name: string
  profileImage: string | null
}

export type UserSession = {
  createdAt: string
  current: boolean
  expiresAt: string
  id: string
  ipAddress: string | null
  updatedAt: string
  userAgent: string | null
}

export type UsersPorts = {
  deleteOtherSessions(input: {
    currentSessionId: string
    userId: string
  }): Promise<{ revoked: number }>
  deleteSession(input: {
    sessionId: string
    userId: string
  }): Promise<{ id: string } | null>
  findUser(userId: string): Promise<UserProfile | null>
  listMcpOAuthCredentials(userId: string): Promise<McpOAuthCredentialFamily[]>
  listOrganizations(input: {
    activeOrganizationId?: null | string
    userId: string
  }): Promise<OrganizationSummary[]>
  listSessions(input: {
    currentSessionId: string
    userId: string
  }): Promise<UserSession[]>
  revokeMcpOAuthCredential(input: {
    credentialId: string
    userId: string
  }): Promise<boolean>
  resolveActiveOrganization(input: {
    activeOrganizationId?: null | string
    sessionId: string
    userId: string
  }): Promise<null | string>
  updateUser(input: {
    name: string
    userId: string
  }): Promise<UserProfile | null>
}
