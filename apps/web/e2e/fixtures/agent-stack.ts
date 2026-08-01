import { chmod, mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

import {
  agentE2EWorkerEntrypoint,
  createAgentE2EEnvironment,
  removeAgentE2EStackArtifacts,
} from "./agent-e2e-environment"

const repositoryRoot = resolve(import.meta.dir, "../../../..")
const apiWorkspace = resolve(repositoryRoot, "apps/api")
const agentWorkspace = resolve(repositoryRoot, "apps/agent")
const databaseWorkspace = resolve(repositoryRoot, "packages/db")
const wranglerBinary = resolve(apiWorkspace, "node_modules/.bin/wrangler")

const inheritedEnvironment = Object.fromEntries(
  ["PATH", "HOME", "TMPDIR", "USER", "SHELL", "LANG", "LC_ALL"].flatMap(
    (name) => {
      const value = process.env[name]
      return value === undefined ? [] : [[name, value]]
    }
  )
)

const sleep = (milliseconds: number) =>
  new Promise<void>((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds)
  )

const requireOpenRouterKey = (value: string | undefined) => {
  const key = value?.trim()
  if (!key || /[\r\n]/u.test(key)) {
    throw new Error(
      "Full E2E requires OPENROUTER_API_KEY from the approved environment"
    )
  }
  return key
}

const writePrivateFile = async (path: string, contents: string) => {
  await writeFile(path, contents, { encoding: "utf8", mode: 0o600 })
  await chmod(path, 0o600)
}

const waitForDatabase = async (origin: string) => {
  const deadline = Date.now() + 30_000
  let lastCause: unknown
  while (Date.now() < deadline) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- readiness retries are intentionally serial.
      const response = await fetch(new URL("/health", origin))
      if (response.ok) return
      lastCause = new Error(`database health returned ${response.status}`)
    } catch (cause) {
      lastCause = cause
    }
    // oxlint-disable-next-line no-await-in-loop -- bounded delay separates readiness attempts.
    await sleep(200)
  }
  throw new Error("Agent E2E database did not become ready", {
    cause: lastCause,
  })
}

type ManagedProcess = ReturnType<typeof Bun.spawn>

const stopProcess = async (processHandle: ManagedProcess | undefined) => {
  if (!processHandle) return
  const exit = processHandle.exited
  if (!processHandle.killed) processHandle.kill("SIGTERM")
  const stopped = await Promise.race([
    exit.then(() => true),
    sleep(5_000).then(() => false),
  ])
  if (!stopped) processHandle.kill("SIGKILL")
  await exit.catch(() => undefined)
}

const runMigration = async (databaseUrl: string) => {
  const migration = Bun.spawn(["bun", "--no-env-file", "run", "db:migrate"], {
    cwd: databaseWorkspace,
    env: {
      ...inheritedEnvironment,
      NODE_ENV: "test",
      TURSO_DATABASE_URL: databaseUrl,
      TURSO_AUTH_TOKEN: "agent-e2e-unused-token",
    },
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  })
  const exitCode = await migration.exited
  if (exitCode !== 0) {
    throw new Error(`Agent E2E migration failed with code ${exitCode}`)
  }
}

