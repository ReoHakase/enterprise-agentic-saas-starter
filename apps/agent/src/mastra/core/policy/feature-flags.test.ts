import { describe, expect, it } from "vitest"

import { readAgentFeatureSwitches } from "./feature-flags"

describe("readAgentFeatureSwitchesの契約", () => {
  it("switchがないか不正な場合は安全側に失敗する", () => {
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

  it("明示した数値flagだけを有効にする", () => {
    expect(
      readAgentFeatureSwitches({
        AGENT_RUNS_ENABLED: "1",
        AGENT_VISION_ENABLED: " 1 ",
        AGENT_WRITES_ENABLED: "1",
      })
    ).toEqual({ runs: true, vision: true, writes: true })
  })
})
