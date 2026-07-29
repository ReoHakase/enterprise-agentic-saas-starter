import { describe, expect, it } from "vitest"

import type { AgentRuntimeEnv } from "./environment"
import { getAgentIsolateComposition } from "./isolate-composition"

const environment = (storageUrl = ":memory:"): AgentRuntimeEnv => ({
  AGENT_INTERNAL_API: JSON.parse("{}"),
  AGENT_RUNS_ENABLED: "1",
  AGENT_VISION_ENABLED: "0",
  AGENT_WRITES_ENABLED: "1",
  MASTRA_STORAGE_URL: storageUrl,
  NODE_ENV: "test",
})

describe("Worker isolate composition", () => {
  it("reuses one composition and fails closed for changed credentials", () => {
    const first = getAgentIsolateComposition(environment())
    const second = getAgentIsolateComposition(environment())
    expect(second).toBe(first)
    expect(second.storage).toBe(first.storage)
    expect(() =>
      getAgentIsolateComposition(environment("file:other.db"))
    ).toThrow("Agent storage configuration is unavailable")
    expect(() =>
      getAgentIsolateComposition({
        ...environment(),
        OPENROUTER_API_KEY: "model-key-b",
      })
    ).toThrow("Agent storage configuration is unavailable")
    expect(() =>
      getAgentIsolateComposition({
        ...environment(),
        OPENROUTER_BASE_URL: "http://127.0.0.1:4112/api/v1",
      })
    ).toThrow("Agent storage configuration is unavailable")
    expect(() =>
      getAgentIsolateComposition({
        ...environment(),
        MASTRA_STORAGE_AUTH_TOKEN: "storage-key-b",
      })
    ).toThrow("Agent storage configuration is unavailable")
  })
})
