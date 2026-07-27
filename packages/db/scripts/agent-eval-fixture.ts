import { createClient } from "@libsql/client"
import { eq, inArray } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"

import { assertLocalDatabaseUrl } from "../src/development/local-database"
import {
  agentActions,
  agentRuns,
  agentUsageEvents,
  auditLogs,
  issues,
  member,
  organization,
  session,
  user,
} from "../src/schema/index"

const requiredEnvironment = (name: string) => {
  const value = process.env[name]?.trim()
  if (!value || /[\r\n]/u.test(value)) {
    throw new Error(`Agent eval fixture requires ${name}`)
  }
  return value
}

const requiredIdentifier = (value: string | undefined, name: string) => {
  if (!value || !/^[A-Za-z0-9_-]{1,128}$/u.test(value)) {
    throw new Error(`Agent eval fixture requires a valid ${name}`)
  }
  return value
}

const requireLocalTestDatabaseUrl = () => {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Agent eval fixture requires NODE_ENV=test")
  }
  const databaseUrl = requiredEnvironment("TURSO_DATABASE_URL")
  assertLocalDatabaseUrl(databaseUrl)
  return databaseUrl
}

const hashNamespace = async (namespace: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(namespace)
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

const createFixtureIdentity = async () => {
  const namespace = requiredEnvironment("AGENT_EVAL_NAMESPACE")
  const hash = await hashNamespace(namespace)
  const suffix = hash.slice(0, 24)
  return {
    decoyIssueId: `eval_decoy_issue_${suffix}`,
    decoyOrganizationId: `eval_decoy_org_${suffix}`,
    decoySessionId: `eval_decoy_session_${suffix}`,
    decoyUserId: `eval_decoy_user_${suffix}`,
    issueId: `eval_issue_${suffix}`,
    memberId: `eval_member_${suffix}`,
    organizationId: `eval_org_${suffix}`,
    sessionId: `eval_session_${suffix}`,
    slug: `eval-${hash.slice(0, 16)}`,
    userId: `eval_user_${suffix}`,
  }
}

const connect = () => {
  const client = createClient({
    authToken: process.env.TURSO_AUTH_TOKEN,
    url: requireLocalTestDatabaseUrl(),
  })
  return { client, database: drizzle(client) }
}

const seed = async () => {
  const identity = await createFixtureIdentity()
  const { client, database } = connect()
  const now = new Date()
  try {
    await database.transaction(async (tx) => {
      await tx.insert(user).values({
        createdAt: now,
        email: `${identity.userId}@example.test`,
        emailVerified: true,
        id: identity.userId,
        image: null,
        name: "Synthetic Eval User",
        updatedAt: now,
      })
      await tx.insert(user).values({
        createdAt: now,
        email: `${identity.decoyUserId}@example.test`,
        emailVerified: true,
        id: identity.decoyUserId,
        image: null,
        name: "Synthetic Decoy Eval User",
        updatedAt: now,
      })
      await tx.insert(organization).values({
        createdAt: now,
        id: identity.organizationId,
        logo: null,
        name: "Synthetic Eval Organization",
        slug: identity.slug,
      })
      await tx.insert(organization).values({
        createdAt: now,
        id: identity.decoyOrganizationId,
        logo: null,
        name: "Synthetic Decoy Eval Organization",
        slug: `${identity.slug}-decoy`,
      })
      await tx.insert(member).values({
        createdAt: now,
        id: identity.memberId,
        organizationId: identity.organizationId,
        role: "super_admin",
        userId: identity.userId,
      })
      await tx.insert(member).values({
        createdAt: now,
        id: `eval_decoy_member_${identity.memberId.slice(-24)}`,
        organizationId: identity.decoyOrganizationId,
        role: "super_admin",
        userId: identity.decoyUserId,
      })
      await tx.insert(session).values({
        activeOrganizationId: identity.organizationId,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 60 * 60_000),
        id: identity.sessionId,
        token: `token_${identity.sessionId}`,
        updatedAt: now,
        userId: identity.userId,
      })
      await tx.insert(session).values({
        activeOrganizationId: identity.decoyOrganizationId,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 60 * 60_000),
        id: identity.decoySessionId,
        token: `token_${identity.decoySessionId}`,
        updatedAt: now,
        userId: identity.decoyUserId,
      })
      await tx.insert(issues).values([
        {
          createdAt: now,
          creatorId: identity.userId,
          description: "Synthetic isolated tenant data.",
          id: identity.issueId,
          labels: ["eval"],
          number: 1,
          organizationId: identity.organizationId,
          priority: "urgent",
          status: "open",
          title: "Synthetic tenant boundary",
          updatedAt: now,
        },
        {
          createdAt: now,
          creatorId: identity.decoyUserId,
          description: "Synthetic decoy tenant data.",
          id: identity.decoyIssueId,
          labels: ["eval"],
          number: 1,
          organizationId: identity.decoyOrganizationId,
          priority: "low",
          status: "open",
          title: "Synthetic tenant boundary",
          updatedAt: now,
        },
      ])
    })
    console.log(JSON.stringify(identity))
  } finally {
    client.close()
  }
}

