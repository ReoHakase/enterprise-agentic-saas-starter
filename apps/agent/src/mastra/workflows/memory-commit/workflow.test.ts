import { Buffer } from "node:buffer"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"

import type { MastraDBMessage } from "@mastra/core/agent"
import { MessageList } from "@mastra/core/agent/message-list"
import { Mastra } from "@mastra/core/mastra"
import type { Memory } from "@mastra/memory"
import { describe, expect, it, vi } from "vitest"

import type { AgentControlPlanePort } from "../../runtime/ports"
import { createAgentStorage } from "../../storage"
import { projectMemorySnapshotMessages } from "./message-projection"
import {
  createMemoryCommitWorkflow,
  reconcileMemoryCommit,
  reconcilePendingMemoryCommits,
  reconcilePendingMemoryCommitsForThread,
  suspendMemoryCommit,
} from "./workflow"
import {
  memoryCommitWorkflowRunId,
  MEMORY_COMMIT_WORKFLOW_ID,
} from "./workflow-contract"

const message = (): MastraDBMessage => ({
  id: "provider-message-id",
  role: "assistant",
  createdAt: new Date("2026-07-28T00:00:00.000Z"),
  threadId: "thread_1",
  resourceId: "resource_1",
  content: { format: 2, parts: [{ type: "text", text: "saved" }] },
})
type SaveMessages = Pick<Memory, "saveMessages">["saveMessages"]
const noop = () => undefined

const createRuntime = (
  saveMessages = vi
    .fn<SaveMessages>()
    .mockImplementation(({ messages }) => Promise.resolve({ messages }))
) => {
  const storage = createAgentStorage(
    { MASTRA_STORAGE_URL: ":memory:", NODE_ENV: "test" },
    `memory-commit-${crypto.randomUUID()}`
  )
  const memoryCommitWorkflow = createMemoryCommitWorkflow({ saveMessages })
  return {
    mastra: new Mastra({
      logger: false,
      storage,
      workflows: { memoryCommitWorkflow },
    }),
    saveMessages,
  }
}

describe("memory commit workflow", () => {
  it("structurally removes runtime-only provider metadata from a snapshot", async () => {
    const { mastra } = createRuntime()
    const unsafe = message()
    unsafe.content.providerMetadata = {
      provider: { secret: "PRIVATE_PROVIDER_METADATA_SENTINEL" },
    }
    unsafe.content.metadata = {
      accessToken: "PRIVATE_ACCESS_TOKEN_SENTINEL",
      Authorization: "PRIVATE_AUTHORIZATION_SENTINEL",
      href: "https://user:secret@example.com/private",
      presignedUrl: "https://example.com/private?token=secret",
      privateUrl: "https://example.com/private/object-id",
    }
    unsafe.content.parts = [
      {
        type: "text",
        text: "A user may discuss apiKey and http://10.0.0.1 safely.",
      },
      {
        type: "source",
        source: {
          sourceType: "url",
          id: "private-ipv4",
          url: "http://10.0.0.1/private",
        },
      },
      {
        type: "source",
        source: {
          sourceType: "url",
          id: "private-ipv6",
          url: "http://[::1]/private",
        },
      },
      {
        type: "source",
        source: {
          sourceType: "url",
          id: "private-local",
          url: "https://agent.local/private",
        },
      },
      {
        type: "source",
        source: {
          sourceType: "url",
          id: "private-file",
          url: "file:///private/key",
        },
      },
      {
        type: "source",
        source: {
          sourceType: "url",
          id: "private-userinfo",
          url: "https://user:secret@example.com/private",
        },
      },
      {
        type: "source",
        source: {
          sourceType: "url",
          id: "private-signed",
          url: "https://example.com/private?access_token=secret",
        },
      },
    ]
    await suspendMemoryCommit(mastra, {
      applicationRunId: "run_secret",
      desiredOutcome: "completed",
      messages: [unsafe],
      resourceId: "resource_1",
      threadId: "thread_1",
    })
    const stored = await mastra
      .getWorkflow("memoryCommitWorkflow")
      .getWorkflowRunById(memoryCommitWorkflowRunId("run_secret"))
    expect(JSON.stringify(stored)).not.toContain(
      "PRIVATE_PROVIDER_METADATA_SENTINEL"
    )
    expect(JSON.stringify(stored)).toContain("discuss apiKey and")
    expect(JSON.stringify(stored)).not.toContain(
      "PRIVATE_ACCESS_TOKEN_SENTINEL"
    )
    expect(JSON.stringify(stored)).not.toContain(
      "PRIVATE_AUTHORIZATION_SENTINEL"
    )
    expect(JSON.stringify(stored)).not.toContain("access_token")
    expect(JSON.stringify(stored)).not.toContain("user:secret")
    expect(JSON.stringify(stored)).not.toContain("file:///")
    expect(JSON.stringify(stored)).not.toContain("agent.local")
    expect(JSON.stringify(stored)).not.toContain("private/object-id")
  })
})

