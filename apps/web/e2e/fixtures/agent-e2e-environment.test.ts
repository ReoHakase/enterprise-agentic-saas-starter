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

describe("Agent E2E環境", () => {
  it("実行識別子から分離したループバック構成を導出する", () => {
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
    expect(environment.webBuildDirectory).toBe("dist/e2e-full-321")
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

  it("別実行主体の生成物を残して対象構成の状態だけを削除する", async () => {
    const runId = process.pid * 10_000 + 321
    const environment = createAgentE2EEnvironment(runId)
    const unownedMarker = join(
      environment.temporaryRoot,
      "unowned",
      "marker.txt"
    )

    await removeAgentE2EArtifacts(runId)
    try {
      await Promise.all([
        mkdir(environment.stackRoot, { recursive: true }),
        mkdir(join(environment.temporaryRoot, "unowned"), { recursive: true }),
      ])
      await Promise.all([
        writeFile(join(environment.stackRoot, "owned.txt"), "stack"),
        writeFile(unownedMarker, "unowned"),
      ])

      await removeAgentE2EStackArtifacts(runId)

      await expect(readFile(unownedMarker, "utf8")).resolves.toBe("unowned")
      await expect(
        readFile(join(environment.stackRoot, "owned.txt"), "utf8")
      ).rejects.toMatchObject({ code: "ENOENT" })
    } finally {
      await removeAgentE2EArtifacts(runId)
    }
  })

  it("実行主体のルートとワークスペース固有のWebビルドを削除する", async () => {
    const runId = process.pid * 10_000 + 322
    const environment = createAgentE2EEnvironment(runId)
    const webBuildPath = resolve(webWorkspace, environment.webBuildDirectory)

    await Promise.all([
      mkdir(environment.stackRoot, { recursive: true }),
      mkdir(webBuildPath, { recursive: true }),
    ])
    try {
      await removeFullE2EArtifacts(runId, webWorkspace)

      await expect(access(environment.temporaryRoot)).rejects.toMatchObject({
        code: "ENOENT",
      })
      await expect(access(webBuildPath)).rejects.toMatchObject({
        code: "ENOENT",
      })
    } finally {
      await Promise.all([
        removeAgentE2EArtifacts(runId),
        rm(webBuildPath, { force: true, recursive: true }),
      ])
    }
  })

  it("完全なクリーンアップの前にPlaywrightがサーバーを停止するまで待つ", async () => {
    const runId = process.pid * 10_000 + 323
    const environment = createAgentE2EEnvironment(runId)
    const webBuildPath = resolve(webWorkspace, environment.webBuildDirectory)
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
      mkdir(webBuildPath, { recursive: true }),
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
      await access(webBuildPath)

      finishPlaywright?.()
      await expect(command).resolves.toBe(0)
      await expect(access(environment.temporaryRoot)).rejects.toMatchObject({
        code: "ENOENT",
      })
      await expect(access(webBuildPath)).rejects.toMatchObject({
        code: "ENOENT",
      })
    } finally {
      finishPlaywright?.()
      await Promise.all([
        removeAgentE2EArtifacts(runId),
        rm(webBuildPath, { force: true, recursive: true }),
      ])
    }
  })

  it("必須の有料全構成E2Eに3件のLunaカナリアを残す", async () => {
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

  it("一覧取得は許可して有料E2Eの必須条件を弱める引数は拒否する", () => {
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

  it("有料Playwrightの環境変数を許可対象に限定してデバッグ出力を除外する", () => {
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

  it("全クリーンアップ後に必須Playwright検査の失敗を伝播する", async () => {
    const runId = process.pid * 10_000 + 324
    const environment = createAgentE2EEnvironment(runId)
    const webBuildPath = resolve(webWorkspace, environment.webBuildDirectory)

    await Promise.all([
      mkdir(environment.stackRoot, { recursive: true }),
      mkdir(webBuildPath, { recursive: true }),
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
    await expect(access(webBuildPath)).rejects.toMatchObject({
      code: "ENOENT",
    })
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, "invalid"])(
    "安全でない実行識別子を拒否する: %s",
    (runId) => {
      expect(() => parseAgentE2ERunId(runId)).toThrow(
        "Agent E2E requires a positive run identifier"
      )
    }
  )

  it("既存のテスト用Workerと本番Workerの起点を選択する", () => {
    expect(agentE2EWorkerEntrypoint(true)).toBe("src/mastra/e2e/worker.ts")
    expect(agentE2EWorkerEntrypoint(false)).toBe("src/mastra/worker.ts")
  })
})
