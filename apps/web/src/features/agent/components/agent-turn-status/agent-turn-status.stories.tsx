import { expect } from "storybook/test"

import preview from "#storybook/preview"

import { AgentTurnStatus } from "./agent-turn-status"

const meta = preview.meta({
  title: "Web/Agent/Turn Status",
  component: AgentTurnStatus,
  tags: ["autodocs"],
  args: {
    busy: false,
    cancelState: "idle",
    turnStopped: false,
  },
})

export const Thinking = meta.story({
  args: {
    busy: true,
    cancelState: "idle",
    turnStopped: false,
    transientStatus: "Thinking…",
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Thinking…")).toBeVisible()
  },
})

export const TurnStopped = meta.story({
  args: { busy: false, cancelState: "idle", turnStopped: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("Turn stopped.")
  },
})

export const RecoverableTimeout = meta.story({
  args: {
    busy: false,
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
  args: { busy: false, cancelState: "failed", turnStopped: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Agent response could not be canceled safely. Retry stop."
    )
  },
})
