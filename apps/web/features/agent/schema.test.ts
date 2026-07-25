import * as v from "valibot"
import { describe, expect, it } from "vitest"

import {
  parseAgentApprovalPolicy,
  parseAgentMessages,
  pendingActionToolOutputSchema,
} from "./schema"

describe("agent public schemas", () => {
  it("accepts only canonical pending action outputs", () => {
    expect(
      v.parse(pendingActionToolOutputSchema, {
        status: "pending",
        actionId: "action-1",
        preview: { untrusted: true },
      })
    ).toMatchObject({ status: "pending", actionId: "action-1" })
    expect(
      v.safeParse(pendingActionToolOutputSchema, {
        status: "approved",
        actionId: "action-1",
      }).success
    ).toBe(false)
  })

  it("keeps automatic permission state server-authored", () => {
    expect(
      parseAgentApprovalPolicy({
        mode: "full_access",
        expiresAt: "2026-07-22T01:00:00.000Z",
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
  })

  it("restores metadata-only Issue image tool traces after reload", () => {
    const messages = parseAgentMessages([
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
    ])

    expect(messages[0]?.parts[0]).toMatchObject({
      type: "dynamic-tool",
      toolName: "read_issue_attachment_image",
      state: "output-available",
      output: { contentType: "image/webp", sizeBytes: 3 },
    })
    expect(JSON.stringify(messages)).not.toMatch(/base64|data:|https?:/)
  })
})
