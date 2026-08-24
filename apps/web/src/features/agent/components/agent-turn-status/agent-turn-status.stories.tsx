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
})

export const WaitingAfterTool = meta.story({
  args: {
    cancelState: "idle",
    turnStopped: false,
    waitingState: "continuation",
  },
})

export const TurnStopped = meta.story({
  args: { cancelState: "idle", turnStopped: true },
})

export const RecoverableTimeout = meta.story({
  args: {
    cancelState: "idle",
    turnStopped: false,
    error: new Error("Agent response timed out."),
  },
})

export const CancelFailed = meta.story({
  args: { cancelState: "failed", turnStopped: false },
})
