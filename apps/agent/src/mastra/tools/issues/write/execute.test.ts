import type { AgentIssueAction } from "@enterprise-agentic-saas/agent-contracts"
import { describe, expect, it, vi } from "vitest"

import { createAgentToolBudget } from "../../../core/budget/tool"
import type { AgentControlPlanePort as AgentInternalGateway } from "../../../runtime/ports"
import { createAgentWriteHandlers, toSafeActionReceipt } from "./execute"
import { createIssueWriteTools } from "./tool"

const RUN_GRANT = "run_0123456789abcdefghijklmnopqrstuvwxyz"
const ROOT_RUN_ID = "root_run_1"
type WriteApi = Pick<
  AgentInternalGateway,
  | "executeApprovedAction"
  | "prepareCreateIssue"
  | "prepareDeleteIssue"
  | "prepareUpdateIssue"
>

const preview: NonNullable<AgentIssueAction["preview"]> = {
  attachmentOperation: null,
  attachments: [],
  destructive: false,
  fields: [{ after: "Issue", before: null, field: "title" }],
  issueNumber: null,
  issueRevision: null,
  kind: "create_issue",
  title: "Create Issue",
}

const action = (
  status: AgentIssueAction["status"] = "pending"
): AgentIssueAction => ({
  approvalMode: status === "approved" ? "full_access" : null,
  completedAt: status === "succeeded" ? "2026-07-22T00:00:00.000Z" : null,
  expiresAt: "2026-07-22T01:00:00.000Z",
  id: "action_1",
  kind: "create_issue",
  preview,
  previewState: "available",
  requiresApproval: status === "pending",
  status,
})

const terminalAction = (kind: AgentIssueAction["kind"]): AgentIssueAction => ({
  approvalMode: null,
  completedAt: "2026-07-22T00:00:00.000Z",
  expiresAt: "2026-07-22T01:00:00.000Z",
  id: `action_${kind}`,
  kind,
  preview: null,
  previewState: "expired",
  requiresApproval: false,
  status: "rejected",
})

const harness = (status: AgentIssueAction["status"] = "pending") => {
  const prepared: Parameters<WriteApi["prepareCreateIssue"]>[0][] = []
  const executeApprovedAction = vi
    .fn<WriteApi["executeApprovedAction"]>()
    .mockResolvedValue({
      actionId: "action_1",
      issue: { deleted: false, id: "issue_1", number: 7, revision: 1 },
      kind: "create_issue",
      status: "succeeded",
    })
  const api: WriteApi = {
    executeApprovedAction,
    prepareCreateIssue: (input) => {
      prepared.push(input)
      return Promise.resolve(action(status))
    },
    prepareDeleteIssue: () => Promise.reject(new Error("not used")),
    prepareUpdateIssue: () => Promise.reject(new Error("not used")),
  }
  const consume = vi.fn<(kind: "client" | "read" | "write") => void>()
  const suspendForApproval = vi.fn<() => void>()
  const holdForApproval = vi.fn<() => void>()
  const handlers = createAgentWriteHandlers(
    api,
    RUN_GRANT,
    { consume, suspendForApproval },
    { holdForApproval, suspendAction: async () => undefined },
    ROOT_RUN_ID
  )
  return {
    api,
    consume,
    executeApprovedAction,
    handlers,
    holdForApproval,
    prepared,
    suspendForApproval,
  }
}

const mutationHarness = () => {
  const prepareUpdateIssue = vi
    .fn<WriteApi["prepareUpdateIssue"]>()
    .mockResolvedValue(terminalAction("update_issue"))
  const prepareDeleteIssue = vi
    .fn<WriteApi["prepareDeleteIssue"]>()
    .mockResolvedValue(terminalAction("delete_issue"))
  const consume = vi.fn<(kind: "client" | "read" | "write") => void>()
  const handlers = createAgentWriteHandlers(
    {
      executeApprovedAction: () => Promise.reject(new Error("not used")),
      prepareCreateIssue: () => Promise.reject(new Error("not used")),
      prepareDeleteIssue,
      prepareUpdateIssue,
    },
    RUN_GRANT,
    {
      consume,
      suspendForApproval: vi.fn<() => void>(),
    },
    {
      holdForApproval: vi.fn<() => void>(),
      suspendAction: async () => undefined,
    },
    ROOT_RUN_ID
  )
  return { consume, handlers, prepareDeleteIssue, prepareUpdateIssue }
}