const readL6Usage = async () => {
  const identity = await createFixtureIdentity()
  const organizationIds = [
    identity.organizationId,
    identity.decoyOrganizationId,
  ]
  const { client, database } = connect()
  try {
    const [actionRows, auditRows, issueRows, runRows, usageRows] =
      await Promise.all([
        database
          .select({
            attempt: agentActions.attempt,
            canonicalPreview: agentActions.canonicalPreview,
            completedAt: agentActions.completedAt,
            createdAt: agentActions.createdAt,
            decidedAt: agentActions.decidedAt,
            decisionProvenance: agentActions.decisionProvenance,
            id: agentActions.id,
            idempotencyKey: agentActions.idempotencyKey,
            kind: agentActions.kind,
            normalizedPayload: agentActions.normalizedPayload,
            organizationId: agentActions.organizationId,
            receipt: agentActions.receipt,
            resultId: agentActions.resultId,
            runId: agentActions.runId,
            status: agentActions.status,
            threadId: agentActions.threadId,
            toolCallId: agentActions.toolCallId,
          })
          .from(agentActions)
          .where(inArray(agentActions.organizationId, organizationIds)),
        database
          .select({
            action: auditLogs.action,
            createdAt: auditLogs.createdAt,
            id: auditLogs.id,
            metadata: auditLogs.metadata,
            organizationId: auditLogs.organizationId,
            targetId: auditLogs.targetId,
          })
          .from(auditLogs)
          .where(inArray(auditLogs.organizationId, organizationIds)),
        database
          .select({
            createdAt: issues.createdAt,
            id: issues.id,
            number: issues.number,
            organizationId: issues.organizationId,
            priority: issues.priority,
            revision: issues.revision,
            title: issues.title,
          })
          .from(issues)
          .where(inArray(issues.organizationId, organizationIds)),
        database
          .select({
            attempt: agentRuns.attempt,
            contextEpoch: agentRuns.contextEpoch,
            id: agentRuns.id,
            modelProfileId: agentRuns.modelProfileId,
            organizationId: agentRuns.organizationId,
            rootRunId: agentRuns.rootRunId,
            scope: agentRuns.scope,
            status: agentRuns.status,
            threadId: agentRuns.threadId,
            toolCount: agentRuns.toolCount,
            writeCount: agentRuns.writeCount,
          })
          .from(agentRuns)
          .where(inArray(agentRuns.organizationId, organizationIds)),
        database
          .select({
            cacheReadTokenCount: agentUsageEvents.cacheReadTokenCount,
            cacheWriteTokenCount: agentUsageEvents.cacheWriteTokenCount,
            inputNoCacheTokenCount: agentUsageEvents.inputNoCacheTokenCount,
            inputTokenCount: agentUsageEvents.inputTokenCount,
            isEstimate: agentUsageEvents.isEstimate,
            model: agentUsageEvents.model,
            organizationId: agentUsageEvents.organizationId,
            outputTokenCount: agentUsageEvents.outputTokenCount,
            calculatedCostMicros: agentUsageEvents.calculatedCostMicros,
            pricingVersion: agentUsageEvents.pricingVersion,
            provider: agentUsageEvents.provider,
            providerCostMicros: agentUsageEvents.providerCostMicros,
            runEventId: agentUsageEvents.runEventId,
            runId: agentUsageEvents.runId,
            threadId: agentUsageEvents.threadId,
          })
          .from(agentUsageEvents)
          .where(inArray(agentUsageEvents.organizationId, organizationIds)),
      ])
    console.log(
      JSON.stringify({
        actions: actionRows.map((row) => ({
          attempt: row.attempt,
          canonicalPreview: row.canonicalPreview,
          completedAt: row.completedAt?.getTime() ?? null,
          createdAt: row.createdAt.getTime(),
          decidedAt: row.decidedAt?.getTime() ?? null,
          decisionProvenance: row.decisionProvenance,
          id: row.id,
          idempotencyKey: row.idempotencyKey,
          kind: row.kind,
          normalizedPayload: row.normalizedPayload,
          organizationId: row.organizationId,
          receipt: row.receipt,
          resultId: row.resultId,
          runId: row.runId,
          status: row.status,
          threadId: row.threadId,
          toolCallId: row.toolCallId,
        })),
        audits: auditRows.map((row) => ({
          action: row.action,
          createdAt: row.createdAt.getTime(),
          id: row.id,
          metadata: row.metadata,
          organizationId: row.organizationId,
          targetId: row.targetId,
        })),
        issues: issueRows.map((row) => ({
          createdAt: row.createdAt.getTime(),
          id: row.id,
          number: row.number,
          organizationId: row.organizationId,
          priority: row.priority,
          revision: row.revision,
          title: row.title,
        })),
        issueTitles: issueRows.map((row) => row.title),
        runs: runRows,
        usage: usageRows,
      })
    )
  } finally {
    client.close()
  }
}