describe("memory snapshot tool projection", () => {
  it("preserves validated custom data after removing Mastra's part timestamp", () => {
    const userMessage = message()
    userMessage.role = "user"
    userMessage.content.parts = JSON.parse(
      JSON.stringify([
        {
          type: "data-agent-assets",
          data: { assetIds: ["asset_opaque_1"] },
          createdAt: 1_785_212_800_000,
        },
      ])
    )

    expect(projectMemorySnapshotMessages([userMessage])).toMatchObject([
      {
        content: {
          parts: [
            {
              type: "data-agent-assets",
              data: { assetIds: ["asset_opaque_1"] },
            },
          ],
        },
      },
    ])
  })

  it("preserves validated native tool receipts and states while failing closed", () => {
    const toolMessage = message()
    toolMessage.content.parts = JSON.parse(
      JSON.stringify([
        {
          type: "tool-invocation",
          toolInvocation: {
            state: "call",
            step: 0,
            toolCallId: "call_running",
            toolName: "web_search",
            args: { query: "Cloudflare R2 limits" },
            rawInput: { token: "PRIVATE_RAW_INPUT_SENTINEL" },
          },
          title: "Public Web search",
          preliminary: true,
          providerExecuted: false,
          createdAt: 1_785_212_800_000,
          providerMetadata: { token: "PRIVATE_PART_METADATA_SENTINEL" },
        },
        {
          type: "tool-invocation",
          toolInvocation: {
            state: "result",
            step: 1,
            toolCallId: "call_web_result",
            toolName: "web_search",
            args: { query: "Cloudflare R2 limits" },
            result: {
              content: "Public documentation.",
              sources: [
                {
                  title: "R2 limits",
                  url: "https://example.com/r2?id=123#limits",
                },
              ],
              trust: "untrusted_public_web_content",
            },
          },
        },
        {
          type: "source-url",
          sourceId: "source_duplicate",
          title: "Duplicate R2 limits",
          url: "https://example.com/r2?id=123#duplicate",
        },
        {
          type: "tool-invocation",
          toolInvocation: {
            state: "result",
            step: 2,
            toolCallId: "call_image",
            toolName: "read_issue_attachment_image",
            args: { fileId: "file_1", issueId: "issue_1" },
            result: {
              contentType: "image/webp",
              fileId: "file_1",
              issueId: "issue_1",
              sizeBytes: 128,
            },
          },
        },
        {
          type: "tool-invocation",
          toolInvocation: {
            state: "result",
            toolCallId: "call_add",
            toolName: "add_issue_attachments",
            args: {
              assetIds: ["asset_1"],
              expectedRevision: 3,
              issueId: "issue_1",
            },
            result: {
              actionId: "action_add",
              operation: "added",
              issueId: "issue_1",
              issueNumber: 7,
              revision: 4,
              fileIds: ["file_1"],
            },
          },
        },
        {
          type: "tool-invocation",
          toolInvocation: {
            state: "result",
            toolCallId: "call_remove",
            toolName: "remove_issue_attachments",
            args: {
              expectedRevision: 4,
              fileIds: ["file_1"],
              issueId: "issue_1",
            },
            result: {
              actionId: "action_remove",
              operation: "removed",
              issueId: "issue_1",
              issueNumber: 7,
              revision: 5,
              fileIds: ["file_1"],
            },
            approval: { id: "approval_remove", approved: true },
          },
        },
        {
          type: "tool-invocation",
          toolInvocation: {
            state: "approval-responded",
            step: 3,
            toolCallId: "call_denied",
            toolName: "update_issue",
            args: {
              expectedRevision: 5,
              issueId: "issue_1",
              title: "Declined title",
            },
            approval: {
              id: "approval_1",
              approved: false,
              reason: "Declined by reviewer",
            },
          },
        },
        {
          type: "tool-invocation",
          toolInvocation: {
            state: "approval-requested",
            step: 4,
            toolCallId: "call_approval_requested",
            toolName: "delete_issue",
            args: { expectedRevision: 5, issueId: "issue_1" },
            approval: { id: "approval_2" },
          },
        },
        {
          type: "tool-invocation",
          toolInvocation: {
            state: "output-denied",
            step: 5,
            toolCallId: "call_output_denied",
            toolName: "delete_issue",
            args: { expectedRevision: 5, issueId: "issue_1" },
            approval: {
              id: "approval_3",
              approved: false,
              reason: "Denied",
            },
          },
        },
        {
          type: "tool-invocation",
          toolInvocation: {
            state: "output-error",
            toolCallId: "call_failed",
            toolName: "get_issue",
            args: { lookup: "id", id: "issue_1" },
            approval: {
              id: "approval_failed",
              approved: true,
              reason: "Approved by reviewer",
            },
            errorText:
              "Bearer PRIVATE_ERROR_TOKEN at https://private.invalid/error",
          },
        },
        {
          type: "tool-invocation",
          toolInvocation: {
            state: "output-error",
            toolCallId: "call_invalid_failed",
            toolName: "get_issue",
            approval: {
              id: "approval_invalid_failed",
              approved: true,
            },
          },
        },
        {
          type: "tool-invocation",
          toolInvocation: {
            state: "result",
            toolCallId: "call_invalid_result",
            toolName: "get_issue",
            args: { lookup: "id", id: "issue_1" },
            result: {
              token: "PRIVATE_INVALID_RESULT_SENTINEL",
            },
          },
        },
        {
          type: "tool-invocation",
          toolInvocation: {
            state: "approval-responded",
            toolCallId: "call_invalid_approval",
            toolName: "delete_issue",
            args: { expectedRevision: 5, issueId: "issue_1" },
          },
        },
        {
          type: "tool-invocation",
          toolInvocation: {
            state: "result",
            toolCallId: "call_unknown",
            toolName: "unknown_tool",
            args: { token: "PRIVATE_UNKNOWN_TOOL_SENTINEL" },
            result: { privateUrl: "https://private.invalid/result" },
          },
        },
        {
          type: "tool-invocation",
          toolInvocation: {
            state: "approval-requested",
            toolCallId: "call_malformed_requested",
            toolName: "delete_issue",
            args: { expectedRevision: 5, issueId: "issue_1" },
            approval: {
              id: "PRIVATE_MALFORMED_REQUESTED",
              approved: true,
            },
          },
        },
        {
          type: "tool-invocation",
          toolInvocation: {
            state: "result",
            toolCallId: "call_malformed_result",
            toolName: "remove_issue_attachments",
            args: {
              expectedRevision: 4,
              fileIds: ["file_1"],
              issueId: "issue_1",
            },
            result: {
              actionId: "PRIVATE_MALFORMED_RESULT",
              operation: "removed",
              issueId: "issue_1",
              issueNumber: 7,
              revision: 5,
              fileIds: ["file_1"],
            },
            approval: {
              id: "approval_malformed_result",
              approved: false,
            },
          },
        },
        {
          type: "tool-invocation",
          toolInvocation: {
            state: "call",
            toolCallId: "call_malformed_call",
            toolName: "get_issue",
            args: { lookup: "id", id: "issue_1" },
            result: { id: "PRIVATE_MALFORMED_CALL" },
          },
        },
        {
          type: "source-url",
          sourceId: "source_1",
          title: "Public source",
          url: "https://example.com/docs?id=456#fragment",
        },
        {
          type: "source-url",
          sourceId: "source_secret",
          title: "Sensitive source",
          url: "https://example.com/docs?access_token=secret",
        },
        {
          type: "source-url",
          sourceId: "source_signature",
          title: "Signed source",
          url: "https://storage.example.com/object?sv=2026-01-01&sp=r&sig=PRIVATE_SIGNATURE",
        },
        {
          type: "source-url",
          sourceId: "source_auth_code",
          title: "OAuth source",
          url: "https://auth.example.com/callback?code=PRIVATE_AUTH_CODE",
        },
        {
          type: "source-url",
          sourceId: "source_opaque_capability",
          title: "Opaque source",
          url: "https://files.example.com/download?capability=PRIVATE_CAPABILITY",
        },
      ])
    )

    const projected = projectMemorySnapshotMessages([toolMessage])
    const serialized = JSON.stringify(projected)
    expect(serialized).not.toContain("PRIVATE_RAW_INPUT_SENTINEL")
    expect(serialized).not.toContain("PRIVATE_PART_METADATA_SENTINEL")
    expect(serialized).not.toContain("PRIVATE_ERROR_TOKEN")
    expect(serialized).not.toContain("PRIVATE_UNKNOWN_TOOL_SENTINEL")
    expect(serialized).not.toContain("PRIVATE_INVALID_RESULT_SENTINEL")
    expect(serialized).not.toContain("PRIVATE_MALFORMED")
    expect(serialized).not.toContain("call_invalid_failed")
    expect(serialized).not.toContain("access_token")
    expect(serialized).not.toContain("PRIVATE_SIGNATURE")
    expect(serialized).not.toContain("PRIVATE_AUTH_CODE")
    expect(serialized).not.toContain("PRIVATE_CAPABILITY")
    expect(serialized).not.toContain("Structured content unavailable")
    expect(serialized).not.toContain("Tool state unavailable")
    expect(serialized).not.toContain("Source unavailable")
    expect(serialized).toContain("Agent tool execution failed.")
    expect(serialized).toContain('"step":0')
    expect(serialized).toContain('"step":5')

    const restored: MastraDBMessage[] = JSON.parse(serialized)
    const restoredMessage = restored[0]
    if (!restoredMessage) throw new Error("Restored message unavailable")
    restoredMessage.createdAt = new Date(restoredMessage.createdAt)
    const history = new MessageList({
      resourceId: "resource_1",
      threadId: "thread_1",
    })
      .add(restored, "memory")
      .get.all.aiV6.ui()[0]
    expect(history?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool-web_search",
          state: "input-available",
          input: { query: "Cloudflare R2 limits" },
        }),
        expect.objectContaining({
          type: "tool-web_search",
          state: "output-available",
          output: expect.objectContaining({
            content: "Public documentation.",
            sources: [
              {
                title: "R2 limits",
                url: "https://example.com/r2",
              },
            ],
          }),
        }),
        expect.objectContaining({
          type: "source-url",
          sourceId: expect.stringMatching(
            /^source_0_call_web_result_[0-9a-f]{8}$/u
          ),
          title: "R2 limits",
          url: "https://example.com/r2",
        }),
        expect.objectContaining({
          type: "tool-read_issue_attachment_image",
          state: "output-available",
          output: {
            contentType: "image/webp",
            fileId: "file_1",
            issueId: "issue_1",
            sizeBytes: 128,
          },
        }),
        expect.objectContaining({
          type: "tool-add_issue_attachments",
          state: "output-available",
          output: expect.objectContaining({
            operation: "added",
            revision: 4,
            fileIds: ["file_1"],
          }),
        }),
        expect.objectContaining({
          type: "tool-remove_issue_attachments",
          state: "output-available",
          approval: { id: "approval_remove", approved: true },
          output: expect.objectContaining({
            operation: "removed",
            revision: 5,
            fileIds: ["file_1"],
          }),
        }),
        expect.objectContaining({
          type: "tool-update_issue",
          state: "approval-responded",
          approval: expect.objectContaining({
            id: "approval_1",
            approved: false,
          }),
        }),
        expect.objectContaining({
          type: "tool-delete_issue",
          state: "approval-requested",
          approval: { id: "approval_2" },
        }),
        expect.objectContaining({
          type: "tool-delete_issue",
          state: "output-denied",
          approval: {
            id: "approval_3",
            approved: false,
            reason: "Denied",
          },
        }),
        expect.objectContaining({
          type: "tool-get_issue",
          state: "output-error",
          approval: {
            id: "approval_failed",
            approved: true,
            reason: "Approved by reviewer",
          },
          errorText: "Agent tool execution failed.",
        }),
        {
          type: "source-url",
          sourceId: "source_1",
          title: "Public source",
          url: "https://example.com/docs",
        },
        {
          type: "source-url",
          sourceId: "source_signature",
          title: "Signed source",
          url: "https://storage.example.com/object",
        },
        {
          type: "source-url",
          sourceId: "source_auth_code",
          title: "OAuth source",
          url: "https://auth.example.com/callback",
        },
        {
          type: "source-url",
          sourceId: "source_opaque_capability",
          title: "Opaque source",
          url: "https://files.example.com/download",
        },
      ])
    )
    expect(
      history?.parts.filter(
        (part) =>
          part.type === "source-url" && part.url === "https://example.com/r2"
      )
    ).toHaveLength(1)
  })
})

