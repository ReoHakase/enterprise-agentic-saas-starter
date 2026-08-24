import * as v from "valibot"
import { describe, expect, it } from "vitest"

import {
  agentConnectionSchema,
  agentContextRevocationSchema,
  agentCreateIssueActionInputSchema,
  agentActionExecutionResultSchema,
  agentApprovalPolicySchema,
  agentGetIssueInputSchema,
  agentGetIssueToolOutputSchema,
  agentAttachmentMutationReceiptSchema,
  agentChatRunSchema,
  agentIssueActionSchema,
  agentIssueDetailSchema,
  agentIssueSchema,
  agentMemberListSchema,
  agentResumeTicketSchema,
  agentRunGrantSchema,
  agentRunLivenessSchema,
  agentRunResultSchema,
  agentSearchIssuesInputSchema,
  agentUpdateIssueActionInputSchema,
  agentUsageRecordInputSchema,
  agentWebSearchAuthorizationSchema,
  getIssueToolInputSchema,
} from "./schemas"
import {
  addAttachmentWriteToolOutputSchema,
  addIssueAttachmentsToolInputSchema,
  removeAttachmentWriteToolOutputSchema,
  removeIssueAttachmentsToolInputSchema,
} from "./tools"

const VALID_GRANT = "grant_0123456789abcdefghijklmnopqrstuvwxyz"

const issue = {
  id: "issue_1",
  number: 1,
  title: "Issue",
  description: "Description",
  status: "open",
  priority: "medium",
  assigneeId: null,
  labels: ["bug"],
  dueDate: null,
  revision: 1,
  createdAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T00:00:00.000Z",
} as const
const attachmentReceipt = {
  actionId: "action_1",
  operation: "added",
  issueId: "issue_1",
  issueNumber: 1,
  revision: 2,
  fileIds: ["file_1"],
} as const
const connection = {
  expiresAt: "2026-07-28T00:00:00.000Z",
  grant: VALID_GRANT,
  memoryResourceId: "resource_1",
  organization: {
    name: "Organization",
    permissions: {
      canCreateIssues: true,
      canDeleteAnyIssue: false,
      canDeleteOwnIssues: true,
      canReadIssues: true,
      canUpdateIssues: true,
    },
    role: "member",
    slug: "organization",
  },
  thread: { id: "thread_1", title: "Thread" },
  user: { name: "User", profileImage: null },
} as const
const run = {
  attempt: 1,
  expiresAt: "2026-07-28T00:00:00.000Z",
  grant: VALID_GRANT,
  rootRunId: "root_1",
  runId: "run_1",
  shouldGenerateTitle: false,
} as const
const chatRun = {
  memoryResourceId: connection.memoryResourceId,
  organization: connection.organization,
  run,
  thread: connection.thread,
  user: connection.user,
} as const
const action = {
  approvalMode: "manual",
  completedAt: null,
  expiresAt: "2026-07-28T00:00:00.000Z",
  id: "action_1",
  kind: "delete_issue",
  preview: null,
  previewState: "available",
  requiresApproval: true,
  status: "pending",
} as const
const usage = {
  provider: "openrouter",
  model: "model",
  inputTokenCount: 1,
  inputNoCacheTokenCount: 1,
  cacheReadTokenCount: 0,
  cacheWriteTokenCount: 0,
  outputTokenCount: 1,
  textOutputTokenCount: 1,
  reasoningTokenCount: 0,
  totalTokenCount: 2,
  imageInputCount: 0,
  durationMs: 1,
  runEventId: "event_1",
} as const

