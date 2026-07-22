import { describe, expect, it } from "vitest"

import { readAgentFeatureSwitches } from "./feature-flags"

describe("readAgentFeatureSwitches", () => {
  it("fails closed when switches are absent or malformed", () => {
    expect(readAgentFeatureSwitches({})).toEqual({
      runs: false,
      vision: false,
      writes: false,
    })
    expect(
      readAgentFeatureSwitches({
        AGENT_RUNS_ENABLED: "TRUE",
        AGENT_VISION_ENABLED: "true",
        AGENT_WRITES_ENABLED: " true",
      })
    ).toEqual({ runs: false, vision: false, writes: false })
  })

  it("enables only the explicit numeric flag", () => {
    expect(
      readAgentFeatureSwitches({
        AGENT_RUNS_ENABLED: "1",
        AGENT_VISION_ENABLED: " 1 ",
        AGENT_WRITES_ENABLED: "1",
      })
    ).toEqual({ runs: true, vision: true, writes: true })
  })
})
