import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { McpPermissionScope } from "@enterprise-agentic-saas/auth/mcp-oauth"
import * as schema from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { afterEach, describe, expect, it } from "vitest"

import { HttpError } from "../../errors/http-error"
import {
  createRuntime,
  pngBytes,
} from "../../modules/files/agent-assets.test-support"
import {
  configureFileStorageRuntime,
  resetFileStorageRuntimeForTest,
} from "../../modules/files/public"
import type { McpPrincipal } from "../principal"
import { createMcpServer } from "../server"
import { handleMcpRequest, MCP_HTTP_PATH } from "../transport"
import { createMcpTools } from "./catalog"
import { toMcpToolError } from "./errors"
import { createMcpReadApplication } from "./read-application"
import { uploadMcpAttachment } from "./upload-application"
import { createMcpWriteApplication } from "./write-application"

const migrationsFolder = new URL(
  "../../../../../packages/db/drizzle-v3",
  import.meta.url
).pathname

const clients: Array<ReturnType<typeof createClient>> = []
const databasePaths: string[] = []

const callMcp = async (
  server: ReturnType<typeof createMcpServer>,
  body: Record<string, unknown>
) => {
  const response = await handleMcpRequest(
    server,
    new Request(`https://api.example.test${MCP_HTTP_PATH}`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        host: "api.example.test",
      },
      body: JSON.stringify(body),
    })
  )
  expect(response.status).toBe(200)
  expect(response.headers.get("content-type")).toContain("application/json")
  const parsed: unknown = JSON.parse(await response.text())
  return parsed
}

const hasErrorCode = (value: unknown, code: string) => {
  let current = value
  for (let depth = 0; depth < 4; depth += 1) {
    if (
      typeof current === "object" &&
      current !== null &&
      Reflect.get(current, "code") === code
    ) {
      return true
    }
    if (!(current instanceof Error)) return false
    current = current.cause
  }
  return false
}

afterEach(async () => {
  resetFileStorageRuntimeForTest()
  for (const client of clients.splice(0)) client.close()
  await Promise.all(
    databasePaths.splice(0).map((path) => rm(path, { force: true }))
  )
})

const principal = (
  scopes: readonly McpPermissionScope[] = [
    "account:read",
    "organization:read",
    "members:read",
    "issues:read",
    "issues:create",
    "issues:update",
    "issues:delete",
    "files:read",
    "files:write",
  ]
): McpPrincipal => ({
  audience: "https://api.example.test/mcp",
  clientId: "mcp-client-a",
  organizationId: "mcp-org-a",
  role: "owner",
  scopes: new Set(scopes),
  type: "oauth-user",
  userId: "mcp-user-a",
})