describe("agent contract runtime schemaの契約", () => {
  it("有界なIssue契約を受け入れる", () => {
    expect(v.parse(agentIssueSchema, issue)).toEqual(issue)
  })

  it("未知fieldを除去せず拒否する", () => {
    expect(
      v.safeParse(agentIssueSchema, {
        ...issue,
        organizationId: "org_1",
      }).success
    ).toBe(false)
    expect(
      v.safeParse(agentAttachmentMutationReceiptSchema, {
        ...attachmentReceipt,
        fileIds: ["file_1", "file_1"],
      }).success
    ).toBe(false)
    expect(
      v.safeParse(agentAttachmentMutationReceiptSchema, {
        ...attachmentReceipt,
        fileIds: Array.from({ length: 5 }, (_, index) => `file_${index}`),
      }).success
    ).toBe(false)
    expect(
      v.safeParse(agentAttachmentMutationReceiptSchema, {
        ...attachmentReceipt,
        operation: "removed",
        fileIds: Array.from({ length: 20 }, (_, index) => `file_${index}`),
      }).success
    ).toBe(true)
  })

  it("異なるupdate operationのfieldを拒否する", () => {
    expect(
      v.safeParse(agentUpdateIssueActionInputSchema, {
        operation: "add_attachments",
        issueId: "issue_1",
        expectedRevision: 1,
        attachmentAssetIds: ["asset_1"],
        title: "cross operation",
      }).success
    ).toBe(false)
    expect(
      v.safeParse(agentUpdateIssueActionInputSchema, {
        operation: "remove_attachments",
        issueId: "issue_1",
        expectedRevision: 1,
        attachmentFileIds: ["file_1"],
        attachmentAssetIds: ["asset_1"],
      }).success
    ).toBe(false)
  })

  it("tenantとcapability値をbusiness tool入力から除外する", () => {
    expect(
      v.parse(getIssueToolInputSchema, { lookup: "id", id: "issue_1" })
    ).toEqual({ lookup: "id", id: "issue_1" })
    expect(
      v.safeParse(getIssueToolInputSchema, {
        lookup: "id",
        id: "issue_1",
        organizationId: "org_1",
      }).success
    ).toBe(false)
  })

  it("storage詳細を公開せず添付receiptを制限する", () => {
    expect(
      v.parse(agentAttachmentMutationReceiptSchema, attachmentReceipt)
    ).toEqual(attachmentReceipt)
    expect(
      v.safeParse(agentAttachmentMutationReceiptSchema, {
        ...attachmentReceipt,
        privateUrl: "https://private.invalid/file",
      }).success
    ).toBe(false)
  })

  it("添付変更入力を制限して重複またはprivate fieldを拒否する", () => {
    expect(
      v.safeParse(addIssueAttachmentsToolInputSchema, {
        issueId: "issue_1",
        expectedRevision: 1,
        assetIds: ["a", "b", "c", "d"],
      }).success
    ).toBe(true)
    expect(
      v.safeParse(addIssueAttachmentsToolInputSchema, {
        issueId: "issue_1",
        expectedRevision: 1,
        assetIds: ["a", "b", "c", "d", "e"],
      }).success
    ).toBe(false)
    expect(
      v.safeParse(removeIssueAttachmentsToolInputSchema, {
        issueId: "issue_1",
        expectedRevision: 1,
        fileIds: ["file_1", "file_1"],
      }).success
    ).toBe(false)
    expect(
      v.safeParse(removeIssueAttachmentsToolInputSchema, {
        issueId: "issue_1",
        expectedRevision: 1,
        fileIds: Array.from({ length: 20 }, (_, index) => `file_${index}`),
        organizationId: "private_org",
      }).success
    ).toBe(false)
  })

  it("operation固有の添付tool出力を検証する", () => {
    const pendingPreview = {
      actionId: "action_1",
      expiresAt: "2026-07-28T01:00:00.000Z",
      requiresApproval: true,
      status: "pending",
      preview: {
        kind: "update_issue",
        destructive: true,
        attachmentOperation: "add",
        title: "Add attachment",
        issueNumber: 1,
        issueRevision: 1,
        fields: [],
        attachments: [
          {
            source: "asset",
            assetId: "asset_1",
            filename: "image.png",
            sizeBytes: 4,
          },
        ],
      },
    } as const
    expect(
      v.safeParse(addAttachmentWriteToolOutputSchema, attachmentReceipt).success
    ).toBe(true)
    expect(
      v.safeParse(removeAttachmentWriteToolOutputSchema, {
        ...attachmentReceipt,
        operation: "removed",
      }).success
    ).toBe(true)
    expect(
      v.safeParse(addAttachmentWriteToolOutputSchema, pendingPreview).success
    ).toBe(true)
    expect(
      v.safeParse(removeAttachmentWriteToolOutputSchema, {
        ...pendingPreview,
        preview: {
          ...pendingPreview.preview,
          attachmentOperation: "remove",
          attachments: [
            {
              source: "file",
              fileId: "file_1",
              filename: "image.png",
              sizeBytes: 4,
            },
          ],
        },
      }).success
    ).toBe(true)
    expect(
      v.safeParse(addAttachmentWriteToolOutputSchema, {
        ...attachmentReceipt,
        operation: "removed",
      }).success
    ).toBe(false)
    expect(
      v.safeParse(removeAttachmentWriteToolOutputSchema, attachmentReceipt)
        .success
    ).toBe(false)
    expect(
      v.safeParse(addAttachmentWriteToolOutputSchema, {
        ...pendingPreview,
        preview: {
          ...pendingPreview.preview,
          attachmentOperation: "remove",
        },
      }).success
    ).toBe(false)
    expect(
      v.safeParse(removeAttachmentWriteToolOutputSchema, {
        ...pendingPreview,
        preview: {
          ...pendingPreview.preview,
          attachmentOperation: "remove",
        },
      }).success
    ).toBe(false)
    for (const schema of [
      addAttachmentWriteToolOutputSchema,
      removeAttachmentWriteToolOutputSchema,
    ]) {
      expect(
        v.safeParse(schema, {
          actionId: "action_1",
          requiresApproval: false,
          status: "canceled",
        }).success
      ).toBe(true)
    }
  })

  it("実行receipt内の重複添付変更を拒否する", () => {
    for (const operation of ["added", "removed"] as const) {
      const result = {
        actionId: "action_1",
        kind: "update_issue",
        status: "succeeded",
        issue: {
          id: "issue_1",
          number: 1,
          revision: 2,
          deleted: false,
          attachmentMutation: {
            operation,
            fileIds: ["file_1", "file_1"],
          },
        },
      }
      expect(
        v.safeParse(agentActionExecutionResultSchema, result).success
      ).toBe(false)
      result.issue.attachmentMutation.fileIds = ["file_1"]
      expect(
        v.safeParse(agentActionExecutionResultSchema, result).success
      ).toBe(true)
    }
  })

  it.each([
    ["上限未満", 99, true],
    ["上限", 100, true],
    ["上限超過", 101, false],
  ])("get_issue attachmentLimitの%sを強制する", (_label, limit, success) => {
    expect(
      v.safeParse(getIssueToolInputSchema, {
        lookup: "number",
        number: 1,
        attachmentLimit: limit,
      }).success
    ).toBe(success)
  })

  it.each([
    ["上限未満", 99, true],
    ["上限", 100, true],
    ["上限超過", 101, false],
  ])("get_issue添付response件数の%sを強制する", (_label, count, success) => {
    const attachments = Array.from({ length: count }, (_, index) => ({
      id: `file_${index}`,
      filename: `file-${index}.txt`,
      sizeBytes: 1,
      declaredContentType: "text/plain",
      imageReadable: false,
      textPreviewable: true,
      dimensions: null,
      uploaderName: "User",
      createdAt: "2026-07-28T00:00:00.000Z",
    }))
    expect(
      v.safeParse(agentIssueDetailSchema, {
        ...issue,
        attachments: { items: attachments, nextCursor: null },
      }).success
    ).toBe(success)
  })
})

