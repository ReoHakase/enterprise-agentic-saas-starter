import { describe, expect, it, vi } from "vitest"

import {
  resolveAgentSubmissionIdentity,
  shouldAutoContinueAgentClientTools,
  shouldRetainAgentSubmission,
} from "./submission-identity"

describe("Agentチャットの送信ID", () => {
  it("変更していない失敗済みドラフトの再試行では同じ論理メッセージIDを使う", () => {
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

  it("ドラフト変更後は新しい論理メッセージIDを割り当てる", () => {
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
    {
      case: "切断",
      outcome: { isAbort: false, isDisconnect: true, isError: false },
    },
    {
      case: "エラー",
      outcome: { isAbort: false, isDisconnect: false, isError: true },
    },
  ])("$case後も再試行IDを保持する", ({ outcome }) => {
    expect(shouldRetainAgentSubmission(outcome)).toBe(true)
  })

  it("明示的な中止後は再試行IDを破棄する", () => {
    expect(
      shouldRetainAgentSubmission({
        isAbort: true,
        isDisconnect: false,
        isError: false,
      })
    ).toBe(false)
  })

  it("応答完了後だけ再試行IDを消去する", () => {
    expect(
      shouldRetainAgentSubmission({
        isAbort: false,
        isDisconnect: false,
        isError: false,
      })
    ).toBe(false)
  })

  it("完了済みUI toolだけで構成された最終stepを自動継続する", () => {
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
