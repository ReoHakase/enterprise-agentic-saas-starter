import { describe, expect, it, vi } from "vitest"

import {
  resolveAgentSubmissionIdentity,
  shouldRetainAgentSubmission,
} from "./submission-identity"

describe("Agent chat submission identity", () => {
  it("reuses one logical message id when the unchanged failed draft is retried", () => {
    const createId = vi.fn<() => string>(() => "message-new")

    expect(
      resolveAgentSubmissionIdentity(
        { id: "message-original", fingerprint: "same-draft" },
        "same-draft",
        createId
      )
    ).toEqual({
      id: "message-original",
      retrying: true,
      pending: { id: "message-original", fingerprint: "same-draft" },
    })
    expect(createId).not.toHaveBeenCalled()
  })

  it("allocates a new logical message id after the draft changes", () => {
    const createId = vi.fn<() => string>(() => "message-new")

    expect(
      resolveAgentSubmissionIdentity(
        { id: "message-original", fingerprint: "old-draft" },
        "changed-draft",
        createId
      )
    ).toEqual({
      id: "message-new",
      retrying: false,
      pending: { id: "message-new", fingerprint: "changed-draft" },
    })
    expect(createId).toHaveBeenCalledOnce()
  })

  it.each([
    { isAbort: true, isDisconnect: false, isError: false },
    { isAbort: false, isDisconnect: true, isError: false },
    { isAbort: false, isDisconnect: false, isError: true },
  ])("keeps retry identity after a failed or canceled run", (outcome) => {
    expect(shouldRetainAgentSubmission(outcome)).toBe(true)
  })

  it("clears retry identity only after a complete response", () => {
    expect(
      shouldRetainAgentSubmission({
        isAbort: false,
        isDisconnect: false,
        isError: false,
      })
    ).toBe(false)
  })
})