describe("agent contract response schemaの契約", () => {
  it("両lookup variantを受け入れて混在または不正variantを拒否する", () => {
    expect(
      v.safeParse(getIssueToolInputSchema, {
        lookup: "id",
        id: "issue_1",
      }).success
    ).toBe(true)
    expect(
      v.safeParse(agentGetIssueInputSchema, {
        grant: VALID_GRANT,
        lookup: "number",
        number: 1,
      }).success
    ).toBe(true)
    expect(
      v.safeParse(getIssueToolInputSchema, {
        lookup: "id",
        id: "issue_1",
        number: 1,
      }).success
    ).toBe(false)
    expect(
      v.safeParse(getIssueToolInputSchema, {
        lookup: "number",
        number: 0,
      }).success
    ).toBe(false)
  })

  it("nullable fieldと省略済み必須fieldを区別する", () => {
    expect(v.safeParse(agentIssueSchema, issue).success).toBe(true)
    expect(
      v.safeParse(agentIssueSchema, {
        ...issue,
        dueDate: "2026-07-28T00:00:00.000Z",
      }).success
    ).toBe(true)
    expect(
      v.safeParse(agentIssueSchema, {
        ...issue,
        dueDate: "2026-07-28",
      }).success
    ).toBe(false)
    expect(
      v.safeParse(agentIssueSchema, { ...issue, assigneeId: undefined }).success
    ).toBe(false)
    expect(
      v.safeParse(agentIssueSchema, { ...issue, dueDate: undefined }).success
    ).toBe(false)
  })

  it("不正timestampとidentifierと過大arrayを拒否する", () => {
    expect(
      v.safeParse(agentIssueSchema, {
        ...issue,
        id: "not/a/safe/id",
      }).success
    ).toBe(false)
    expect(
      v.safeParse(agentIssueSchema, {
        ...issue,
        createdAt: "tomorrow",
      }).success
    ).toBe(false)
    expect(
      v.safeParse(
        agentMemberListSchema,
        Array.from({ length: 51 }, (_, id) => ({
          id: `member_${id}`,
          name: "Member",
          profileImage: null,
          role: "member",
        }))
      ).success
    ).toBe(false)
    expect(
      v.safeParse(
        agentMemberListSchema,
        Array.from({ length: 50 }, (_, id) => ({
          id: `member_${id}`,
          name: "Member",
          profileImage: null,
          role: "member",
        }))
      ).success
    ).toBe(true)
  })

  it("connection responseを厳密に検証する", () => {
    expect(v.parse(agentConnectionSchema, connection)).toEqual(connection)
    expect(
      v.safeParse(agentConnectionSchema, {
        ...connection,
        privateUrl: "https://private.invalid",
      }).success
    ).toBe(false)
  })

  it("run grant responseを厳密に検証する", () => {
    expect(v.parse(agentRunGrantSchema, run)).toEqual(run)
    expect(
      v.safeParse(agentRunGrantSchema, { ...run, internalState: "private" })
        .success
    ).toBe(false)
  })

  it("chat run responseを厳密に検証する", () => {
    expect(v.parse(agentChatRunSchema, chatRun)).toEqual(chatRun)
    expect(
      v.safeParse(agentChatRunSchema, {
        ...chatRun,
        privateUrl: "https://private.invalid",
      }).success
    ).toBe(false)
  })

  it("run liveness responseを厳密に検証する", () => {
    expect(v.parse(agentRunLivenessSchema, { live: true })).toEqual({
      live: true,
    })
    expect(
      v.safeParse(agentRunLivenessSchema, {
        live: true,
        internalState: "private",
      }).success
    ).toBe(false)
  })

  it("Issue action responseを厳密に検証する", () => {
    expect(v.parse(agentIssueActionSchema, action)).toEqual(action)
    expect(
      v.safeParse(agentIssueActionSchema, {
        ...action,
        internalState: "private",
      }).success
    ).toBe(false)
  })

  it("usage record inputを厳密に検証する", () => {
    expect(v.parse(agentUsageRecordInputSchema, usage)).toEqual(usage)
    expect(
      v.safeParse(agentUsageRecordInputSchema, {
        ...usage,
        internalState: "private",
      }).success
    ).toBe(false)
  })

  it("Issue詳細responseを厳密に検証する", () => {
    const detail = {
      ...issue,
      attachments: { items: [], nextCursor: null },
    } as const

    expect(v.parse(agentIssueDetailSchema, detail)).toEqual(detail)
    expect(
      v.safeParse(agentIssueDetailSchema, {
        ...detail,
        internalState: "private",
      }).success
    ).toBe(false)
  })

  it("公開run resultを厳密に検証する", () => {
    const runResult = { runId: "run_1", status: "completed" } as const

    expect(v.parse(agentRunResultSchema, runResult)).toEqual(runResult)
    expect(
      v.safeParse(agentRunResultSchema, {
        ...runResult,
        internalState: "private",
      }).success
    ).toBe(false)
  })

  it("action execution resultを厳密に検証する", () => {
    const executionResult = {
      actionId: "action_1",
      issue: {
        attachmentMutation: {
          fileIds: ["file_1"],
          operation: "added",
        },
        deleted: false,
        id: "issue_1",
        number: 1,
        revision: 2,
      },
      kind: "update_issue",
      status: "succeeded",
    } as const

    expect(v.parse(agentActionExecutionResultSchema, executionResult)).toEqual(
      executionResult
    )
    expect(
      v.safeParse(agentActionExecutionResultSchema, {
        ...executionResult,
        internalState: "private",
      }).success
    ).toBe(false)
  })

  it("approval policy responseを厳密に検証する", () => {
    const approval = {
      mode: "full_access",
      permissions: {
        createIssue: true,
        deleteIssue: true,
        updateIssue: true,
      },
    } as const

    expect(v.parse(agentApprovalPolicySchema, approval)).toEqual(approval)
    expect(
      v.safeParse(agentApprovalPolicySchema, {
        ...approval,
        internalState: "private",
      }).success
    ).toBe(false)
  })

  it("context revocation responseを厳密に検証する", () => {
    const revocation = { contextEpoch: 2 } as const

    expect(v.parse(agentContextRevocationSchema, revocation)).toEqual(
      revocation
    )
    expect(
      v.safeParse(agentContextRevocationSchema, {
        ...revocation,
        internalState: "private",
      }).success
    ).toBe(false)
  })

  it.each([
    ["transport上限", agentIssueDetailSchema, 50_000, true],
    ["transport上限超過", agentIssueDetailSchema, 50_001, false],
    ["tool上限", agentGetIssueToolOutputSchema, 20_000, true],
    ["tool上限超過", agentGetIssueToolOutputSchema, 20_001, false],
  ])(
    "Issue description projectionを%sで分離する",
    (_label, schema, length, success) => {
      expect(
        v.safeParse(schema, {
          ...issue,
          description: "x".repeat(length),
          attachments: { items: [], nextCursor: null },
        }).success
      ).toBe(success)
    }
  )

  it("正規actionと検索入力の正規化に一致する", () => {
    expect(
      v.parse(agentCreateIssueActionInputSchema, {
        title: "  Issue  ",
        labels: ["  bug  ", "x".repeat(40)],
        attachmentAssetIds: ["asset_1", "asset_2"],
      })
    ).toEqual({
      title: "Issue",
      labels: ["bug", "x".repeat(40)],
      attachmentAssetIds: ["asset_1", "asset_2"],
    })
    expect(
      v.safeParse(agentCreateIssueActionInputSchema, {
        title: "   ",
      }).success
    ).toBe(false)
    expect(
      v.safeParse(agentCreateIssueActionInputSchema, {
        title: "Issue",
        labels: ["x".repeat(41)],
      }).success
    ).toBe(false)
    expect(
      v.safeParse(agentCreateIssueActionInputSchema, {
        title: "Issue",
        attachmentAssetIds: ["asset_1", "asset_1"],
      }).success
    ).toBe(false)
    expect(
      v.parse(agentSearchIssuesInputSchema, {
        grant: VALID_GRANT,
        search: `  ${"x".repeat(200)}  `,
      }).search
    ).toHaveLength(200)
    expect(
      v.safeParse(agentSearchIssuesInputSchema, {
        grant: VALID_GRANT,
        search: "x".repeat(201),
      }).success
    ).toBe(false)
    expect(
      v.parse(agentSearchIssuesInputSchema, {
        grant: VALID_GRANT,
        label: `  ${"x".repeat(40)}  `,
      }).label
    ).toHaveLength(40)
    expect(
      v.safeParse(agentSearchIssuesInputSchema, {
        grant: VALID_GRANT,
        label: "   ",
      }).success
    ).toBe(false)
  })

  it.each([
    ["短すぎる値", "x".repeat(31), false],
    ["最小値", "x".repeat(32), true],
    ["最大値", "x".repeat(512), true],
    ["長すぎる値", "x".repeat(513), false],
    ["空白付き", `${"x".repeat(31)} `, false],
    ["制御文字付き", `${"x".repeat(31)}\n`, false],
  ])("capability credentialの%sを検証する", (_label, token, success) => {
    expect(
      v.safeParse(agentResumeTicketSchema, {
        ticket: token,
        expiresAt: "2026-07-28T00:00:00.000Z",
      }).success
    ).toBe(success)
  })

  it.each([
    ["空白だけ", "   ", null],
    ["一文字", "x", null],
    ["trim後の最小値", "  xy  ", "xy"],
    ["trim後の上限未満", `  ${"x".repeat(199)}  `, "x".repeat(199)],
    ["trim後の上限", `  ${"x".repeat(200)}  `, "x".repeat(200)],
    ["trim後の上限超過", `  ${"x".repeat(201)}  `, null],
  ])("guard済みWeb検索queryの%sを検証する", (_label, query, expected) => {
    const result = v.safeParse(agentWebSearchAuthorizationSchema, {
      query,
      reserved: true,
      reused: false,
    })
    expect(result.success).toBe(expected !== null)
    expect(result.success ? result.output.query : null).toBe(expected)
  })

  it("認可済みWeb検索responseを厳密に検証する", () => {
    const authorization = {
      query: "release notes",
      reserved: true,
      reused: false,
    } as const

    expect(v.parse(agentWebSearchAuthorizationSchema, authorization)).toEqual(
      authorization
    )
    expect(
      v.safeParse(agentWebSearchAuthorizationSchema, {
        ...authorization,
        organizationId: "org_1",
      }).success
    ).toBe(false)
    expect(
      v.safeParse(agentWebSearchAuthorizationSchema, {
        ...authorization,
        reserved: false,
      }).success
    ).toBe(false)
  })
})
