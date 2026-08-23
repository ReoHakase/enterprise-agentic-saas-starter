import type { Db } from "@enterprise-agentic-saas/db"
import {
  oauthAccessToken,
  oauthClient,
  oauthRefreshToken,
} from "@enterprise-agentic-saas/db/schema"
import { and, desc, eq, gt, isNull, or } from "drizzle-orm"

import { MCP_PERMISSION_SCOPES, parseMcpOAuthStoredScopes } from "./mcp-oauth"

export type McpOAuthCredentialFamily = {
  clientName: string
  createdAt: Date | null
  credentialId: string
  expiresAt: Date | null
  organizationId: string | null
  refreshable: boolean
  scopes: string[]
}

const permissionScopes = new Set<string>(MCP_PERMISSION_SCOPES)

const parsePermissionScopes = (value: unknown) => {
  const scopes = parseMcpOAuthStoredScopes(value)
  if (!scopes || !scopes.some((scope) => permissionScopes.has(scope))) {
    return null
  }
  return scopes
}

const clientName = (name: string | null) => name?.trim() || "MCP client"

const isEarlier = (left: Date | null | undefined, right: Date | null) =>
  left && (!right || left.getTime() < right.getTime())

const credentialFamilyKey = (clientId: string, organizationId: string | null) =>
  JSON.stringify([clientId, organizationId])

export const listMcpOAuthCredentialFamilies = async (
  database: Db,
  userId: string
): Promise<McpOAuthCredentialFamily[]> => {
  const now = new Date()
  const [accessRows, refreshRows] = await Promise.all([
    database
      .select({
        clientId: oauthAccessToken.clientId,
        clientName: oauthClient.name,
        createdAt: oauthAccessToken.createdAt,
        expiresAt: oauthAccessToken.expiresAt,
        organizationId: oauthAccessToken.referenceId,
        scopes: oauthAccessToken.scopes,
        tokenId: oauthAccessToken.id,
      })
      .from(oauthAccessToken)
      .innerJoin(
        oauthClient,
        eq(oauthClient.clientId, oauthAccessToken.clientId)
      )
      .where(
        and(
          eq(oauthAccessToken.userId, userId),
          gt(oauthAccessToken.expiresAt, now),
          isNull(oauthAccessToken.revoked),
          or(isNull(oauthClient.disabled), eq(oauthClient.disabled, false))
        )
      ),
    database
      .select({
        clientId: oauthRefreshToken.clientId,
        clientName: oauthClient.name,
        createdAt: oauthRefreshToken.createdAt,
        expiresAt: oauthRefreshToken.expiresAt,
        organizationId: oauthRefreshToken.referenceId,
        refreshId: oauthRefreshToken.id,
        scopes: oauthRefreshToken.scopes,
      })
      .from(oauthRefreshToken)
      .innerJoin(
        oauthClient,
        eq(oauthClient.clientId, oauthRefreshToken.clientId)
      )
      .where(
        and(
          eq(oauthRefreshToken.userId, userId),
          gt(oauthRefreshToken.expiresAt, now),
          isNull(oauthRefreshToken.revoked),
          or(isNull(oauthClient.disabled), eq(oauthClient.disabled, false))
        )
      )
      .orderBy(desc(oauthRefreshToken.createdAt)),
  ])

  const families = new Map<string, McpOAuthCredentialFamily>()
  const refreshFamilyIds = new Map<string, string>()
  for (const row of refreshRows) {
    const scopes = parsePermissionScopes(row.scopes)
    if (!scopes) continue
    const familyKey = credentialFamilyKey(row.clientId, row.organizationId)
    if (refreshFamilyIds.has(familyKey)) continue
    const familyId = `r_${row.refreshId}`
    refreshFamilyIds.set(familyKey, familyId)
    families.set(familyId, {
      clientName: clientName(row.clientName),
      createdAt: row.createdAt,
      credentialId: `r_${row.refreshId}`,
      expiresAt: row.expiresAt,
      organizationId: row.organizationId,
      refreshable: true,
      scopes,
    })
  }

  for (const row of accessRows) {
    const scopes = parsePermissionScopes(row.scopes)
    if (!scopes) continue
    const familyId =
      refreshFamilyIds.get(
        credentialFamilyKey(row.clientId, row.organizationId)
      ) ?? `a_${row.tokenId}`
    const existing = families.get(familyId)
    if (!existing) {
      families.set(familyId, {
        clientName: clientName(row.clientName),
        createdAt: row.createdAt,
        credentialId: familyId,
        expiresAt: row.expiresAt,
        organizationId: row.organizationId,
        refreshable: false,
        scopes,
      })
      continue
    }

    if (isEarlier(row.createdAt, existing.createdAt)) {
      existing.createdAt = row.createdAt
    }
    if (!existing.organizationId) existing.organizationId = row.organizationId
    if (!existing.refreshable) {
      existing.expiresAt = row.expiresAt
      existing.scopes = scopes
    }
  }

  return [...families.values()].toSorted((left, right) => {
    const leftTime = left.createdAt?.getTime() ?? 0
    const rightTime = right.createdAt?.getTime() ?? 0
    return rightTime - leftTime
  })
}

export const revokeMcpOAuthCredentialFamily = async (input: {
  database: Db
  credentialId: string
  userId: string
}): Promise<boolean> => {
  const kind = input.credentialId.startsWith("r_")
    ? "r"
    : input.credentialId.startsWith("a_")
      ? "a"
      : null
  const id = kind ? input.credentialId.slice(2) : ""
  if (!kind || !id) return false
  const now = new Date()

  return input.database.transaction(async (tx) => {
    if (kind === "r") {
      const rows = await tx
        .select({
          clientId: oauthRefreshToken.clientId,
          organizationId: oauthRefreshToken.referenceId,
        })
        .from(oauthRefreshToken)
        .where(
          and(
            eq(oauthRefreshToken.id, id),
            eq(oauthRefreshToken.userId, input.userId),
            isNull(oauthRefreshToken.revoked)
          )
        )
        .limit(1)
      if (!rows[0]) return false

      const target = rows[0]
      const refreshOrganization = target.organizationId
        ? eq(oauthRefreshToken.referenceId, target.organizationId)
        : isNull(oauthRefreshToken.referenceId)
      const accessOrganization = target.organizationId
        ? eq(oauthAccessToken.referenceId, target.organizationId)
        : isNull(oauthAccessToken.referenceId)

      await tx
        .update(oauthRefreshToken)
        .set({ revoked: now })
        .where(
          and(
            eq(oauthRefreshToken.clientId, target.clientId),
            eq(oauthRefreshToken.userId, input.userId),
            refreshOrganization
          )
        )
      await tx
        .delete(oauthAccessToken)
        .where(
          and(
            eq(oauthAccessToken.clientId, target.clientId),
            eq(oauthAccessToken.userId, input.userId),
            accessOrganization
          )
        )
      return true
    }

    const rows = await tx
      .delete(oauthAccessToken)
      .where(
        and(
          eq(oauthAccessToken.id, id),
          eq(oauthAccessToken.userId, input.userId)
        )
      )
      .returning({ id: oauthAccessToken.id })
    return rows.length === 1
  })
}
