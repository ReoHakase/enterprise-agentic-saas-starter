import * as v from "valibot"
import { describe, expect, it } from "vitest"

import {
  parseAgentApprovalPolicy,
  parseAgentMessagePage,
  pendingActionToolOutputSchema,
} from "./schema"
import { createPendingActionToolOutput } from "./test-support/pending-action-fixture"

describe("agent public schemas", () => {
  it("accepts only canonical pending action outputs", () => {
    const pending = createPendingActionToolOutput("action-1")
    expect(v.parse(pendingActionToolOutputSchema, pending)).toEqual(pending)
    expect(
      v.safeParse(pendingActionToolOutputSchema, {
        ...pending,
        serverContext: { organizationId: "private-org" },
      }).success
    ).toBe(false)
  })

  it("keeps automatic permission state server-authored", () => {
    expect(
      parseAgentApprovalPolicy({
        mode: "full_access",
        permissions: {
          createIssue: true,
          updateIssue: true,
          deleteIssue: false,
        },
      })
    ).toMatchObject({
      mode: "full_access",
      permissions: { deleteIssue: false },
    })
    expect(() =>
      parseAgentApprovalPolicy({
        mode: "full_access",
        expiresAt: "2026-07-22T01:00:00.000Z",
        permissions: {
          createIssue: true,
          updateIssue: true,
          deleteIssue: false,
        },
      })
    ).toThrow(/Invalid key/)
  })

  it("restores metadata-only Issue image tool traces after reload", () => {
    const { messages } = parseAgentMessagePage({
      messages: [
        {
          id: "assistant_1",
          role: "assistant",
          parts: [
            {
              type: "tool-read_issue_attachment_image",
              toolCallId: "call_1",
              state: "output-available",
              input: { issueId: "issue_1", fileId: "file_1" },
              output: {
                issueId: "issue_1",
                fileId: "file_1",
                contentType: "image/webp",
                sizeBytes: 3,
              },
            },
          ],
        },
      ],
      total: 1,
      page: 0,
      perPage: 40,
      hasMore: false,
    })

    expect(messages[0]?.parts[0]).toMatchObject({
      type: "tool-read_issue_attachment_image",
      state: "output-available",
      output: { contentType: "image/webp", sizeBytes: 3 },
    })
    expect(JSON.stringify(messages)).not.toMatch(/base64|data:|https?:/)
  })
})