describe("memory commit reconciliation", () => {
  it("rejects a message outside the authorized thread or resource", async () => {
    const { mastra, saveMessages } = createRuntime()
    const foreignThread = message()
    foreignThread.threadId = "thread_foreign"
    const foreignResource = message()
    foreignResource.resourceId = "resource_foreign"
    await Promise.all([
      expect(
        suspendMemoryCommit(mastra, {
          applicationRunId: "run_foreign_thread",
          desiredOutcome: "completed",
          messages: [foreignThread],
          resourceId: "resource_1",
          threadId: "thread_1",
        })
      ).rejects.toThrow("Memory commit batch is invalid"),
      expect(
        suspendMemoryCommit(mastra, {
          applicationRunId: "run_foreign_resource",
          desiredOutcome: "completed",
          messages: [foreignResource],
          resourceId: "resource_1",
          threadId: "thread_1",
        })
      ).rejects.toThrow("Memory commit batch is invalid"),
    ])
    expect(saveMessages).not.toHaveBeenCalled()
  })

  it("recovers a suspended snapshot with a fresh Mastra over the same LibSQL file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "memory-commit-recovery-"))
    try {
      const url = `file:${join(directory, "memory.db")}`
      const recoveryMessage = message()
      recoveryMessage.content.providerMetadata = {
        provider: { secret: "RAW_PROVIDER_SECRET_SENTINEL" },
      }
      recoveryMessage.content.metadata = {
        accessToken: "RAW_ACCESS_TOKEN_SENTINEL",
        bearerToken: "RAW_BEARER_TOKEN_SENTINEL",
        clientSecret: "RAW_CLIENT_SECRET_SENTINEL",
        credential: "RAW_CREDENTIAL_SENTINEL",
        headers: { authorization: "RAW_AUTHORIZATION_HEADER_SENTINEL" },
        password: "RAW_PASSWORD_SENTINEL",
        token: "RAW_TOKEN_SENTINEL",
      }
      recoveryMessage.content.parts = [
        {
          type: "text",
          text: "User-authored apiKey and http://10.0.0.1 remain text.",
        },
      ]
      const firstStorage = createAgentStorage(
        { MASTRA_STORAGE_URL: url, NODE_ENV: "test" },
        "memory-commit-recovery"
      )
      const firstMastra = new Mastra({
        logger: false,
        storage: firstStorage,
        workflows: {
          memoryCommitWorkflow: createMemoryCommitWorkflow({
            saveMessages: vi.fn<SaveMessages>(),
          }),
        },
      })
      await suspendMemoryCommit(firstMastra, {
        applicationRunId: "run_recovery",
        desiredOutcome: "completed",
        messages: [recoveryMessage],
        resourceId: "resource_1",
        threadId: "thread_1",
      })
      const workflowStore = await firstStorage.getStore("workflows")
      if (!workflowStore) throw new Error("Workflow storage unavailable")
      const workflowRunId = memoryCommitWorkflowRunId("run_recovery")
      const snapshot = await workflowStore.loadWorkflowSnapshot({
        runId: workflowRunId,
        workflowName: MEMORY_COMMIT_WORKFLOW_ID,
      })
      if (!snapshot) throw new Error("Workflow snapshot unavailable")
      const serializedSnapshot = JSON.stringify(snapshot)
      expect(serializedSnapshot).not.toContain("RAW_PROVIDER_SECRET_SENTINEL")
      expect(serializedSnapshot).not.toContain("RAW_ACCESS_TOKEN_SENTINEL")
      expect(serializedSnapshot).toContain("User-authored apiKey")
      snapshot.status = "running"
      await workflowStore.persistWorkflowSnapshot({
        resourceId: "thread_1",
        runId: workflowRunId,
        snapshot,
        workflowName: MEMORY_COMMIT_WORKFLOW_ID,
      })
      await firstStorage.close()

      const reopenedDatabase = new DatabaseSync(join(directory, "memory.db"), {
        readOnly: true,
      })
      const tableNames = reopenedDatabase
        .prepare(
          "select name from sqlite_master where type = 'table' and name not like 'sqlite_%'"
        )
        .all()
        .flatMap((row) => (typeof row.name === "string" ? [row.name] : []))
      const persistedRows = tableNames
        .flatMap((name) =>
          reopenedDatabase
            .prepare(`select * from "${name.replaceAll('"', '""')}"`)
            .all()
        )
        .flatMap((row) => Object.values(row))
        .map((value) =>
          value instanceof Uint8Array
            ? Buffer.from(value).toString("utf8")
            : JSON.stringify(value)
        )
        .join("\n")
      reopenedDatabase.close()
      expect(persistedRows).toContain("User-authored apiKey")
      expect(persistedRows).not.toContain("RAW_PROVIDER_SECRET_SENTINEL")
      expect(persistedRows).not.toContain("RAW_ACCESS_TOKEN_SENTINEL")
      expect(persistedRows).not.toContain("RAW_BEARER_TOKEN_SENTINEL")
      expect(persistedRows).not.toContain("RAW_CLIENT_SECRET_SENTINEL")
      expect(persistedRows).not.toContain("RAW_CREDENTIAL_SENTINEL")
      expect(persistedRows).not.toContain("RAW_AUTHORIZATION_HEADER_SENTINEL")
      expect(persistedRows).not.toContain("RAW_PASSWORD_SENTINEL")
      expect(persistedRows).not.toContain("RAW_TOKEN_SENTINEL")

      const saveMessages = vi
        .fn<SaveMessages>()
        .mockImplementation(({ messages }) => Promise.resolve({ messages }))
      const reopenedStorage = createAgentStorage(
        { MASTRA_STORAGE_URL: url, NODE_ENV: "test" },
        "memory-commit-recovery"
      )
      const reopenedMastra = new Mastra({
        logger: false,
        storage: reopenedStorage,
        workflows: {
          memoryCommitWorkflow: createMemoryCommitWorkflow({ saveMessages }),
        },
      })
      await reconcilePendingMemoryCommits(reopenedMastra, {
        settleMemoryCommit: (input) =>
          Promise.resolve({
            acknowledged: true,
            applicationRunId: input.applicationRunId,
          }),
      })
      expect(saveMessages).toHaveBeenCalledOnce()
      await expect(
        reopenedMastra
          .getWorkflow("memoryCommitWorkflow")
          .getWorkflowRunById(memoryCommitWorkflowRunId("run_recovery"))
      ).resolves.toBeNull()
      await reopenedStorage.close()
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it("commits an approval-waiting response without another application DB call", async () => {
    const { mastra, saveMessages } = createRuntime()
    const settleMemoryCommit =
      vi.fn<AgentControlPlanePort["settleMemoryCommit"]>()
    await suspendMemoryCommit(mastra, {
      applicationRunId: "run_waiting_approval",
      desiredOutcome: "waiting_approval",
      messages: [message()],
      resourceId: "resource_1",
      threadId: "thread_1",
    })
    await reconcileMemoryCommit(
      mastra,
      { settleMemoryCommit },
      {
        applicationRunId: "run_waiting_approval",
        desiredOutcome: "waiting_approval",
      }
    )
    expect(saveMessages).toHaveBeenCalledOnce()
    expect(settleMemoryCommit).not.toHaveBeenCalled()
    await expect(
      mastra
        .getWorkflow("memoryCommitWorkflow")
        .getWorkflowRunById(memoryCommitWorkflowRunId("run_waiting_approval"))
    ).resolves.toBeNull()
  })

  it("retries a transient save before reporting a committed response", async () => {
    const saveMessages = vi
      .fn<SaveMessages>()
      .mockRejectedValueOnce(new Error("temporary storage failure"))
      .mockResolvedValueOnce({ messages: [message()] })
    const { mastra } = createRuntime(saveMessages)
    await suspendMemoryCommit(mastra, {
      applicationRunId: "run_transient_save",
      desiredOutcome: "completed",
      messages: [message()],
      resourceId: "resource_1",
      threadId: "thread_1",
    })

    await expect(
      reconcileMemoryCommit(
        mastra,
        {
          settleMemoryCommit: (input) =>
            Promise.resolve({
              acknowledged: true,
              applicationRunId: input.applicationRunId,
            }),
        },
        {
          applicationRunId: "run_transient_save",
          desiredOutcome: "completed",
        }
      )
    ).resolves.toBe("committed")

    expect(saveMessages).toHaveBeenCalledTimes(2)
    await expect(
      mastra
        .getWorkflow("memoryCommitWorkflow")
        .getWorkflowRunById(memoryCommitWorkflowRunId("run_transient_save"))
    ).resolves.toBeNull()
  })

  it("recovers application settlement after Memory was already saved", async () => {
    const { mastra, saveMessages } = createRuntime()
    await suspendMemoryCommit(mastra, {
      applicationRunId: "run_transient_settlement",
      desiredOutcome: "completed",
      messages: [message()],
      resourceId: "resource_1",
      threadId: "thread_1",
    })
    const settleMemoryCommit = vi
      .fn<AgentControlPlanePort["settleMemoryCommit"]>()
      .mockRejectedValueOnce(new Error("application DB unavailable"))
      .mockResolvedValueOnce({
        acknowledged: true,
        applicationRunId: "run_transient_settlement",
      })

    await expect(
      reconcileMemoryCommit(
        mastra,
        { settleMemoryCommit },
        {
          applicationRunId: "run_transient_settlement",
          desiredOutcome: "completed",
        }
      )
    ).rejects.toThrow("application DB unavailable")
    await expect(
      mastra
        .getWorkflow("memoryCommitWorkflow")
        .getWorkflowRunById(
          memoryCommitWorkflowRunId("run_transient_settlement")
        )
    ).resolves.toMatchObject({ status: "success" })

    await expect(
      reconcileMemoryCommit(
        mastra,
        { settleMemoryCommit },
        {
          applicationRunId: "run_transient_settlement",
          desiredOutcome: "completed",
        }
      )
    ).resolves.toBe("committed")

    expect(saveMessages).toHaveBeenCalledOnce()
    expect(settleMemoryCommit).toHaveBeenCalledTimes(2)
  })

  it("coalesces concurrent reconciliation into one durable save", async () => {
    const { mastra, saveMessages } = createRuntime()
    await suspendMemoryCommit(mastra, {
      applicationRunId: "run_concurrent",
      desiredOutcome: "completed",
      messages: [message()],
      resourceId: "resource_1",
      threadId: "thread_1",
    })
    const api = {
      settleMemoryCommit: (input: { applicationRunId: string }) =>
        Promise.resolve({
          acknowledged: true as const,
          applicationRunId: input.applicationRunId,
        }),
    }
    await expect(
      Promise.all([
        reconcileMemoryCommit(mastra, api, {
          applicationRunId: "run_concurrent",
          desiredOutcome: "completed",
        }),
        reconcileMemoryCommit(mastra, api, {
          applicationRunId: "run_concurrent",
          desiredOutcome: "completed",
        }),
      ])
    ).resolves.toEqual(["committed", "committed"])
    expect(saveMessages).toHaveBeenCalledOnce()
  })

  it("joins a live reconciliation instead of restarting its running snapshot", async () => {
    let markSaveStarted: () => void = noop
    const saveStarted = new Promise<void>((resolve) => {
      markSaveStarted = resolve
    })
    let releaseSave: () => void = noop
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve
    })
    const saveMessages = vi.fn<SaveMessages>(async ({ messages }) => {
      markSaveStarted()
      await saveGate
      return { messages }
    })
    const { mastra } = createRuntime(saveMessages)
    await suspendMemoryCommit(mastra, {
      applicationRunId: "run_live_sweep",
      desiredOutcome: "completed",
      messages: [message()],
      resourceId: "resource_1",
      threadId: "thread_1",
    })
    const api = {
      settleMemoryCommit: (input: { applicationRunId: string }) =>
        Promise.resolve({
          acknowledged: true as const,
          applicationRunId: input.applicationRunId,
        }),
    }

    const live = reconcileMemoryCommit(mastra, api, {
      applicationRunId: "run_live_sweep",
      desiredOutcome: "completed",
    })
    await saveStarted
    const sweep = reconcilePendingMemoryCommitsForThread(
      mastra,
      api,
      "thread_1"
    )
    releaseSave()

    await expect(Promise.all([live, sweep])).resolves.toEqual([
      "committed",
      undefined,
    ])
    expect(saveMessages).toHaveBeenCalledOnce()
  })

  it("reconciles only the authenticated thread during a Memory read", async () => {
    const { mastra, saveMessages } = createRuntime()
    const otherMessage = message()
    otherMessage.id = "other-message"
    otherMessage.resourceId = "resource_2"
    otherMessage.threadId = "thread_2"
    await suspendMemoryCommit(mastra, {
      applicationRunId: "run_scoped",
      desiredOutcome: "completed",
      messages: [message()],
      resourceId: "resource_1",
      threadId: "thread_1",
    })
    await suspendMemoryCommit(mastra, {
      applicationRunId: "run_other",
      desiredOutcome: "completed",
      messages: [otherMessage],
      resourceId: "resource_2",
      threadId: "thread_2",
    })
    const api = {
      settleMemoryCommit: (input: { applicationRunId: string }) =>
        Promise.resolve({
          acknowledged: true as const,
          applicationRunId: input.applicationRunId,
        }),
    }

    await reconcilePendingMemoryCommitsForThread(mastra, api, "thread_1")

    expect(saveMessages).toHaveBeenCalledOnce()
    expect(saveMessages).toHaveBeenCalledWith({
      messages: [expect.objectContaining({ threadId: "thread_1" })],
    })
    await expect(
      mastra
        .getWorkflow("memoryCommitWorkflow")
        .getWorkflowRunById(memoryCommitWorkflowRunId("run_scoped"))
    ).resolves.toBeNull()
    await expect(
      mastra
        .getWorkflow("memoryCommitWorkflow")
        .getWorkflowRunById(memoryCommitWorkflowRunId("run_other"))
    ).resolves.toMatchObject({ status: "suspended" })
  })
})