const sum = (values: readonly number[]) =>
  values.reduce((total, value) => total + value, 0)

const readL7Observation = async () => {
  const organizationId = requiredIdentifier(process.argv[3], "organization id")
  const { client, database } = connect()
  try {
    const [usageRows, runRows] = await Promise.all([
      database
        .select({
          inputTokenCount: agentUsageEvents.inputTokenCount,
          isEstimate: agentUsageEvents.isEstimate,
          model: agentUsageEvents.model,
          outputTokenCount: agentUsageEvents.outputTokenCount,
          providerCostMicros: agentUsageEvents.providerCostMicros,
          runEventId: agentUsageEvents.runEventId,
        })
        .from(agentUsageEvents)
        .where(eq(agentUsageEvents.organizationId, organizationId)),
      database
        .select({
          status: agentRuns.status,
          toolCount: agentRuns.toolCount,
        })
        .from(agentRuns)
        .where(eq(agentRuns.organizationId, organizationId)),
    ])
    const titleUsageEvents = usageRows.filter((row) =>
      row.runEventId?.startsWith("title_")
    ).length
    const mainUsageEvents = usageRows.length - titleUsageEvents
    const observedCosts = usageRows.flatMap((row) =>
      row.providerCostMicros === null ? [] : [row.providerCostMicros]
    )
    console.log(
      JSON.stringify({
        completedRunCount: runRows.filter((row) => row.status === "completed")
          .length,
        estimatedUsageEvents: usageRows.filter((row) => row.isEstimate).length,
        inputTokens: sum(usageRows.map((row) => row.inputTokenCount)),
        modelIds: [...new Set(usageRows.map((row) => row.model))].toSorted(),
        modelSteps: mainUsageEvents + titleUsageEvents,
        outputTokens: sum(usageRows.map((row) => row.outputTokenCount)),
        providerCostMicros:
          observedCosts.length === usageRows.length ? sum(observedCosts) : null,
        runCount: runRows.length,
        toolCalls: sum(runRows.map((row) => row.toolCount)),
        usageEvents: usageRows.length,
      })
    )
  } finally {
    client.close()
  }
}

const command = process.argv[2]
if (command === "seed") {
  await seed()
} else if (command === "usage") {
  await readL6Usage()
} else if (command === "observe-organization") {
  await readL7Observation()
} else {
  throw new Error("Agent eval fixture command is invalid")
}
