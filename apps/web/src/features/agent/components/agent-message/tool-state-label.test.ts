import { describe, expect, it } from "vitest"

import { toolStateLabel } from "./tool-state-label"

describe("toolStateLabel", () => {
  it.each([
    ["input-streaming", undefined, "preparing input"],
    ["input-available", undefined, "running"],
    ["approval-requested", undefined, "waiting for approval"],
    ["approval-responded", true, "running"],
    ["approval-responded", false, "denied"],
    ["output-available", undefined, "completed"],
    ["output-denied", undefined, "denied"],
    ["output-error", undefined, "failed"],
  ] as const)(
    "maps %s without projecting tool payloads",
    (state, approved, label) => {
      expect(toolStateLabel(state, approved)).toBe(label)
    }
  )
})
