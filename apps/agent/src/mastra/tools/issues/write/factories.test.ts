import type {
  AddAttachmentWriteToolOutput,
  AddIssueAttachmentsToolInput,
  AgentAttachmentMutationReceipt,
  CreateIssueToolInput,
  DeleteIssueToolInput,
  IssueWriteToolOutput,
  RemoveAttachmentWriteToolOutput,
  RemoveIssueAttachmentsToolInput,
  UpdateIssueToolInput,
} from "@enterprise-agentic-saas/agent-contracts"
import { RequestContext } from "@mastra/core/request-context"
import { noopObserve } from "@mastra/core/tools"
import { describe, expect, it, vi } from "vitest"

import type { AgentToolExecutor } from "../tool-runtime"
import {
  createAddIssueAttachmentsTool,
  createCreateIssueTool,
  createDeleteIssueTool,
  createRemoveIssueAttachmentsTool,
  createUpdateIssueTool,
} from "./factories"

const requestContext = new RequestContext()
const context = {
  agent: {
    agentId: "agent_1",
    messages: [],
    suspend: async () => undefined,
    toolCallId: "call_1",
  },
  observe: noopObserve,
  requestContext,
}
const rejected: IssueWriteToolOutput = {
  actionId: "action_1",
  requiresApproval: false,
  status: "rejected",
}
const rejectedExecution = () =>
  Promise.reject(new Error("private provider failure"))
const invalidOutput = <Output>() =>
  Promise.resolve<Output>(JSON.parse('{"privateUrl":"private"}'))

const readErrorChain = (value: unknown) => {
  const chain: unknown[] = []
  let current = value
  for (let depth = 0; depth < 4; depth += 1) {
    chain.push(current)
    if (!(current instanceof Error)) break
    current = current.cause
  }
  return chain
}

