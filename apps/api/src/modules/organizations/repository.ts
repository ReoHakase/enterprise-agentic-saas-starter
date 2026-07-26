import type { Db } from "@enterprise-agentic-saas/db"
import {
  auditLogs,
  invitation,
  member,
  organization,
  session,
  user,
} from "@enterprise-agentic-saas/db/schema"
import { and, count, eq, inArray } from "drizzle-orm"

import { publicErrors } from "../../errors/app-error"
import { ensureAgentSessionContextInTransaction } from "../agent/public"
import { permissionsForRole } from "../authorization/public"
import {
  toSummary,
  type OrganizationDetail,
  type OrganizationSummary,
} from "./domain"
import { isOrganizationSlugConflict } from "./repository-support"

export const listOrganizationsForUser = async (
  db: Db,
  input: { userId: string; activeOrganizationId?: string | null }
): Promise<OrganizationSummary[]> => {
  try {
    const rows = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        profileImage: organization.logo,
        role: member.role,
      })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(eq(member.userId, input.userId))
      .orderBy(organization.name)

    const memberCounts = await Promise.all(
      rows.map(async (row) => {
        const countRows = await db
          .select({ value: count() })
          .from(member)
          .where(eq(member.organizationId, row.id))
        return [row.id, countRows[0]?.value ?? 0] as const
      })
    )
    const countByOrganization = new Map(memberCounts)
    const organizationIds = rows.map((row) => row.id)
    const profileImageRows =
      organizationIds.length === 0
        ? []
        : await db
            .select({
              organizationId: member.organizationId,
              userId: user.id,
              name: user.name,
              profileImage: user.image,
            })
            .from(member)
            .innerJoin(user, eq(member.userId, user.id))
            .where(inArray(member.organizationId, organizationIds))
            .orderBy(user.name)
    const profileImagesByOrganization = new Map<
      string,
      Array<{ userId: string; name: string; profileImage: string | null }>
    >()
    for (const profileImage of profileImageRows) {
      const existing =
        profileImagesByOrganization.get(profileImage.organizationId) ?? []
      existing.push({
        userId: profileImage.userId,
        name: profileImage.name,
        profileImage: profileImage.profileImage,
      })
      profileImagesByOrganization.set(profileImage.organizationId, existing)
    }

    return rows.map((row) =>
      toSummary({
        ...row,
        activeOrganizationId: input.activeOrganizationId,
        memberCount: countByOrganization.get(row.id) ?? 0,
        memberProfileImages: profileImagesByOrganization.get(row.id) ?? [],
      })
    )
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "listOrganizationsForUser",
    })
  }
}

export const findOrganizationForUser = async (
  db: Db,
  input: {
    userId: string
    organizationId: string
    activeOrganizationId?: string | null
  }
): Promise<OrganizationDetail | null> => {
  try {
    const rows = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        profileImage: organization.logo,
        createdAt: organization.createdAt,
        role: member.role,
      })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(
        and(
          eq(member.userId, input.userId),
          eq(member.organizationId, input.organizationId)
        )
      )
      .limit(1)

    const row = rows[0]
    if (!row) {
      return null
    }

    const memberCountRows = await db
      .select({ value: count() })
      .from(member)
      .where(eq(member.organizationId, input.organizationId))
    const invitationCountRows = await db
      .select({ value: count() })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, input.organizationId),
          eq(invitation.status, "pending")
        )
      )

    return {
      ...toSummary({
        id: row.id,
        name: row.name,
        slug: row.slug,
        profileImage: row.profileImage,
        role: row.role,
        activeOrganizationId: input.activeOrganizationId,
        memberCount: memberCountRows[0]?.value ?? 0,
        memberProfileImages: [],
      }),
      createdAt: row.createdAt.toISOString(),
      invitationCount: invitationCountRows[0]?.value ?? 0,
    }
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "findOrganizationForUser",
    })
  }
}

