import { atom } from "jotai"

export const AGENT_PANE_MIN_WIDTH = 360
const AGENT_PANE_DEFAULT_WIDTH = 460
export const AGENT_PANE_MAX_WIDTH = 720
export const AGENT_PANE_WIDTH_STORAGE_KEY = "agent-pane-width"

export const agentShellOpenAtom = atom(false)
export const agentPaneWidthAtom = atom(AGENT_PANE_DEFAULT_WIDTH)

export const clampAgentPaneWidth = (width: number) =>
  Math.min(
    AGENT_PANE_MAX_WIDTH,
    Math.max(AGENT_PANE_MIN_WIDTH, Math.round(width))
  )
