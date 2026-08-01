import { expect } from "storybook/test"

import preview from "#storybook/preview"

import { AgentTurnStatus } from "./agent-turn-status"

const meta = preview.meta({
  title: "Web/Agent/Turn Status",
  component: AgentTurnStatus,
  tags: ["autodocs"],
  args: {
    cancelState: "idle",
    turnStopped: false,
    waitingState: undefined,
  },
})

export const WaitingForFirstByte = meta.story({
  args: {
    cancelState: "idle",
    turnStopped: false,
    waitingState: "first-byte",
  },
  play: async ({ canvas }) => {
    const status = canvas.getByRole("status")
    await expect(status).toHaveTextContent("応答を待っています…")
    await expect(status.querySelector("svg")).not.toBeNull()
  },
})

export const WaitingAfterTool = meta.story({
  args: {
    cancelState: "idle",
    turnStopped: false,
    waitingState: "continuation",
  },
  play: async ({ canvas }) => {
    const status = canvas.getByRole("status")
    await expect(status).toHaveTextContent("続きを待っています…")
    await expect(status.querySelector("svg")).not.toBeNull()
  },
})

export const TurnStopped = meta.story({
  args: { cancelState: "idle", turnStopped: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("Turn stopped.")
  },
})

export const RecoverableTimeout = meta.story({
  args: {
    cancelState: "idle",
    turnStopped: false,
    error: new Error("Agent response timed out."),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Agent response timed out. You can retry the same draft safely."
    )
  },
})

export const CancelFailed = meta.story({
  args: { cancelState: "failed", turnStopped: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Agent response could not be canceled safely. Retry stop."
    )
  },
})
