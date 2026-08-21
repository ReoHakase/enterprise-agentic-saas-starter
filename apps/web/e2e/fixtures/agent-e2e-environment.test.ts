import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

import {
  agentE2EWorkerEntrypoint,
  createAgentE2EEnvironment,
  createAgentE2ETelemetryVariables,
  parseAgentE2ERunId,
  removeAgentE2EArtifacts,
  removeAgentE2EStackArtifacts,
} from "./agent-e2e-environment"
import { removeFullE2EArtifacts } from "./full-e2e-cleanup"
import {
  createFullE2EPlaywrightEnvironment,
  runFullE2ECommand,
  selectFullE2EPlaywrightArguments,
} from "./run-full-e2e"

const webWorkspace = resolve(import.meta.dirname, "../..")

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
    expect(environment.telemetrySessionId).toBe("agent-e2e-321")
    expect(environment.telemetryWorktreeId).toBe("agent-e2e")
    expect(
      new Set([
        environment.apiWorkerName,
        environment.imagesWorkerName,
        environment.agentWorkerName,
      ]).size
    ).toBe(3)
    expect(environment.imagesConfigPath).toBe(
      join(environment.stackRoot, "images", "wrangler.json")
    )
    expect(createAgentE2ETelemetryVariables(environment, true)).toEqual({
      AGENT_E2E_RUN_ID: "321",
      DEV_SESSION_ID: "agent-e2e-321",
      DEV_WORKTREE_ID: "agent-e2e",
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
    })
    expect(createAgentE2ETelemetryVariables(environment, false)).toEqual({})
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
    const nextDistPath = resolve(webWorkspace, environment.nextDistDirectory)

    await Promise.all([
      mkdir(environment.stackRoot, { recursive: true }),
      mkdir(nextDistPath, { recursive: true }),
    ])
    try {
      await removeFullE2EArtifacts(runId, webWorkspace)

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

  it("waits for Playwright to stop its servers before full cleanup", async () => {
    const runId = process.pid * 10_000 + 323
    const environment = createAgentE2EEnvironment(runId)
    const nextDistPath = resolve(webWorkspace, environment.nextDistDirectory)
    let finishPlaywright: (() => void) | undefined
    let markPlaywrightStarted: (() => void) | undefined
    const playwrightStarted = new Promise<void>((resolveStarted) => {
      markPlaywrightStarted = resolveStarted
    })
    const playwrightFinished = new Promise<void>((resolveFinished) => {
      finishPlaywright = resolveFinished
    })

    await Promise.all([
      mkdir(environment.stackRoot, { recursive: true }),
      mkdir(nextDistPath, { recursive: true }),
    ])
    try {
      const command = runFullE2ECommand({
        runId,
        webWorkspace,
        runPlaywright: async () => {
          markPlaywrightStarted?.()
          await playwrightFinished
          return 0
        },
      })
      await playwrightStarted

      await access(environment.temporaryRoot)
      await access(nextDistPath)

      finishPlaywright?.()
      await expect(command).resolves.toBe(0)
      await expect(access(environment.temporaryRoot)).rejects.toMatchObject({
        code: "ENOENT",
      })
      await expect(access(nextDistPath)).rejects.toMatchObject({
        code: "ENOENT",
      })
    } finally {
      finishPlaywright?.()
      await Promise.all([
        removeAgentE2EArtifacts(runId),
        rm(nextDistPath, { force: true, recursive: true }),
      ])
    }
  })

  it("keeps all three Luna canaries in the blocking full E2E suite", async () => {
    const [runnerSource, specSource] = await Promise.all([
      readFile(resolve(webWorkspace, "e2e/fixtures/run-full-e2e.ts"), "utf8"),
      readFile(resolve(webWorkspace, "e2e/full/real-agent.spec.ts"), "utf8"),
    ])
    const canaryCount = [...specSource.matchAll(/test\("agent-canary-/gu)]
      .length

    expect({
      canaryCount,
      hasConditionalExclusion: runnerSource.includes("grep-invert"),
      hasDiagnosticTag: /@diagnostic-/u.test(specSource),
    }).toEqual({
      canaryCount: 3,
      hasConditionalExclusion: false,
      hasDiagnosticTag: false,
    })
  })

  it("allows listing but rejects arguments that weaken the paid E2E gate", () => {
    expect(selectFullE2EPlaywrightArguments([])).toEqual([])
    expect(selectFullE2EPlaywrightArguments(["--list"])).toEqual(["--list"])

    for (const playwrightArguments of [
      ["--grep", "agent-canary-read-source"],
      ["--workers=2"],
      ["--retries=1"],
      ["--trace", "on"],
      ["--reporter=html"],
      ["--output", "test-results"],
      ["--config", "playwright.config.ts"],
      ["--list", "--workers=2"],
      ["e2e/full/real-agent.spec.ts"],
    ]) {
      expect(() =>
        selectFullE2EPlaywrightArguments(playwrightArguments)
      ).toThrow("Full E2E accepts only the optional --list argument")
    }
  })

  it("allowlists the paid Playwright environment and drops debug outputs", () => {
    expect(
      createFullE2EPlaywrightEnvironment(
        {
          PATH: "/test/bin",
          HOME: "/test/home",
          OPENROUTER_API_KEY: "provider-secret",
          PAID_E2E_APPROVED: "1",
          AGENT_E2E_OBSERVABILITY: "1",
          AGENT_E2E_RUN_ID: "stale",
          DEBUG: "pw:protocol",
          DEBUG_FILE: "/tmp/private-playwright.log",
          PWDEBUG: "console",
          PLAYWRIGHT_JSON_OUTPUT_NAME: "/tmp/private-results.json",
          NODE_OPTIONS: "--inspect",
          UNRELATED_SECRET: "private",
        },
        4321
      )
    ).toEqual({
      PATH: "/test/bin",
      HOME: "/test/home",
      OPENROUTER_API_KEY: "provider-secret",
      PAID_E2E_APPROVED: "1",
      AGENT_E2E_OBSERVABILITY: "1",
      AGENT_E2E_RUN_ID: "4321",
      WEB_PLAYWRIGHT_PROFILE: "full",
    })
  })

  it("propagates a blocking Playwright failure after full cleanup", async () => {
    const runId = process.pid * 10_000 + 324
    const environment = createAgentE2EEnvironment(runId)
    const nextDistPath = resolve(webWorkspace, environment.nextDistDirectory)

    await Promise.all([
      mkdir(environment.stackRoot, { recursive: true }),
      mkdir(nextDistPath, { recursive: true }),
    ])
    const command = runFullE2ECommand({
      runId,
      webWorkspace,
      runPlaywright: async () => 7,
    })

    await expect(command).resolves.toBe(7)
    await expect(access(environment.temporaryRoot)).rejects.toMatchObject({
      code: "ENOENT",
    })
    await expect(access(nextDistPath)).rejects.toMatchObject({
      code: "ENOENT",
    })
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
