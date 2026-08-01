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

describe("Reasoning", () => {
  it("opens while streaming and closes after completion", async () => {
    vi.useFakeTimers()
    const { rerender } = render(reasoning(true))
    const trigger = screen.getByRole("button", { name: /思考中/u })
    expect(trigger).toHaveAttribute("aria-expanded", "true")

    await act(() => vi.advanceTimersByTimeAsync(1_100))
    rerender(reasoning(false))
    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect(trigger).toHaveTextContent(
      "思考完了 · 2秒 · Issueの状態を確認する。"
    )

    vi.useRealTimers()
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("保存済みのreasoning本文")).toBeVisible()
  })
})