const main = async () => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Agent E2E stack cannot run in production")
  }
  const scriptedAgent = process.env.AGENT_E2E_SCRIPTED === "1"
  const environment = createAgentE2EEnvironment(
    process.env.AGENT_E2E_RUN_ID ?? ""
  )
  const openRouterApiKey = scriptedAgent
    ? null
    : requireOpenRouterKey(process.env.OPENROUTER_API_KEY)
  let applicationTurso: ManagedProcess | undefined
  let agentTurso: ManagedProcess | undefined
  let wrangler: ManagedProcess | undefined
  let stopping = false

  const stop = () => {
    stopping = true
    if (wrangler && !wrangler.killed) wrangler.kill("SIGTERM")
    if (applicationTurso && !applicationTurso.killed) {
      applicationTurso.kill("SIGTERM")
    }
    if (agentTurso && !agentTurso.killed) agentTurso.kill("SIGTERM")
  }

  process.once("SIGINT", stop)
  process.once("SIGTERM", stop)

  try {
    await removeAgentE2EStackArtifacts(environment.runId)
    await Promise.all([
      mkdir(resolve(environment.stackRoot, "api"), {
        mode: 0o700,
        recursive: true,
      }),
      mkdir(resolve(environment.stackRoot, "agent"), {
        mode: 0o700,
        recursive: true,
      }),
    ])
    await chmod(environment.temporaryRoot, 0o700)
    if (stopping) return

    await runMigration(`file:${environment.applicationDatabasePath}`)
    if (stopping) return

    applicationTurso = Bun.spawn(
      [
        "turso",
        "dev",
        "--db-file",
        environment.applicationDatabasePath,
        "--port",
        String(environment.applicationDatabasePort),
      ],
      {
        cwd: environment.stackRoot,
        env: inheritedEnvironment,
        stdin: "ignore",
        stdout: "inherit",
        stderr: "inherit",
      }
    )
    agentTurso = Bun.spawn(
      [
        "turso",
        "dev",
        "--db-file",
        environment.agentStoragePath,
        "--port",
        String(environment.agentStoragePort),
      ],
      {
        cwd: environment.stackRoot,
        env: inheritedEnvironment,
        stdin: "ignore",
        stdout: "inherit",
        stderr: "inherit",
      }
    )
    await Promise.all([
      waitForDatabase(environment.applicationDatabaseOrigin),
      waitForDatabase(environment.agentStorageOrigin),
    ])
    if (stopping) return

    const apiConfig = {
      name: environment.apiWorkerName,
      main: resolve(apiWorkspace, "src/worker.ts"),
      compatibility_date: "2026-07-22",
      compatibility_flags: [
        "nodejs_compat",
        "enable_request_signal",
        "request_signal_passthrough",
      ],
      services: [
        {
          binding: "AGENT_RUNTIME",
          service: environment.agentWorkerName,
          entrypoint: "AgentRuntime",
        },
      ],
      r2_buckets: [
        {
          binding: "FILES",
          bucket_name: `agent-e2e-files-${environment.runId}`,
        },
      ],
      images: { binding: "IMAGES" },
      observability: { enabled: false },
      vars: {
        NODE_ENV: "development",
        PORT: String(environment.apiPort),
        APP_NAME: "Enterprise Agentic SaaS Agent E2E",
        APP_BASE_URL: environment.webOrigin,
        API_PUBLIC_URL: environment.apiOrigin,
        AGENT_ASSET_UPLOAD_ENABLED: "1",
        BETTER_AUTH_URL: environment.apiOrigin,
        BETTER_AUTH_SECRET:
          "agent-e2e-only-secret-with-at-least-thirty-two-characters",
        AUTH_COOKIE_DOMAIN: environment.cookieDomain,
        TRUSTED_ORIGINS: environment.webOrigin,
        CORS_ORIGIN: environment.webOrigin,
        TURSO_DATABASE_URL: environment.applicationDatabaseOrigin,
        TURSO_AUTH_TOKEN: environment.applicationDatabaseAuthToken,
        EMAIL_PROVIDER: "noop",
        EMAIL_FROM: "noreply@example.test",
        MAILPIT_URL: "",
        GITHUB_CLIENT_ID: "unused-in-emulator",
        GITHUB_CLIENT_SECRET: "unused-in-emulator",
        GITHUB_OAUTH_EMULATOR_URL: `${environment.githubOrigin}/emulate/github`,
        GITHUB_OAUTH_EMULATOR_CLIENT_ID: "enterprise-agentic-saas-local",
        GITHUB_OAUTH_EMULATOR_CLIENT_SECRET:
          "enterprise-agentic-saas-local-secret",
        GITHUB_OAUTH_CALLBACK_URL: `${environment.apiOrigin}/auth/oauth2/callback/github`,
      },
    }
    const agentConfig = {
      name: environment.agentWorkerName,
      main: resolve(agentWorkspace, agentE2EWorkerEntrypoint(scriptedAgent)),
      compatibility_date: "2026-07-22",
      compatibility_flags: ["nodejs_compat", "enable_request_signal"],
      workers_dev: false,
      preview_urls: false,
      services: [
        {
          binding: "AGENT_INTERNAL_API",
          service: environment.apiWorkerName,
          entrypoint: "AgentInternalApi",
        },
      ],
      ...(scriptedAgent
        ? {}
        : { secrets: { required: ["OPENROUTER_API_KEY"] } }),
      observability: { enabled: false },
      vars: {
        NODE_ENV: "development",
        AGENT_RUNS_ENABLED: "1",
        AGENT_VISION_ENABLED: "1",
        AGENT_WRITES_ENABLED: "1",
        MASTRA_STORAGE_URL: environment.agentStorageOrigin,
        MASTRA_STORAGE_AUTH_TOKEN: environment.agentStorageAuthToken,
      },
    }

    await Promise.all([
      writePrivateFile(
        environment.apiConfigPath,
        `${JSON.stringify(apiConfig, null, 2)}\n`
      ),
      writePrivateFile(
        environment.agentConfigPath,
        `${JSON.stringify(agentConfig, null, 2)}\n`
      ),
      openRouterApiKey
        ? writePrivateFile(
            environment.agentDevVarsPath,
            `OPENROUTER_API_KEY=${JSON.stringify(openRouterApiKey)}\n`
          )
        : writePrivateFile(environment.agentDevVarsPath, "\n"),
    ])

    wrangler = Bun.spawn(
      [
        wranglerBinary,
        "dev",
        "--local",
        "--config",
        environment.apiConfigPath,
        "--config",
        environment.agentConfigPath,
        "--persist-to",
        environment.wranglerStatePath,
        "--ip",
        "127.0.0.1",
        "--port",
        String(environment.apiPort),
        "--show-interactive-dev-session=false",
        "--log-level",
        "warn",
      ],
      {
        cwd: repositoryRoot,
        env: {
          ...inheritedEnvironment,
          CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
          WRANGLER_SEND_METRICS: "false",
        },
        stdin: "ignore",
        stdout: "inherit",
        stderr: "inherit",
      }
    )

    const outcome = await Promise.race([
      wrangler.exited.then((code) => ({ source: "Wrangler", code })),
      applicationTurso.exited.then((code) => ({
        source: "Application Turso",
        code,
      })),
      agentTurso.exited.then((code) => ({ source: "Agent Turso", code })),
    ])
    if (!stopping) {
      throw new Error(
        `Agent E2E ${outcome.source} exited unexpectedly with code ${outcome.code}`
      )
    }
  } finally {
    process.off("SIGINT", stop)
    process.off("SIGTERM", stop)
    await Promise.allSettled([
      stopProcess(wrangler),
      stopProcess(applicationTurso),
      stopProcess(agentTurso),
    ])
    await removeAgentE2EStackArtifacts(environment.runId)
  }
}

await main()
