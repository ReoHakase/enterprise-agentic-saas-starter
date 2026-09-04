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
const unreachableWriteExecution = <Output>() =>
  Promise.reject<Output>(new Error("unexpected write execution"))
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

describe("Agent書込tool factory", () => {
  it("Issue作成入力を正規化してprovider tool-callの同一性を保持する", async () => {
    const create = vi.fn<() => Promise<IssueWriteToolOutput>>(() =>
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
  })

  it("Issue更新入力を正規化してprovider tool-callの同一性を保持する", async () => {
    const update = vi.fn<() => Promise<IssueWriteToolOutput>>(() =>
      Promise.resolve(rejected)
    )

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
  })

  it("Issue削除入力を正規化してprovider tool-callの同一性を保持する", async () => {
    const remove = vi.fn<() => Promise<IssueWriteToolOutput>>(() =>
      Promise.resolve(rejected)
    )

    await expect(
      createDeleteIssueTool(remove).execute?.(
        { expectedRevision: 1, issueId: " issue_1 " },
        context
      )
    ).resolves.toEqual(rejected)
    expect(remove).toHaveBeenCalledWith(
      { expectedRevision: 1, issueId: "issue_1" },
      {
        abortSignal: undefined,
        requestContext,
        toolCallId: "call_1",
      }
    )
  })

  it("添付追加を一度だけ渡して追加receiptを返す", async () => {
    const receipt: AgentAttachmentMutationReceipt = {
      actionId: "action_1",
      fileIds: ["file_1"],
      issueId: "issue_1",
      issueNumber: 1,
      operation: "added",
      revision: 2,
    }
    const add = vi.fn<
      AgentToolExecutor<
        AddIssueAttachmentsToolInput,
        AddAttachmentWriteToolOutput
      >
    >(() => Promise.resolve(receipt))

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
    expect(add).toHaveBeenCalledOnce()
  })

  it("添付削除を一度だけ渡して削除receiptを返す", async () => {
    const removedReceipt: AgentAttachmentMutationReceipt = {
      actionId: "action_1",
      fileIds: ["file_1"],
      issueId: "issue_1",
      issueNumber: 1,
      operation: "removed",
      revision: 2,
    }
    const remove = vi.fn<
      AgentToolExecutor<
        RemoveIssueAttachmentsToolInput,
        RemoveAttachmentWriteToolOutput
      >
    >(() => Promise.resolve(removedReceipt))

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
    expect(remove).toHaveBeenCalledOnce()
  })

  it("添付追加で削除receiptを拒否する", async () => {
    const removedReceipt: AgentAttachmentMutationReceipt = {
      actionId: "action_1",
      fileIds: ["file_1"],
      issueId: "issue_1",
      issueNumber: 1,
      operation: "removed",
      revision: 2,
    }
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
  })

  it("添付削除で追加receiptを拒否する", async () => {
    const addedReceipt: AgentAttachmentMutationReceipt = {
      actionId: "action_1",
      fileIds: ["file_1"],
      issueId: "issue_1",
      issueNumber: 1,
      operation: "added",
      revision: 2,
    }
    const wrongRemove = vi.fn<
      AgentToolExecutor<
        RemoveIssueAttachmentsToolInput,
        RemoveAttachmentWriteToolOutput
      >
    >(() =>
      Promise.resolve<RemoveAttachmentWriteToolOutput>(
        JSON.parse(JSON.stringify(addedReceipt))
      )
    )

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

  it("budgetを消費する実行前に重複添付を拒否する", async () => {
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

  it.each([
    {
      name: "Issue作成",
      invoke: () =>
        createCreateIssueTool(unreachableWriteExecution).execute?.(
          { title: "Issue" },
          { observe: noopObserve, requestContext }
        ),
    },
    {
      name: "Issue更新",
      invoke: () =>
        createUpdateIssueTool(unreachableWriteExecution).execute?.(
          { expectedRevision: 1, issueId: "issue_1", title: "Updated" },
          { observe: noopObserve, requestContext }
        ),
    },
    {
      name: "Issue削除",
      invoke: () =>
        createDeleteIssueTool(unreachableWriteExecution).execute?.(
          { expectedRevision: 1, issueId: "issue_1" },
          { observe: noopObserve, requestContext }
        ),
    },
    {
      name: "Issue添付追加",
      invoke: () =>
        createAddIssueAttachmentsTool(unreachableWriteExecution).execute?.(
          {
            assetIds: ["asset_1"],
            expectedRevision: 1,
            issueId: "issue_1",
          },
          { observe: noopObserve, requestContext }
        ),
    },
    {
      name: "Issue添付削除",
      invoke: () =>
        createRemoveIssueAttachmentsTool(unreachableWriteExecution).execute?.(
          {
            expectedRevision: 1,
            fileIds: ["file_1"],
            issueId: "issue_1",
          },
          { observe: noopObserve, requestContext }
        ),
    },
  ])(
    "$nameでprovider tool-call identity欠損を固定errorへ変換する",
    async ({ invoke }) => {
      await expect(invoke()).rejects.toThrow("Agent tool execution failed")
    }
  )

  it("代表書込toolの不正出力を安全に投影する", async () => {
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

describe("Agent書込の正規化", () => {
  it("Issue作成で指定したassigneeを保持して添付の既定値を補う", async () => {
    const create = vi.fn<
      AgentToolExecutor<CreateIssueToolInput, IssueWriteToolOutput>
    >(() => Promise.resolve(rejected))

    await createCreateIssueTool(create).execute?.(
      { assigneeId: "member_1", title: " Issue " },
      context
    )

    expect(create).toHaveBeenCalledWith(
      {
        assigneeId: "member_1",
        attachmentAssetIds: [],
        title: "Issue",
      },
      expect.any(Object)
    )
  })

  it("Issue作成で省略したassigneeを追加せず添付の既定値を補う", async () => {
    const create = vi.fn<
      AgentToolExecutor<CreateIssueToolInput, IssueWriteToolOutput>
    >(() => Promise.resolve(rejected))

    await createCreateIssueTool(create).execute?.({ title: "Issue" }, context)

    expect(create).toHaveBeenCalledWith(
      { attachmentAssetIds: [], title: "Issue" },
      expect.any(Object)
    )
  })

  it("Issue更新で未割当assigneeを保持する", async () => {
    const update = vi.fn<
      AgentToolExecutor<UpdateIssueToolInput, IssueWriteToolOutput>
    >(() => Promise.resolve(rejected))

    await createUpdateIssueTool(update).execute?.(
      { assigneeId: null, expectedRevision: 1, issueId: "issue_1" },
      context
    )

    expect(update).toHaveBeenCalledWith(
      { assigneeId: null, expectedRevision: 1, issueId: "issue_1" },
      expect.any(Object)
    )
  })

  it("Issue更新で指定したstatusだけを渡す", async () => {
    const update = vi.fn<
      AgentToolExecutor<UpdateIssueToolInput, IssueWriteToolOutput>
    >(() => Promise.resolve(rejected))

    await createUpdateIssueTool(update).execute?.(
      { expectedRevision: 1, issueId: "issue_1", status: "closed" },
      context
    )

    expect(update).toHaveBeenCalledWith(
      { expectedRevision: 1, issueId: "issue_1", status: "closed" },
      expect.any(Object)
    )
  })

  it("Issue削除で任意fieldを追加せず識別子だけを整形する", async () => {
    const remove = vi.fn<
      AgentToolExecutor<DeleteIssueToolInput, IssueWriteToolOutput>
    >(() => Promise.resolve(rejected))

    await createDeleteIssueTool(remove).execute?.(
      { expectedRevision: 1, issueId: " issue_1 " },
      context
    )

    expect(remove).toHaveBeenCalledWith(
      { expectedRevision: 1, issueId: "issue_1" },
      expect.any(Object)
    )
  })

  it("変更fieldのないIssue更新をexecutor実行前に拒否する", async () => {
    const update = vi.fn<
      AgentToolExecutor<UpdateIssueToolInput, IssueWriteToolOutput>
    >(() => Promise.resolve(rejected))

    await expect(
      createUpdateIssueTool(update).execute?.(
        { expectedRevision: 1, issueId: "issue_1" },
        context
      )
    ).rejects.toThrow("Agent tool execution failed")
    expect(update).not.toHaveBeenCalled()
  })
})