const createFixture = async () => {
  const databasePath = join(tmpdir(), `mcp-tools-${crypto.randomUUID()}.db`)
  databasePaths.push(databasePath)
  const client = createClient({ url: `file:${databasePath}` })
  clients.push(client)
  const db = drizzle({ client, relations: schema.relations })
  await migrate(db, { migrationsFolder })
  const now = new Date()
  await db.insert(schema.user).values([
    {
      id: "mcp-user-a",
      name: "MCP User A",
      email: "mcp-a@example.test",
      image: "https://public.example.test/mcp-user-a.webp",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "mcp-user-b",
      name: "MCP User B",
      email: "mcp-b@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
  ])
  await db.insert(schema.organization).values([
    {
      id: "mcp-org-a",
      name: "MCP Org A",
      slug: "mcp-org-a",
      createdAt: now,
    },
    {
      id: "mcp-org-b",
      name: "MCP Org B",
      slug: "mcp-org-b",
      createdAt: now,
    },
  ])
  await db.insert(schema.member).values([
    {
      id: "mcp-member-a",
      organizationId: "mcp-org-a",
      userId: "mcp-user-a",
      role: "owner",
      createdAt: now,
    },
    {
      id: "mcp-member-b",
      organizationId: "mcp-org-b",
      userId: "mcp-user-b",
      role: "owner",
      createdAt: now,
    },
  ])
  await db.insert(schema.oauthClient).values({
    id: "mcp-client-row-a",
    clientId: "mcp-client-a",
    redirectUris: ["https://client.example.test/callback"],
    userId: "mcp-user-a",
    createdAt: now,
    updatedAt: now,
    public: true,
  })
  await db.insert(schema.issues).values({
    id: "other-issue",
    organizationId: "mcp-org-b",
    number: 1,
    title: "Other tenant",
    creatorId: "mcp-user-b",
    createdAt: now,
    updatedAt: now,
  })
  return { db }
}

describe("MCP business tools", () => {
  it("registers the complete catalog with JSON Schema uniqueness", async () => {
    const { db } = await createFixture()
    await db.insert(schema.issues).values({
      id: "mcp-issue-a",
      organizationId: "mcp-org-a",
      number: 1,
      title: "MCP Issue A",
      creatorId: "mcp-user-a",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const server = createMcpServer({ tools: createMcpTools(db, principal()) })
    const { tools } = await server.getToolListInfo()

    expect(tools).toHaveLength(14)
    expect(
      tools.find(({ name }) => name === "add_issue_attachments")
    ).toMatchObject({
      inputSchema: {
        properties: { assetIds: { uniqueItems: true } },
      },
    })
    expect(tools.find(({ name }) => name === "search_issues")).toMatchObject({
      outputSchema: {
        type: "object",
        properties: { items: { type: "array" } },
      },
    })
    expect(
      tools.find(({ name }) => name === "read_account_context")
    ).toMatchObject({
      description:
        "Read the current user's allowlisted display profile. This never returns credentials or account settings.",
    })
    const getIssue = tools.find(({ name }) => name === "get_issue")
    expect(getIssue).toMatchObject({
      description:
        'Read one Issue in the active organization. For Issue #N use {"lookup":"number","number":N}; for an opaque ID use {"lookup":"id","id":"..."}.',
      inputSchema: {
        additionalProperties: false,
        properties: {
          attachmentCursor: {
            maxLength: 1_024,
            minLength: 1,
            type: "string",
          },
          attachmentLimit: {
            maximum: 100,
            minimum: 1,
            type: "integer",
          },
          id: expect.any(Object),
          lookup: { enum: ["id", "number"] },
          number: {
            maximum: 2_147_483_647,
            minimum: 1,
            type: "integer",
          },
        },
        required: ["lookup"],
        type: "object",
      },
    })
    expect(getIssue?.inputSchema).not.toHaveProperty("oneOf")

    await expect(
      server.executeTool("read_account_context", {})
    ).resolves.toEqual({
      name: "MCP User A",
      profileImage: "https://public.example.test/mcp-user-a.webp",
    })
    await expect(
      server.executeTool("get_issue", { lookup: "id", id: "mcp-issue-a" })
    ).resolves.toMatchObject({ id: "mcp-issue-a", number: 1 })
    await expect(
      server.executeTool("get_issue", { lookup: "number", number: 1 })
    ).resolves.toMatchObject({ id: "mcp-issue-a", number: 1 })

    const lookupFailures = await Promise.all(
      [{ lookup: "id", id: "mcp-issue-a", number: 1 }, { lookup: "id" }].map(
        (input) =>
          server.executeTool("get_issue", input).then(
            () => undefined,
            (error: unknown) => error
          )
      )
    )
    for (const failure of lookupFailures) {
      expect(failure).toBeInstanceOf(Error)
      expect(hasErrorCode(failure, "retryable_internal")).toBe(true)
    }

    await callMcp(server, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "catalog-test", version: "1.0.0" },
      },
    })
    const listed = await callMcp(server, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    })
    expect(listed).toMatchObject({
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({
            name: "read_account_context",
            annotations: {
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: false,
              readOnlyHint: true,
            },
            description:
              "Read the current user's allowlisted display profile. This never returns credentials or account settings.",
          }),
          expect.objectContaining({
            name: "get_issue",
            annotations: {
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: false,
              readOnlyHint: true,
            },
            description:
              'Read one Issue in the active organization. For Issue #N use {"lookup":"number","number":N}; for an opaque ID use {"lookup":"id","id":"..."}.',
            inputSchema: expect.objectContaining({
              additionalProperties: false,
              required: ["lookup"],
              type: "object",
            }),
          }),
        ]),
      },
    })
    const called = await callMcp(server, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "get_issue",
        arguments: { lookup: "id", id: "mcp-issue-a" },
      },
    })
    expect(called).toMatchObject({
      result: {
        content: [
          { type: "text", text: expect.stringContaining('"mcp-issue-a"') },
        ],
        isError: false,
      },
    })
    const mixed = await callMcp(server, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "get_issue",
        arguments: { lookup: "id", id: "mcp-issue-a", number: 1 },
      },
    })
    expect(mixed).toMatchObject({
      result: {
        content: [
          {
            type: "text",
            text: expect.stringContaining("retryable_internal"),
          },
        ],
        isError: true,
      },
    })
  })
})