describe("action identityの契約", () => {
  it("一つのroot run内のprovider呼出間で安定しlogical writeごとに変わる", async () => {
    const identityFor = async (
      issue: { labels?: string[]; title: string },
      toolCallId: string,
      rootRunId = ROOT_RUN_ID
    ) => {
      const test = harness()
      const handlers = createAgentWriteHandlers(
        test.api,
        RUN_GRANT,
        {
          consume: vi.fn<(kind: "client" | "read" | "write") => void>(),
          suspendForApproval: vi.fn<() => void>(),
        },
        {
          holdForApproval: vi.fn<() => void>(),
          suspendAction: async () => undefined,
        },
        rootRunId
      )
      await handlers.createIssue(issue, toolCallId)
      const prepared = test.prepared[0]
      if (!prepared) throw new Error("expected a prepared Issue action")
      return {
        idempotencyKey: prepared.idempotencyKey,
        toolCallId: prepared.toolCallId,
      }
    }

    const first = await identityFor(
      { labels: ["bug"], title: "Issue" },
      "call_1"
    )
    const reordered = await identityFor(
      { title: "Issue", labels: ["bug"] },
      "call_1"
    )
    const changedPayload = await identityFor({ title: "Other" }, "call_1")
    const changedCall = await identityFor(
      { labels: ["bug"], title: "Issue" },
      "call_2"
    )
    const changedScope = await identityFor(
      { labels: ["bug"], title: "Issue" },
      "call_1",
      "root_run_2"
    )

    expect(first).toEqual(reordered)
    expect(first.idempotencyKey).toMatch(/^v1\.[a-f0-9]{64}$/)
    expect(first.idempotencyKey).not.toBe(changedPayload.idempotencyKey)
    expect(first.idempotencyKey).toBe(changedCall.idempotencyKey)
    expect(first.toolCallId).not.toBe(changedCall.toolCallId)
    expect(first.idempotencyKey).not.toBe(changedScope.idempotencyKey)
  })

  it("内部APIに安全でないprovider tool IDをhash化する", async () => {
    const test = harness()
    const handlers = createAgentWriteHandlers(
      test.api,
      RUN_GRANT,
      {
        consume: vi.fn<(kind: "client" | "read" | "write") => void>(),
        suspendForApproval: vi.fn<() => void>(),
      },
      {
        holdForApproval: vi.fn<() => void>(),
        suspendAction: async () => undefined,
      },
      ROOT_RUN_ID
    )
    await handlers.createIssue({ title: "Issue" }, "provider/call with secrets")
    expect(test.prepared[0]?.toolCallId).toMatch(/^call_[a-f0-9]{64}$/)
  })
})

