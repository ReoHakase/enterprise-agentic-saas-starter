import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

import {
  agentE2EWorkerEntrypoint,
  createAgentE2EEnvironment,
  parseAgentE2ERunId,
  removeAgentE2EArtifacts,
  removeAgentE2EStackArtifacts,
} from "./e2e/fixtures/agent-e2e-environment"
import { removeFullE2EArtifacts } from "./e2e/fixtures/full-e2e-global-teardown"

describe("Agent E2E environment", () => {
  it("derives an isolated loopback topology from the run identifier", () => {
    const environment = createAgentE2EEnvironment(321)

    expect(environment.webOrigin).toMatch(
      /^http:\/\/agent-e2e\.enterprise-agentic-saas\.localhost:\d+$/
    )
    expect(environment.apiOrigin).toMatch(
      /^http:\/\/api\.agent-e2e\.enterprise-agentic-saas\.localhost:\d+$/
    )
    expect(environment.apiLoopbackOrigin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(environment.applicationDatabaseOrigin).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+$/
    )
    expect(environment.agentStorageOrigin).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+$/
    )
    expect(environment.apiPort).toBe(environment.webPort + 1)
    expect(environment.githubPort).toBe(environment.webPort + 2)
    expect(environment.applicationDatabasePort).toBe(environment.webPort + 3)
    expect(environment.agentStoragePort).toBe(environment.webPort + 4)
    expect(environment.temporaryRoot).toBe(
      join(tmpdir(), "enterprise-agentic-saas-agent-e2e-321")
    )
    expect(environment.stackRoot).toBe(join(environment.temporaryRoot, "stack"))
    expect(environment.applicationDatabasePath).toBe(
      join(environment.stackRoot, "application.db")
    )
    expect(environment.agentStoragePath).toBe(
      join(environment.stackRoot, "agent-storage.db")
    )
    expect(environment.applicationDatabasePath).not.toBe(
      environment.agentStoragePath
    )
    expect(environment.applicationDatabaseOrigin).not.toBe(
      environment.agentStorageOrigin
    )
    expect(environment.applicationDatabaseAuthToken).not.toBe(
      environment.agentStorageAuthToken
    )
    expect(environment.nextDistDirectory).toBe(".next-e2e-full-321")
    expect(environment.apiWorkerName).not.toBe(environment.agentWorkerName)
  })

  it("removes stack-owned state without deleting sibling runner artifacts", async () => {
    const runId = process.pid * 10_000 + 321
    const environment = createAgentE2EEnvironment(runId)
    const nextMarker = join(environment.temporaryRoot, "next", "marker.txt")

    await removeAgentE2EArtifacts(runId)
    try {
      await Promise.all([
        mkdir(environment.stackRoot, { recursive: true }),
        mkdir(join(environment.temporaryRoot, "next"), { recursive: true }),
      ])
      await Promise.all([
        writeFile(join(environment.stackRoot, "owned.txt"), "stack"),
        writeFile(nextMarker, "next"),
      ])

      await removeAgentE2EStackArtifacts(runId)

      await expect(readFile(nextMarker, "utf8")).resolves.toBe("next")
      await expect(
        readFile(join(environment.stackRoot, "owned.txt"), "utf8")
      ).rejects.toMatchObject({ code: "ENOENT" })
    } finally {
      await removeAgentE2EArtifacts(runId)
    }
  })

  it("removes the full runner root and its workspace-local Next build", async () => {
    const runId = process.pid * 10_000 + 322
    const environment = createAgentE2EEnvironment(runId)
    const nextDistPath = resolve(process.cwd(), environment.nextDistDirectory)

    await Promise.all([
      mkdir(environment.stackRoot, { recursive: true }),
      mkdir(nextDistPath, { recursive: true }),
    ])
    try {
      await removeFullE2EArtifacts(runId, process.cwd())

      await expect(access(environment.temporaryRoot)).rejects.toMatchObject({
        code: "ENOENT",
      })
      await expect(access(nextDistPath)).rejects.toMatchObject({
        code: "ENOENT",
      })
    } finally {
      await Promise.all([
        removeAgentE2EArtifacts(runId),
        rm(nextDistPath, { force: true, recursive: true }),
      ])
    }
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
