import type { Db } from "@enterprise-agentic-saas/db"
import { mcpToolOperations } from "@enterprise-agentic-saas/db/schema"
import { and, eq } from "drizzle-orm"
import * as v from "valibot"

import { HttpError } from "../../errors/http-error"
import type { McpPrincipal } from "../principal"
import type { McpTransaction } from "./write-support"

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`
  }
  const entries = Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .toSorted(([left], [right]) => left.localeCompare(right))
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`
}

const sha256 = async (value: unknown) => {
  const bytes = new TextEncoder().encode(canonicalJson(value))
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

const retryableDatabaseRace = (cause: unknown) => {
  const messages: string[] = []
  let current = cause
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof Error) messages.push(current.message)
    if (typeof current !== "object") break
    current = Reflect.get(current, "cause")
  }
  const diagnostic = messages.join(" ")
  return (
    diagnostic.includes("SQLITE_BUSY") ||
    diagnostic.includes("SQLITE_LOCKED") ||
    diagnostic.includes("database is locked") ||
    diagnostic.includes("issues_organization_number_uidx") ||
    diagnostic.includes("issues.organization_id, issues.number") ||
    diagnostic.includes("mcp_tool_operations_idempotency_uidx") ||
    diagnostic.includes("mcp_tool_operations.organization_id")
  )
}

const storedReceipt = <Output>(
  schema: v.BaseSchema<unknown, Output, v.BaseIssue<unknown>>,
  value: unknown
) => {
  const parsed = v.safeParse(schema, value)
  if (!parsed.success) throw new Error("Stored MCP receipt is invalid")
  return parsed.output
}

const receiptRecord = (receipt: unknown): Record<string, unknown> => {
  if (
    receipt === null ||
    typeof receipt !== "object" ||
    Array.isArray(receipt)
  ) {
    throw new Error("MCP receipt must be an object")
  }
  return Object.fromEntries(Object.entries(receipt))
}

export const runIdempotently = async <Output>(input: {
  authorize?: (tx: McpTransaction) => Promise<void>
  db: Db
  idempotencyKey: string
  payload: unknown
  principal: McpPrincipal
  schema: v.BaseSchema<unknown, Output, v.BaseIssue<unknown>>
  toolName: string
  mutate: (tx: McpTransaction, operationId: string) => Promise<Output>
}): Promise<Output> => {
  const payloadDigest = await sha256(input.payload)
  const attempt = async (number: number): Promise<Output> => {
    try {
      return await input.db.transaction(async (tx) => {
        await input.authorize?.(tx)
        const rows = await tx
          .select({
            payloadDigest: mcpToolOperations.payloadDigest,
            receipt: mcpToolOperations.receipt,
          })
          .from(mcpToolOperations)
          .where(
            and(
              eq(
                mcpToolOperations.organizationId,
                input.principal.organizationId
              ),
              eq(mcpToolOperations.userId, input.principal.userId),
              eq(mcpToolOperations.clientId, input.principal.clientId),
              eq(mcpToolOperations.toolName, input.toolName),
              eq(mcpToolOperations.idempotencyKey, input.idempotencyKey)
            )
          )
          .limit(1)
        const existing = rows[0]
        if (existing) {
          if (existing.payloadDigest !== payloadDigest) {
            throw new HttpError({ code: "conflict" })
          }
          return {
            ...storedReceipt(input.schema, existing.receipt),
            replayed: true,
          }
        }

        const operationId = crypto.randomUUID()
        const receipt = await input.mutate(tx, operationId)
        await tx.insert(mcpToolOperations).values({
          id: operationId,
          organizationId: input.principal.organizationId,
          userId: input.principal.userId,
          clientId: input.principal.clientId,
          toolName: input.toolName,
          idempotencyKey: input.idempotencyKey,
          payloadDigest,
          receipt: receiptRecord(receipt),
          createdAt: new Date(),
        })
        return receipt
      })
    } catch (cause) {
      if (number < 3 && retryableDatabaseRace(cause)) {
        return attempt(number + 1)
      }
      throw cause
    }
  }
  return attempt(1)
}