describe("createAgentWriteHandlersの契約", () => {
  it("安全な正規pending previewだけを返してsettlementを保留する", async () => {
    const test = harness("pending")
    const result = await test.handlers.createIssue(
      { attachmentAssetIds: [], title: "Issue" },
      "call_1"
    )

    expect(test.consume).toHaveBeenCalledWith("write")
    expect(test.prepared[0]).toMatchObject({
      grant: RUN_GRANT,
      issue: { attachmentAssetIds: [], title: "Issue" },
      toolCallId: "call_1",
    })
    expect(test.prepared[0]?.idempotencyKey).toMatch(/^v1\.[a-f0-9]{64}$/)
    expect(result).toEqual({
      actionId: "action_1",
      expiresAt: "2026-07-22T01:00:00.000Z",
      preview,
      requiresApproval: true,
      status: "pending",
    })
    expect(test.holdForApproval).toHaveBeenCalledOnce()
    expect(test.suspendForApproval).toHaveBeenCalledOnce()
    expect(test.executeApprovedAction).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain(RUN_GRANT)
  })

  it("pending変更後に共通tool controlをsuspendする", async () => {
    const test = harness("pending")
    const budget = createAgentToolBudget()
    const handlers = createAgentWriteHandlers(
      test.api,
      RUN_GRANT,
      budget,
      {
        holdForApproval: vi.fn<() => void>(),
        suspendAction: async () => undefined,
      },
      ROOT_RUN_ID
    )

    await handlers.createIssue({ title: "Issue" }, "call_1")

    for (const kind of ["read", "write", "client"] as const) {
      expect(() => budget.consume(kind)).toThrow(
        "Agent tools suspended for approval"
      )
    }
    expect(test.prepared).toHaveLength(1)
  })

  it("prepare前に重複と空白を正規化する", async () => {
    const test = harness("pending")
    await test.handlers.createIssue(
      {
        assigneeId: " member_1 ",
        attachmentAssetIds: ["asset_1", "asset_1"],
        labels: [" bug ", "bug"],
        title: " Issue ",
      },
      "call_1"
    )

    expect(test.prepared[0]?.issue).toEqual({
      assigneeId: "member_1",
      attachmentAssetIds: ["asset_1"],
      labels: ["bug"],
      title: "Issue",
    })
  })

  it("空のmodel assigneeを未割当Issueへ正規化する", async () => {
    const parsed = {
      assigneeId: "",
      title: "Issue",
    }
    const test = harness("pending")

    await test.handlers.createIssue(parsed, "call_1")

    expect(test.prepared[0]?.issue).toEqual({
      assigneeId: null,
      attachmentAssetIds: [],
      title: "Issue",
    })
  })

  it("自動承認actionを即時実行して最小receiptを返す", async () => {
    const test = harness("approved")

    await expect(
      test.handlers.createIssue({ title: "Issue" }, "call_1")
    ).resolves.toEqual({
      actionId: "action_1",
      issue: { deleted: false, id: "issue_1", number: 7, revision: 1 },
      kind: "create_issue",
      status: "succeeded",
    })
    expect(test.executeApprovedAction).toHaveBeenCalledWith({
      actionId: "action_1",
      grant: RUN_GRANT,
    })
    expect(test.holdForApproval).not.toHaveBeenCalled()
  })

  it("余分なdataを転送せず全pending preview値を無害化する", async () => {
    const test = harness("pending")
    test.api.prepareCreateIssue = () =>
      Promise.resolve({
        ...action("pending"),
        expiresAt: "x".repeat(100),
        preview: {
          attachmentOperation: "add",
          attachments: [
            {
              source: "asset",
              assetId: "asset_1",
              filename: "safe.webp",
              sizeBytes: 12,
            },
            {
              source: "asset",
              assetId: "unsafe/id",
              filename: "x".repeat(250),
              sizeBytes: -1,
            },
          ],
          destructive: false,
          fields: [
            { after: ["bug", "x".repeat(250)], before: null, field: "labels" },
            {
              after: "x".repeat(2_100),
              before: "old",
              field: "description",
            },
          ],
          issueNumber: 3,
          issueRevision: -1,
          kind: "create_issue",
          title: "x".repeat(250),
        },
      })

    const result = await test.handlers.createIssue({ title: "Issue" }, "call_1")
    expect(result).toMatchObject({
      actionId: "action_1",
      expiresAt: `${"x".repeat(64)}…`,
      preview: {
        attachments: [
          { assetId: "asset_1", filename: "safe.webp", sizeBytes: 12 },
          {
            assetId: "invalid",
            filename: `${"x".repeat(200)}…`,
            sizeBytes: 0,
          },
        ],
        fields: [
          {
            after: ["bug", `${"x".repeat(200)}…`],
            before: null,
            field: "labels",
          },
          {
            after: `${"x".repeat(2_000)}…`,
            before: "old",
            field: "description",
          },
        ],
        issueNumber: 3,
        issueRevision: null,
        title: `${"x".repeat(200)}…`,
      },
      status: "pending",
    })
  })

  it("実行せずterminal stateを返して成功済みactionをreceiptで再試行する", async () => {
    const rejected = harness("rejected")
    await expect(
      rejected.handlers.createIssue({ title: "Issue" }, "call_1")
    ).resolves.toEqual({
      actionId: "action_1",
      requiresApproval: false,
      status: "rejected",
    })
    expect(rejected.executeApprovedAction).not.toHaveBeenCalled()

    const succeeded = harness("succeeded")
    await succeeded.handlers.createIssue({ title: "Issue" }, "call_1")
    expect(succeeded.executeApprovedAction).toHaveBeenCalledOnce()
  })

  it("pending actionの不正なIDを拒否する", async () => {
    const invalidId = harness("pending")
    invalidId.api.prepareCreateIssue = () =>
      Promise.resolve({ ...action("pending"), id: "unsafe/id" })
    await expect(
      invalidId.handlers.createIssue({ title: "Issue" }, "call_1")
    ).rejects.toThrow("Issue write capability is unavailable")
  })

  it("pending actionの異なるkindを拒否する", async () => {
    const wrongKind = harness("pending")
    wrongKind.api.prepareCreateIssue = () =>
      Promise.resolve({ ...action("pending"), kind: "update_issue" })
    await expect(
      wrongKind.handlers.createIssue({ title: "Issue" }, "call_1")
    ).rejects.toThrow("Issue write capability is unavailable")
  })

  it("pending actionの欠損previewを拒否する", async () => {
    const missingPreview = harness("pending")
    missingPreview.api.prepareCreateIssue = () =>
      Promise.resolve({ ...action("pending"), preview: null })
    await expect(
      missingPreview.handlers.createIssue({ title: "Issue" }, "call_1")
    ).rejects.toThrow("Issue write capability is unavailable")
    expect(missingPreview.holdForApproval).not.toHaveBeenCalled()
    expect(missingPreview.suspendForApproval).not.toHaveBeenCalled()
  })

  it("pending actionの不正なpreviewを承認保留前に拒否する", async () => {
    const malformedPreview = harness("pending")
    malformedPreview.api.prepareCreateIssue = () => {
      const malformed = action("pending")
      if (malformed.preview !== null) {
        Reflect.set(malformed.preview, "fields", null)
      }
      return Promise.resolve(malformed)
    }
    await expect(
      malformedPreview.handlers.createIssue({ title: "Issue" }, "call_1")
    ).rejects.toThrow("Issue write capability is unavailable")
    expect(malformedPreview.holdForApproval).not.toHaveBeenCalled()
    expect(malformedPreview.suspendForApproval).not.toHaveBeenCalled()
  })

  it("成功receiptの不正なIssue番号を拒否する", () => {
    expect(() =>
      toSafeActionReceipt({
        actionId: "action_1",
        issue: { deleted: false, id: "issue_1", number: 0, revision: 1 },
        kind: "create_issue",
        status: "succeeded",
      })
    ).toThrow("Issue write capability is unavailable")
  })

  it("内部失敗を固定errorへ置換する", async () => {
    const test = harness("pending")
    const cause = new Error(`private ${RUN_GRANT}`)
    test.api.prepareCreateIssue = () => Promise.reject(cause)

    const failure = await test.handlers
      .createIssue({ title: "Issue" }, "call_1")
      .then(
        () => undefined,
        (error: unknown) => error
      )
    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) throw new Error("Expected write error")
    expect(failure.message).toBe("Issue write capability is unavailable")
    expect(failure.cause).toBe(cause)
    expect(String(failure)).not.toContain(RUN_GRANT)
  })

  it("Issue更新payloadを正規化してwrite budgetを消費する", async () => {
    const test = mutationHarness()

    await expect(
      test.handlers.updateIssue(
        {
          assigneeId: " ",
          expectedRevision: 1,
          issueId: " issue_1 ",
          labels: [" bug ", "bug"],
          title: " Updated ",
        },
        "call_update"
      )
    ).resolves.toMatchObject({ status: "rejected" })
    expect(test.prepareUpdateIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        issue: {
          assigneeId: null,
          expectedRevision: 1,
          issueId: "issue_1",
          labels: ["bug"],
          title: "Updated",
        },
        toolCallId: "call_update",
      })
    )
    expect(test.consume).toHaveBeenCalledOnce()
    expect(test.consume).toHaveBeenCalledWith("write")
  })

  it("Issue削除payloadを正規化してwrite budgetを消費する", async () => {
    const test = mutationHarness()

    await expect(
      test.handlers.deleteIssue(
        { expectedRevision: 1, issueId: " issue_1 " },
        "call_delete"
      )
    ).resolves.toMatchObject({ status: "rejected" })
    expect(test.prepareDeleteIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        issue: { expectedRevision: 1, issueId: "issue_1" },
        toolCallId: "call_delete",
      })
    )
    expect(test.consume).toHaveBeenCalledOnce()
    expect(test.consume).toHaveBeenCalledWith("write")
  })

  it("添付追加payloadを正規化してwrite budgetを消費する", async () => {
    const test = mutationHarness()

    await expect(
      test.handlers.addIssueAttachments(
        {
          assetIds: ["asset_1", "asset_1"],
          expectedRevision: 1,
          issueId: " issue_1 ",
        },
        "call_add_attachments"
      )
    ).resolves.toMatchObject({ status: "rejected" })
    expect(test.prepareUpdateIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        issue: {
          attachmentAssetIds: ["asset_1"],
          expectedRevision: 1,
          issueId: "issue_1",
          operation: "add_attachments",
        },
        toolCallId: "call_add_attachments",
      })
    )
    expect(test.consume).toHaveBeenCalledOnce()
    expect(test.consume).toHaveBeenCalledWith("write")
  })

  it("添付削除payloadを正規化してwrite budgetを消費する", async () => {
    const test = mutationHarness()

    await expect(
      test.handlers.removeIssueAttachments(
        {
          expectedRevision: 1,
          fileIds: ["file_1", "file_1"],
          issueId: " issue_1 ",
        },
        "call_remove_attachments"
      )
    ).resolves.toMatchObject({ status: "rejected" })

    expect(test.prepareUpdateIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        issue: {
          attachmentFileIds: ["file_1"],
          expectedRevision: 1,
          issueId: "issue_1",
          operation: "remove_attachments",
        },
        toolCallId: "call_remove_attachments",
      })
    )
    expect(test.consume).toHaveBeenCalledOnce()
    expect(test.consume).toHaveBeenCalledWith("write")
  })
})

describe("Issue write tool registryの契約", () => {
  it("server側Issue変更toolを五つだけ定義する", () => {
    const issueWriteTools = createIssueWriteTools(() => {
      throw new Error("unused")
    })
    expect(Object.keys(issueWriteTools).toSorted()).toEqual([
      "add_issue_attachments",
      "create_issue",
      "delete_issue",
      "remove_issue_attachments",
      "update_issue",
    ])
  })
})
