import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  agentE2EWorkerEntrypoint,
  createAgentE2EEnvironment,
  parseAgentE2ERunId,
} from "./e2e/fixtures/agent-e2e-environment"

describe("Agent E2E environment", () => {
  it("derives an isolated loopback topology from the run identifier", () => {
    const environment = createAgentE2EEnvironment(321)

    expect(environment.webOrigin).toMatch(
      /^http:\/\/agent-e2e\.enterprise-agentic-saas\.localhost:\d+$/
    )
    expect(environment.apiOrigin).toMatch(
      /^http:\/\/api\.agent-e2e\.enterprise-agentic-saas\.localhost:\d+$/
    )
    expect(environment.databaseOrigin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(environment.apiPort).toBe(environment.webPort + 1)
    expect(environment.githubPort).toBe(environment.webPort + 2)
    expect(environment.databasePort).toBe(environment.webPort + 3)
    expect(environment.temporaryRoot).toBe(
      join(tmpdir(), "enterprise-agentic-saas-agent-e2e-321")
    )
    expect(environment.apiWorkerName).not.toBe(environment.agentWorkerName)
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, "invalid"])(
    "rejects an unsafe run identifier: %s",
    (runId) => {
      expect(() => parseAgentE2ERunId(runId)).toThrow(
        "Agent E2E requires a positive run identifier"
      )
    }
  )

  it("selects existing scripted and production Worker entrypoints", () => {
    expect(agentE2EWorkerEntrypoint(true)).toBe("src/mastra/e2e/worker.ts")
    expect(agentE2EWorkerEntrypoint(false)).toBe("src/mastra/worker.ts")
  })
})
