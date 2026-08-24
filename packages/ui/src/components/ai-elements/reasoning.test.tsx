import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Reasoning, ReasoningContent, ReasoningTrigger } from "./reasoning"

const reasoning = (isStreaming: boolean) => (
  <Reasoning isStreaming={isStreaming} summary="Issueの状態を確認する。">
    <ReasoningTrigger />
    <ReasoningContent>保存済みのreasoning本文</ReasoningContent>
  </Reasoning>
)

afterEach(() => vi.useRealTimers())

const finishStreamingReasoning = async () => {
  vi.useFakeTimers()
  const { rerender } = render(reasoning(true))
  const trigger = screen.getByRole("button", { name: /Reasoning/u })

  await act(() => vi.advanceTimersByTimeAsync(1_100))
  rerender(reasoning(false))
  await act(() => vi.advanceTimersByTimeAsync(300))

  return trigger
}

describe("Reasoningの契約", () => {
  it("ストリーミング完了後に自動で閉じる", async () => {
    const trigger = await finishStreamingReasoning()

    expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect(trigger).toHaveTextContent(
      "Reasoning complete · 2s · Issueの状態を確認する。"
    )
  })

  it("ストリーミング完了後に手動で再び開ける", async () => {
    const trigger = await finishStreamingReasoning()

    vi.useRealTimers()
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("保存済みのreasoning本文")).toBeVisible()
  })

  it("ストリーミング開始時に自動で開く", () => {
    render(reasoning(true))
    const trigger = screen.getByRole("button", { name: /Reasoning/u })
    expect(trigger).toHaveAttribute("aria-expanded", "true")
  })
})
