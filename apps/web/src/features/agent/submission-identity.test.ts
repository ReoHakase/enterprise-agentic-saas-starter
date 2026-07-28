import { describe, expect, it, vi } from "vitest"

import {
  resolveAgentSubmissionIdentity,
  shouldAutoContinueAgentClientTools,
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
    { isAbort: false, isDisconnect: true, isError: false },
    { isAbort: false, isDisconnect: false, isError: true },
  ])("keeps retry identity after a disconnect or error", (outcome) => {
    expect(shouldRetainAgentSubmission(outcome)).toBe(true)
  })

  it("discards retry identity after an explicit abort", () => {
    expect(
      shouldRetainAgentSubmission({
        isAbort: true,
        isDisconnect: false,
        isError: false,
      })
    ).toBe(false)
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

  it("continues only a final step made entirely of completed UI tools", () => {
    expect(
      shouldAutoContinueAgentClientTools({
        messages: [
          {
            role: "assistant",
            parts: [
              {
                type: "tool-ui_navigate",
                state: "output-available",
              },
            ],
          },
        ],
      })
    ).toBe(true)
    expect(
      shouldAutoContinueAgentClientTools({
        messages: [
          {
            role: "assistant",
            parts: [
              { type: "step-start" },
              {
                type: "tool-search_issues",
                state: "output-available",
              },
            ],
          },
        ],
      })
    ).toBe(false)
    expect(
      shouldAutoContinueAgentClientTools({
        messages: [
          {
            role: "assistant",
            parts: [
              {
                type: "tool-ui_open_issue",
                state: "output-error",
              },
            ],
          },
        ],
      })
    ).toBe(false)
    expect(
      shouldAutoContinueAgentClientTools({
        messages: [
          {
            role: "assistant",
            parts: [
              { type: "tool-ui_navigate", state: "output-available" },
              { type: "tool-get_issue", state: "output-available" },
            ],
          },
        ],
      })
    ).toBe(false)
    expect(
      shouldAutoContinueAgentClientTools({
        messages: [
          {
            role: "assistant",
            parts: [
              {
                type: "tool-ui_navigate",
                state: "output-available",
                providerExecuted: true,
              },
            ],
          },
        ],
      })
    ).toBe(false)
    expect(
      shouldAutoContinueAgentClientTools({
        messages: [
          {
            role: "assistant",
            parts: [
              {
                type: "tool-ui_navigate",
                state: "output-denied",
              },
            ],
          },
        ],
      })
    ).toBe(false)
  })
})
