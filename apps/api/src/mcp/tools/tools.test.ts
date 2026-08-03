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

import {
  createRuntime,
  pngBytes,
} from "../../modules/files/agent-assets.test-support"
import {
  configureFileStorageRuntime,
  resetFileStorageRuntimeForTest,
} from "../../modules/files/public"
import type { McpPrincipal } from "../principal"
import { createMcpTools } from "./catalog"
import { createMcpReadApplication } from "./read-application"
import { uploadMcpAttachment } from "./upload-application"
import { createMcpWriteApplication } from "./write-application"

const migrationsFolder = new URL(
  "../../../../../packages/db/drizzle",
  import.meta.url
).pathname

const clients: Array<ReturnType<typeof createClient>> = []
const databasePaths: string[] = []

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
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  const now = new Date()
  await db.insert(schema.user).values([
    {
      id: "mcp-user-a",
      name: "MCP User A",
      email: "mcp-a@example.test",
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

  it("executes direct Issue writes once and replays only the same payload", async () => {
    const { db } = await createFixture()
    const write = createMcpWriteApplication(db, principal())
    const input = {
      idempotencyKey: "create_issue_request_0001",
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
