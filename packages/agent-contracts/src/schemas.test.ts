import * as v from "valibot"
import { describe, expect, it } from "vitest"

import {
  agentConnectionSchema,
  agentCreateIssueActionInputSchema,
  agentGetIssueInputSchema,
  agentGetIssueToolOutputSchema,
  agentGuardedWebSearchQuerySchema,
  agentAttachmentMutationReceiptSchema,
  agentIssueActionSchema,
  agentIssueDetailSchema,
  agentIssueSchema,
  agentMemberListSchema,
  agentResumeTicketSchema,
  agentRunGrantSchema,
  agentSearchIssuesInputSchema,
  agentUsageRecordResultSchema,
  getIssueToolInputSchema,
} from "./schemas"

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

describe("agent contract runtime schemas", () => {
  it("accepts the bounded Issue contract", () => {
    expect(v.parse(agentIssueSchema, issue)).toEqual(issue)
  })

  it("rejects unknown fields instead of stripping them", () => {
    expect(
      v.safeParse(agentIssueSchema, {
        ...issue,
        organizationId: "org_1",
      }).success
    ).toBe(false)
  })

  it("keeps tenant and capability values out of business tool input", () => {
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

  it("bounds attachment receipts without exposing storage details", () => {
    const receipt = {
      operation: "added",
      issueId: "issue_1",
      issueNumber: 1,
      revision: 2,
      fileIds: ["file_1"],
    } as const

    expect(v.parse(agentAttachmentMutationReceiptSchema, receipt)).toEqual(
      receipt
    )
    expect(
      v.safeParse(agentAttachmentMutationReceiptSchema, {
        ...receipt,
        privateUrl: "https://private.invalid/file",
      }).success
    ).toBe(false)
  })

  it.each([
    ["max-1", 99, true],
    ["max", 100, true],
    ["max+1", 101, false],
  ])("enforces get_issue attachmentLimit at %s", (_label, limit, success) => {
    expect(
      v.safeParse(getIssueToolInputSchema, {
        lookup: "number",
        number: 1,
        attachmentLimit: limit,
      }).success
    ).toBe(success)
  })

  it.each([
    ["max-1", 99, true],
    ["max", 100, true],
    ["max+1", 101, false],
  ])(
    "enforces get_issue attachment response count at %s",
    (_label, count, success) => {
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
    }
  )

  it("accepts both lookup variants and rejects mixed or malformed variants", () => {
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

  it("keeps nullable fields distinct from omitted required fields", () => {
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

  it("rejects malformed timestamps, identifiers, and oversized arrays", () => {
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

  it("strictly validates connection, run, action, usage, and Issue detail responses", () => {
    const connection = {
      expiresAt: "2026-07-28T00:00:00.000Z",
      grant: VALID_GRANT,
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

    expect(v.parse(agentConnectionSchema, connection)).toEqual(connection)
    expect(v.parse(agentRunGrantSchema, run)).toEqual(run)
    expect(v.parse(agentIssueActionSchema, action)).toEqual(action)
    expect(
      v.parse(agentUsageRecordResultSchema, {
        recorded: true,
        calculatedCostMicros: 0,
        pricingVersion: "unpriced",
      })
    ).toBeDefined()
    expect(
      v.parse(agentIssueDetailSchema, {
        ...issue,
        attachments: { items: [], nextCursor: null },
      })
    ).toBeDefined()
    for (const [schema, value] of [
      [agentConnectionSchema, connection],
      [agentRunGrantSchema, run],
      [agentIssueActionSchema, action],
    ] as const) {
      expect(
        v.safeParse(schema, { ...value, privateUrl: "https://private.invalid" })
          .success
      ).toBe(false)
    }
  })

  it.each([
    ["transport max", agentIssueDetailSchema, 50_000, true],
    ["transport max+1", agentIssueDetailSchema, 50_001, false],
    ["tool max", agentGetIssueToolOutputSchema, 20_000, true],
    ["tool max+1", agentGetIssueToolOutputSchema, 20_001, false],
  ])(
    "separates Issue description projection at %s",
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

  it("matches canonical action and search input normalization", () => {
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
    ["too short", "x".repeat(31), false],
    ["minimum", "x".repeat(32), true],
    ["maximum", "x".repeat(512), true],
    ["too long", "x".repeat(513), false],
    ["space", `${"x".repeat(31)} `, false],
    ["control character", `${"x".repeat(31)}\n`, false],
  ])("validates capability credentials at %s", (_label, token, success) => {
    expect(
      v.safeParse(agentResumeTicketSchema, {
        ticket: token,
        expiresAt: "2026-07-28T00:00:00.000Z",
      }).success
    ).toBe(success)
  })

  it.each([
    ["whitespace only", "   ", null],
    ["one character", "x", null],
    ["trimmed minimum", "  xy  ", "xy"],
    ["trimmed max-1", `  ${"x".repeat(199)}  `, "x".repeat(199)],
    ["trimmed maximum", `  ${"x".repeat(200)}  `, "x".repeat(200)],
    ["trimmed max+1", `  ${"x".repeat(201)}  `, null],
  ])("validates guarded Web search query at %s", (_label, query, expected) => {
    const result = v.safeParse(agentGuardedWebSearchQuerySchema, { query })
    expect(result.success).toBe(expected !== null)
    expect(result.success ? result.output.query : null).toBe(expected)
  })
})