describe("MCP authorization and writes", () => {
  it("filters the explicit catalog by the credential scopes", async () => {
    const { db } = await createFixture()
    expect(
      Object.keys(
        createMcpTools(db, principal(["issues:read", "files:read"]))
      ).toSorted()
    ).toEqual(
      [
        "get_issue",
        "read_issue_attachment_image",
        "search_issue_labels",
        "search_issues",
      ].toSorted()
    )
    await expect(
      createMcpReadApplication(
        db,
        principal(["organization:read"])
      ).readActiveOrganization()
    ).resolves.toMatchObject({
      permissions: {
        canCreateIssues: false,
        canDeleteAnyIssue: false,
        canDeleteOwnIssues: false,
        canReadIssues: false,
        canUpdateIssues: false,
      },
    })
    await expect(
      createMcpWriteApplication(db, principal(["issues:create"])).createIssue({
        attachmentAssetIds: ["ready-from-older-token"],
        idempotencyKey: "create_issue_without_files_01",
        title: "No file scope",
      })
    ).rejects.toMatchObject({ code: "forbidden" })
  })

  it.each([
    { allowed: true, creatorId: "mcp-user-b", role: "owner" },
    { allowed: true, creatorId: "mcp-user-b", role: "admin" },
    { allowed: true, creatorId: "mcp-user-a", role: "member" },
    { allowed: false, creatorId: "mcp-user-b", role: "member" },
  ] as const)(
    "enforces the current $role role for deleting a $creatorId Issue",
    async ({ allowed, creatorId, role }) => {
      const { db } = await createFixture()
      await db
        .update(schema.member)
        .set({ role })
        .where(eq(schema.member.id, "mcp-member-a"))
      await db.insert(schema.issues).values({
        id: `role-delete-${role}-${creatorId}`,
        organizationId: "mcp-org-a",
        number: 1,
        title: "Role authorization target",
        creatorId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      expect(createMcpTools(db, principal(["issues:delete"]))).toHaveProperty(
        "delete_issue"
      )
      const write = createMcpWriteApplication(db, principal(["issues:delete"]))
      const deletion = write.deleteIssue({
        expectedRevision: 1,
        idempotencyKey: `role-delete-${role}-${creatorId}-0001`,
        issueId: `role-delete-${role}-${creatorId}`,
      })
      const outcome = await deletion.then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason) => ({ reason, status: "rejected" as const })
      )

      expect(outcome).toMatchObject(
        allowed
          ? {
              status: "fulfilled",
              value: {
                issue: {
                  deleted: true,
                  id: `role-delete-${role}-${creatorId}`,
                },
              },
            }
          : { reason: { code: "forbidden" }, status: "rejected" }
      )
    }
  )

  it("executes direct Issue writes once and replays only the same payload", async () => {
    const { db } = await createFixture()
    const write = createMcpWriteApplication(db, principal())
    const input = {
      idempotencyKey: "create_issue_request_0001",
      description: "  MCP description  ",
      title: "  MCP Issue  ",
      labels: ["MCP", "mcp"],
    }
    const results = await Promise.all([
      write.createIssue(input),
      write.createIssue(input),
    ])
    const first = results.find((result) => !result.replayed)
    const replay = results.find((result) => result.replayed)

    expect(first).toMatchObject({ replayed: false, issue: { revision: 1 } })
    expect(replay).toEqual({ ...first, replayed: true })
    await expect(
      db
        .select({
          description: schema.issues.description,
          labels: schema.issues.labels,
          title: schema.issues.title,
        })
        .from(schema.issues)
        .where(eq(schema.issues.id, first?.issue.id ?? ""))
    ).resolves.toEqual([
      {
        description: "MCP description",
        labels: ["MCP"],
        title: "MCP Issue",
      },
    ])
    await expect(db.select().from(schema.issues)).resolves.toHaveLength(2)
    await expect(
      db.select().from(schema.mcpToolOperations)
    ).resolves.toHaveLength(1)
    await expect(
      write.createIssue({ ...input, title: "Different payload" })
    ).rejects.toMatchObject({ code: "conflict" })

    await expect(
      createMcpReadApplication(db, principal()).getIssue({
        lookup: "id",
        id: "other-issue",
      })
    ).rejects.toMatchObject({ code: "not_found" })
    await expect(
      write.updateIssue({
        expectedRevision: 1,
        idempotencyKey: "cross_tenant_update_0001",
        issueId: "other-issue",
        title: "Hidden",
      })
    ).rejects.toMatchObject({ code: "not_found" })
  })

  it("rejects blank upload metadata and preserves retryable errors", async () => {
    const { db } = await createFixture()
    const write = createMcpWriteApplication(db, principal())

    await expect(
      write.createAttachmentUploadSession({
        declaredContentType: "image/png",
        filename: "   ",
        idempotencyKey: "upload_session_blank_filename_0001",
        sizeBytes: 32,
      })
    ).rejects.toMatchObject({ code: "validation_error" })
    await expect(
      write.createAttachmentUploadSession({
        declaredContentType: "   ",
        filename: "attachment.png",
        idempotencyKey: "upload_session_blank_content_type_0001",
        sizeBytes: 32,
      })
    ).rejects.toMatchObject({ code: "validation_error" })
    expect(
      toMcpToolError(new HttpError({ code: "rate_limited" }))
    ).toMatchObject({ code: "rate_limited" })
  })

  it("rechecks current membership before replaying a destructive operation", async () => {
    const { db } = await createFixture()
    expect(createMcpTools(db, principal())).toHaveProperty("delete_issue")
    await db
      .update(schema.member)
      .set({ role: "member" })
      .where(eq(schema.member.id, "mcp-member-a"))
    await db.insert(schema.issues).values({
      id: "member-owned-by-another-user",
      organizationId: "mcp-org-a",
      number: 2,
      title: "Another user's Issue",
      creatorId: "mcp-user-b",
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await expect(
      createMcpWriteApplication(db, principal()).deleteIssue({
        expectedRevision: 1,
        idempotencyKey: "delete_after_membership_downgrade_0001",
        issueId: "member-owned-by-another-user",
      })
    ).rejects.toMatchObject({ code: "forbidden" })
  })

  it("rejects a different body when another uploader wins the only-if race", async () => {
    const { db } = await createFixture()
    const activePrincipal = principal()
    const write = createMcpWriteApplication(db, activePrincipal)
    const bytes = pngBytes()
    const session = await write.createAttachmentUploadSession({
      declaredContentType: "image/png",
      filename: "race.png",
      idempotencyKey: "upload_session_race_0001",
      sizeBytes: bytes.byteLength,
    })
    const runtime = createRuntime()
    configureFileStorageRuntime(runtime.runtime)
    const winnerBytes = Uint8Array.from(bytes)
    const lastIndex = winnerBytes.length - 1
    if (lastIndex < 0) throw new Error("test fixture bytes are empty")
    winnerBytes[lastIndex] = (winnerBytes[lastIndex] ?? 0) ^ 1
    const originalPut = runtime.put.getMockImplementation()
    if (!originalPut)
      throw new Error("test runtime put implementation is missing")
    runtime.put.mockImplementationOnce(async (key, _value, options) => {
      await originalPut(key, new Blob([winnerBytes]).stream(), options)
      return null
    })

    await expect(
      uploadMcpAttachment({
        db,
        principal: activePrincipal,
        uploadId: session.uploadId,
        request: new Request(session.uploadUrl, {
          method: "PUT",
          headers: {
            "content-length": String(bytes.byteLength),
            "content-type": "image/png",
          },
          body: bytes,
        }),
      })
    ).rejects.toMatchObject({ code: "conflict" })
    await expect(
      createMcpReadApplication(db, activePrincipal).getAttachmentUploadStatus({
        uploadId: session.uploadId,
      })
    ).resolves.toMatchObject({ status: "pending" })
  })

  it("uploads privately, promotes once, and keeps Issue revision and quota atomic", async () => {
    const { db } = await createFixture()
    const activePrincipal = principal()
    const write = createMcpWriteApplication(db, activePrincipal)
    const issue = await write.createIssue({
      idempotencyKey: "create_issue_request_0002",
      title: "Attachment target",
    })
    const bytes = pngBytes()
    const session = await write.createAttachmentUploadSession({
      declaredContentType: "image/png",
      filename: "attachment.png",
      idempotencyKey: "upload_session_request_0001",
      sizeBytes: bytes.byteLength,
    })
    const runtime = createRuntime()
    configureFileStorageRuntime(runtime.runtime)
    await expect(
      uploadMcpAttachment({
        db,
        principal: principal(["files:read"]),
        uploadId: session.uploadId,
        request: new Request(session.uploadUrl, {
          method: "PUT",
          headers: {
            "content-length": String(bytes.byteLength),
            "content-type": "image/png",
          },
          body: bytes,
        }),
      })
    ).rejects.toMatchObject({ code: "forbidden" })
    const uploadResponse = await uploadMcpAttachment({
      db,
      principal: activePrincipal,
      uploadId: session.uploadId,
      request: new Request(session.uploadUrl, {
        method: "PUT",
        headers: {
          "content-length": String(bytes.byteLength),
          "content-type": "image/png",
        },
        body: bytes,
      }),
    })
    expect(uploadResponse.status).toBe(204)
    await expect(
      createMcpReadApplication(db, activePrincipal).getAttachmentUploadStatus({
        uploadId: session.uploadId,
      })
    ).resolves.toMatchObject({ assetId: session.uploadId, status: "ready" })

    const attachInput = {
      assetIds: [session.uploadId],
      expectedRevision: issue.issue.revision,
      idempotencyKey: "attach_issue_request_0001",
      issueId: issue.issue.id,
    }
    const attached = await write.addIssueAttachments(attachInput)
    const replay = await write.addIssueAttachments(attachInput)
    expect(attached).toMatchObject({
      replayed: false,
      issue: {
        revision: 2,
        attachmentMutation: { operation: "added" },
      },
    })
    expect(replay).toEqual({ ...attached, replayed: true })
    await expect(db.select().from(schema.files)).resolves.toMatchObject([
      { organizationId: "mcp-org-a", status: "ready" },
    ])
    await expect(
      db.select().from(schema.storageObjectClaims)
    ).resolves.toMatchObject([{ holderType: "file" }])
    await expect(
      db
        .select({ status: schema.mcpAttachmentUploads.status })
        .from(schema.mcpAttachmentUploads)
        .where(eq(schema.mcpAttachmentUploads.id, session.uploadId))
    ).resolves.toEqual([{ status: "consumed" }])
    await expect(
      db.select().from(schema.organizationFileUsage)
    ).resolves.toMatchObject([
      { temporaryBytes: 0, usedBytes: bytes.byteLength },
    ])
  })

  it.each(["pending", "ready"] as const)(
    "releases expired %s upload quota into an exact cleanup job before reserving again",
    async (status) => {
      const { db } = await createFixture()
      const write = createMcpWriteApplication(db, principal())
      const first = await write.createAttachmentUploadSession({
        declaredContentType: "application/pdf",
        filename: "expired.pdf",
        idempotencyKey: "upload_session_expired_0001",
        sizeBytes: 32,
      })
      const now = new Date()
      if (status === "ready") {
        await db
          .update(schema.storageObjects)
          .set({ status: "ready", etag: "ready-etag" })
        await db
          .update(schema.mcpAttachmentUploads)
          .set({ status: "ready" })
          .where(eq(schema.mcpAttachmentUploads.id, first.uploadId))
      }
      await db
        .update(schema.mcpAttachmentUploads)
        .set({
          createdAt: new Date(now.getTime() - 20 * 60 * 1000),
          expiresAt: new Date(now.getTime() - 5 * 60 * 1000),
        })
        .where(eq(schema.mcpAttachmentUploads.id, first.uploadId))

      await write.createAttachmentUploadSession({
        declaredContentType: "application/pdf",
        filename: "next.pdf",
        idempotencyKey: "upload_session_next_000001",
        sizeBytes: 48,
      })

      await expect(
        db
          .select({ status: schema.mcpAttachmentUploads.status })
          .from(schema.mcpAttachmentUploads)
          .where(eq(schema.mcpAttachmentUploads.id, first.uploadId))
      ).resolves.toEqual([{ status: "expired" }])
      await expect(
        db.select().from(schema.storageObjectCleanupJobs)
      ).resolves.toHaveLength(1)
      await expect(
        db.select().from(schema.organizationFileUsage)
      ).resolves.toMatchObject([{ temporaryBytes: 48, usedBytes: 48 }])
    }
  )
})