describe("Agent write tool factories", () => {
  it("normalizes writes and preserves the provider tool-call identity", async () => {
    const create = vi.fn<() => Promise<IssueWriteToolOutput>>(() =>
      Promise.resolve(rejected)
    )
    const update = vi.fn<() => Promise<IssueWriteToolOutput>>(() =>
      Promise.resolve(rejected)
    )
    const remove = vi.fn<() => Promise<IssueWriteToolOutput>>(() =>
      Promise.resolve(rejected)
    )

    await expect(
      createCreateIssueTool(create).execute?.(
        {
          assigneeId: "",
          attachmentAssetIds: ["asset_1", "asset_1"],
          labels: [" bug ", "bug"],
          title: " Issue ",
        },
        context
      )
    ).resolves.toEqual(rejected)
    await expect(
      createUpdateIssueTool(update).execute?.(
        {
          assigneeId: " member_1 ",
          expectedRevision: 1,
          issueId: " issue_1 ",
          labels: [" bug ", "bug"],
          title: " Updated ",
        },
        context
      )
    ).resolves.toEqual(rejected)
    await expect(
      createDeleteIssueTool(remove).execute?.(
        { expectedRevision: 1, issueId: " issue_1 " },
        context
      )
    ).resolves.toEqual(rejected)

    expect(create).toHaveBeenCalledWith(
      {
        assigneeId: null,
        attachmentAssetIds: ["asset_1"],
        labels: ["bug"],
        title: "Issue",
      },
      {
        abortSignal: undefined,
        requestContext,
        toolCallId: "call_1",
      }
    )
    expect(update).toHaveBeenCalledWith(
      {
        assigneeId: "member_1",
        expectedRevision: 1,
        issueId: "issue_1",
        labels: ["bug"],
        title: "Updated",
      },
      {
        abortSignal: undefined,
        requestContext,
        toolCallId: "call_1",
      }
    )
    expect(remove).toHaveBeenCalledWith(
      { expectedRevision: 1, issueId: "issue_1" },
      {
        abortSignal: undefined,
        requestContext,
        toolCallId: "call_1",
      }
    )
  })

  it("passes bounded attachment mutations once and validates receipts", async () => {
    const receipt: AgentAttachmentMutationReceipt = {
      actionId: "action_1",
      fileIds: ["file_1"],
      issueId: "issue_1",
      issueNumber: 1,
      operation: "added",
      revision: 2,
    }
    const removedReceipt: AgentAttachmentMutationReceipt = {
      ...receipt,
      operation: "removed",
    }
    const add = vi.fn<
      AgentToolExecutor<
        AddIssueAttachmentsToolInput,
        AddAttachmentWriteToolOutput
      >
    >(() => Promise.resolve(receipt))
    const remove = vi.fn<
      AgentToolExecutor<
        RemoveIssueAttachmentsToolInput,
        RemoveAttachmentWriteToolOutput
      >
    >(() => Promise.resolve(removedReceipt))

    await expect(
      createAddIssueAttachmentsTool(add).execute?.(
        {
          assetIds: ["asset_1"],
          expectedRevision: 1,
          issueId: "issue_1",
        },
        context
      )
    ).resolves.toEqual(receipt)
    await expect(
      createRemoveIssueAttachmentsTool(remove).execute?.(
        {
          expectedRevision: 2,
          fileIds: ["file_1"],
          issueId: "issue_1",
        },
        context
      )
    ).resolves.toEqual(removedReceipt)
    expect(add).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledOnce()

    const wrongAdd = vi.fn<
      AgentToolExecutor<
        AddIssueAttachmentsToolInput,
        AddAttachmentWriteToolOutput
      >
    >(() =>
      Promise.resolve<AddAttachmentWriteToolOutput>(
        JSON.parse(JSON.stringify(removedReceipt))
      )
    )
    const wrongRemove = vi.fn<
      AgentToolExecutor<
        RemoveIssueAttachmentsToolInput,
        RemoveAttachmentWriteToolOutput
      >
    >(() =>
      Promise.resolve<RemoveAttachmentWriteToolOutput>(
        JSON.parse(JSON.stringify(receipt))
      )
    )
    await expect(
      createAddIssueAttachmentsTool(wrongAdd).execute?.(
        {
          assetIds: ["asset_1"],
          expectedRevision: 1,
          issueId: "issue_1",
        },
        context
      )
    ).rejects.toThrow("Agent tool execution failed")
    await expect(
      createRemoveIssueAttachmentsTool(wrongRemove).execute?.(
        {
          expectedRevision: 2,
          fileIds: ["file_1"],
          issueId: "issue_1",
        },
        context
      )
    ).rejects.toThrow("Agent tool execution failed")
  })

  it("rejects duplicate attachments before budget-backed execution", async () => {
    const add = vi.fn<
      AgentToolExecutor<
        AddIssueAttachmentsToolInput,
        AddAttachmentWriteToolOutput
      >
    >(() =>
      Promise.resolve({
        actionId: "action_1",
        fileIds: ["file_1"],
        issueId: "issue_1",
        issueNumber: 1,
        operation: "added",
        revision: 2,
      })
    )
    const secret = "private-asset-sentinel"
    let caught: unknown
    try {
      await createAddIssueAttachmentsTool(add).execute?.(
        {
          assetIds: [secret, secret],
          expectedRevision: 1,
          issueId: "issue_1",
        },
        context
      )
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(Error)
    expect(String(caught)).not.toContain(secret)
    if (!(caught instanceof Error)) throw new Error("Expected tool error")
    expect(String(caught.cause)).not.toContain(secret)
    expect(add).not.toHaveBeenCalled()
  })

  it("fails closed when every write lacks a provider tool-call identity", async () => {
    const noAgentContext = { observe: noopObserve, requestContext }
    const calls = [
      () =>
        createCreateIssueTool(() => Promise.resolve(rejected)).execute?.(
          { title: "Issue" },
          noAgentContext
        ),
      () =>
        createUpdateIssueTool(() => Promise.resolve(rejected)).execute?.(
          { expectedRevision: 1, issueId: "issue_1", title: "Updated" },
          noAgentContext
        ),
      () =>
        createDeleteIssueTool(() => Promise.resolve(rejected)).execute?.(
          { expectedRevision: 1, issueId: "issue_1" },
          noAgentContext
        ),
      () =>
        createAddIssueAttachmentsTool(() => invalidOutput()).execute?.(
          {
            assetIds: ["asset_1"],
            expectedRevision: 1,
            issueId: "issue_1",
          },
          noAgentContext
        ),
      () =>
        createRemoveIssueAttachmentsTool(() => invalidOutput()).execute?.(
          {
            expectedRevision: 1,
            fileIds: ["file_1"],
            issueId: "issue_1",
          },
          noAgentContext
        ),
    ]
    await Promise.all(
      calls.map((call) =>
        expect(call()).rejects.toThrow("Agent tool execution failed")
      )
    )
  })

  it("projects write executor and output failures safely", async () => {
    const calls = [
      () =>
        createCreateIssueTool(rejectedExecution).execute?.(
          { title: "Issue" },
          context
        ),
      () =>
        createUpdateIssueTool(invalidOutput).execute?.(
          { expectedRevision: 1, issueId: "issue_1", title: "Updated" },
          context
        ),
      () =>
        createDeleteIssueTool(rejectedExecution).execute?.(
          { expectedRevision: 1, issueId: "issue_1" },
          context
        ),
      () =>
        createAddIssueAttachmentsTool(invalidOutput).execute?.(
          {
            assetIds: ["asset_1"],
            expectedRevision: 1,
            issueId: "issue_1",
          },
          context
        ),
      () =>
        createRemoveIssueAttachmentsTool(invalidOutput).execute?.(
          {
            expectedRevision: 1,
            fileIds: ["file_1"],
            issueId: "issue_1",
          },
          context
        ),
    ]
    await Promise.all(
      calls.map((call) =>
        expect(call()).rejects.toThrow("Agent tool execution failed")
      )
    )

    const invalidOutputSecret = "private-write-output-sentinel"
    let invalidOutputError: unknown
    try {
      await createUpdateIssueTool(() =>
        Promise.resolve<IssueWriteToolOutput>(
          JSON.parse(JSON.stringify({ privateUrl: invalidOutputSecret }))
        )
      ).execute?.(
        { expectedRevision: 1, issueId: "issue_1", title: "Updated" },
        context
      )
    } catch (error) {
      invalidOutputError = error
    }
    expect(invalidOutputError).toBeInstanceOf(Error)
    for (const error of readErrorChain(invalidOutputError)) {
      expect(String(error)).not.toContain(invalidOutputSecret)
      expect(JSON.stringify(error) ?? "").not.toContain(invalidOutputSecret)
    }
  })
})

describe("Agent write normalization", () => {
  it("covers optional values and rejects updates without a changed field", async () => {
    const create = vi.fn<
      AgentToolExecutor<CreateIssueToolInput, IssueWriteToolOutput>
    >(() => Promise.resolve(rejected))
    const update = vi.fn<
      AgentToolExecutor<UpdateIssueToolInput, IssueWriteToolOutput>
    >(() => Promise.resolve(rejected))
    const remove = vi.fn<
      AgentToolExecutor<DeleteIssueToolInput, IssueWriteToolOutput>
    >(() => Promise.resolve(rejected))

    await createCreateIssueTool(create).execute?.(
      { assigneeId: "member_1", title: " Issue " },
      context
    )
    await createCreateIssueTool(create).execute?.({ title: "Issue" }, context)
    await createUpdateIssueTool(update).execute?.(
      { assigneeId: null, expectedRevision: 1, issueId: "issue_1" },
      context
    )
    await createUpdateIssueTool(update).execute?.(
      { expectedRevision: 1, issueId: "issue_1", status: "closed" },
      context
    )
    await expect(
      createUpdateIssueTool(update).execute?.(
        { expectedRevision: 1, issueId: "issue_1" },
        context
      )
    ).rejects.toThrow("Agent tool execution failed")
    await createDeleteIssueTool(remove).execute?.(
      { expectedRevision: 1, issueId: " issue_1 " },
      context
    )

    expect(create).toHaveBeenNthCalledWith(
      1,
      {
        assigneeId: "member_1",
        attachmentAssetIds: [],
        title: "Issue",
      },
      expect.any(Object)
    )
    expect(create).toHaveBeenNthCalledWith(
      2,
      { attachmentAssetIds: [], title: "Issue" },
      expect.any(Object)
    )
    expect(update).toHaveBeenNthCalledWith(
      1,
      { assigneeId: null, expectedRevision: 1, issueId: "issue_1" },
      expect.any(Object)
    )
    expect(update).toHaveBeenNthCalledWith(
      2,
      { expectedRevision: 1, issueId: "issue_1", status: "closed" },
      expect.any(Object)
    )
    expect(update).toHaveBeenCalledTimes(2)
    expect(remove).toHaveBeenCalledWith(
      { expectedRevision: 1, issueId: "issue_1" },
      expect.any(Object)
    )
  })
})