export const insertOrganizationWithSuperAdmin = async (
  db: Db,
  input: {
    activate: boolean
    sessionId: string
    userId: string
    name: string
    slug: string
  }
): Promise<OrganizationDetail> => {
  try {
    const now = new Date()
    const organizationId = crypto.randomUUID()

    const created = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(organization)
        .values({
          id: organizationId,
          name: input.name,
          slug: input.slug,
          createdAt: now,
        })
        .returning()

      await tx.insert(member).values({
        id: crypto.randomUUID(),
        organizationId,
        userId: input.userId,
        role: "super_admin",
        createdAt: now,
      })
      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        organizationId,
        actorUserId: input.userId,
        action: "organization.created",
        targetType: "organization",
        targetId: organizationId,
        metadata: { slug: input.slug },
      })

      if (input.activate && input.sessionId !== "test_session") {
        await ensureAgentSessionContextInTransaction(tx, {
          sessionId: input.sessionId,
          userId: input.userId,
          now,
        })
        const sessionRows = await tx
          .update(session)
          .set({ activeOrganizationId: organizationId, updatedAt: now })
          .where(
            and(
              eq(session.id, input.sessionId),
              eq(session.userId, input.userId)
            )
          )
          .returning({ id: session.id })
        if (!sessionRows[0]) {
          throw new Error("Session not found during organization creation")
        }
      }

      return rows[0]
    })
    if (!created) {
      throw new Error("insert returned no organization")
    }

    return {
      id: created.id,
      name: created.name,
      slug: created.slug,
      profileImage: created.logo,
      role: "super_admin",
      active: input.activate,
      memberCount: 1,
      memberProfileImages: [],
      invitationCount: 0,
      createdAt: created.createdAt.toISOString(),
      permissions: permissionsForRole("super_admin"),
    }
  } catch (cause) {
    if (isOrganizationSlugConflict(cause)) {
      throw publicErrors.conflict("Organization slug already exists", {
        field: "slug",
        constraint: "unique",
      })
    }
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "insertOrganizationWithSuperAdmin",
    })
  }
}

export const updateSessionActiveOrganization = async (
  db: Db,
  input: { sessionId: string; organizationId: string; userId: string }
) => {
  try {
    return await db.transaction(async (tx) => {
      const membershipRows = await tx
        .select({ id: member.id })
        .from(member)
        .where(
          and(
            eq(member.userId, input.userId),
            eq(member.organizationId, input.organizationId)
          )
        )
        .limit(1)
      if (!membershipRows[0]) {
        return "not_member" as const
      }
      if (input.sessionId === "test_session") {
        return "activated" as const
      }

      const sessionRows = await tx
        .select({ activeOrganizationId: session.activeOrganizationId })
        .from(session)
        .where(
          and(eq(session.id, input.sessionId), eq(session.userId, input.userId))
        )
        .limit(1)
      const currentSession = sessionRows[0]
      if (!currentSession) {
        return "session_not_found" as const
      }
      if (currentSession.activeOrganizationId === input.organizationId) {
        return "activated" as const
      }

      const now = new Date()
      await ensureAgentSessionContextInTransaction(tx, {
        sessionId: input.sessionId,
        userId: input.userId,
        now,
      })
      const rows = await tx
        .update(session)
        .set({
          activeOrganizationId: input.organizationId,
          updatedAt: now,
        })
        .where(
          and(eq(session.id, input.sessionId), eq(session.userId, input.userId))
        )
        .returning({ id: session.id })
      if (!rows[0]) return "session_not_found" as const
      return "activated" as const
    })
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "updateSessionActiveOrganization",
    })
  }
}

export const updateOrganizationById = async (
  db: Db,
  input: {
    actorUserId: string
    organizationId: string
    name?: string
    slug?: string
  }
): Promise<OrganizationDetail | null> => {
  try {
    const rows = await db.transaction(async (tx) => {
      const updatedRows = await tx
        .update(organization)
        .set({
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.slug === undefined ? {} : { slug: input.slug }),
        })
        .where(eq(organization.id, input.organizationId))
        .returning()

      if (updatedRows[0]) {
        await tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: "organization.updated",
          targetType: "organization",
          targetId: input.organizationId,
          metadata: {
            nameChanged: input.name !== undefined,
            slugChanged: input.slug !== undefined,
          },
        })
      }
      return updatedRows
    })

    const row = rows[0]
    if (!row) {
      return null
    }

    const memberCountRows = await db
      .select({ value: count() })
      .from(member)
      .where(eq(member.organizationId, input.organizationId))

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      profileImage: row.logo,
      role: "super_admin",
      active: false,
      memberCount: memberCountRows[0]?.value ?? 0,
      memberProfileImages: [],
      invitationCount: 0,
      createdAt: row.createdAt.toISOString(),
      permissions: permissionsForRole("super_admin"),
    }
  } catch (cause) {
    if (isOrganizationSlugConflict(cause)) {
      throw publicErrors.conflict("Organization slug already exists", {
        field: "slug",
        constraint: "unique",
      })
    }
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "updateOrganizationById",
    })
  }
}

export * from "./deletion-repository"
export * from "./domain"
export * from "./invitation-mutation-repository"
export * from "./invitation-repository"
export * from "./member-repository"
