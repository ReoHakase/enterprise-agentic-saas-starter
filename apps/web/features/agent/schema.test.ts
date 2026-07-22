import * as v from "valibot"
import { describe, expect, it } from "vitest"

import {
  agentApprovalPolicySchema,
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
      v.parse(agentApprovalPolicySchema, {
        mode: "auto_write",
        expiresAt: "2026-07-22T01:00:00.000Z",
        permissions: {
          createIssue: true,
          updateIssue: true,
          deleteIssue: false,
        },
      })
    ).toMatchObject({
      mode: "auto_write",
      permissions: { deleteIssue: false },
    })
  })
})
