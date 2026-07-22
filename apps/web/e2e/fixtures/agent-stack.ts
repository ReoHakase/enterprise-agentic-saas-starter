import { chmod, mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

import {
  createAgentE2EEnvironment,
  removeAgentE2EArtifacts,
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

const requireOpenRouterKey = (value: string | undefined): string => {
  const key = value?.trim()
  if (!key || key.length < 24 || /[\r\n]/u.test(key)) {
    throw new Error(
      "Agent E2E requires OPENROUTER_API_KEY or apps/agent/.env.local"
    )
  }
  return key
}

const unquoteDotenvValue = (value: string): string => {
  const trimmed = value.trim()
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

const readOpenRouterKey = async (): Promise<string> => {
  if (process.env.OPENROUTER_API_KEY) {
    return requireOpenRouterKey(process.env.OPENROUTER_API_KEY)
  }

  let contents: string
  try {
    contents = await readFile(resolve(agentWorkspace, ".env.local"), "utf8")
  } catch {
    throw new Error(
      "Agent E2E requires OPENROUTER_API_KEY or apps/agent/.env.local"
    )
  }

  const entry = contents
    .split(/\r?\n/u)
    .find((line) => /^\s*(?:export\s+)?OPENROUTER_API_KEY\s*=/u.test(line))
  const separator = entry?.indexOf("=") ?? -1
  return requireOpenRouterKey(
    separator >= 0 ? unquoteDotenvValue(entry?.slice(separator + 1) ?? "") : ""
  )
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

const runMigration = async (databaseOrigin: string) => {
  const migration = Bun.spawn(["bun", "--no-env-file", "run", "db:migrate"], {
    cwd: databaseWorkspace,
    env: {
      ...inheritedEnvironment,
      NODE_ENV: "test",
      TURSO_DATABASE_URL: databaseOrigin,
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

  const environment = createAgentE2EEnvironment(
    process.env.AGENT_E2E_RUN_ID ?? ""
  )
  const openRouterApiKey = await readOpenRouterKey()
  let turso: ManagedProcess | undefined
  let wrangler: ManagedProcess | undefined
  let stopping = false

  const stop = () => {
    stopping = true
    if (wrangler && !wrangler.killed) wrangler.kill("SIGTERM")
    if (turso && !turso.killed) turso.kill("SIGTERM")
  }

  process.once("SIGINT", stop)
  process.once("SIGTERM", stop)

  try {
    await removeAgentE2EArtifacts(environment.runId)
    await Promise.all([
      mkdir(resolve(environment.temporaryRoot, "api"), {
        mode: 0o700,
        recursive: true,
      }),
      mkdir(resolve(environment.temporaryRoot, "agent"), {
        mode: 0o700,
        recursive: true,
      }),
    ])
    await chmod(environment.temporaryRoot, 0o700)
    if (stopping) return

    turso = Bun.spawn(
      [
        "turso",
        "dev",
        "--db-file",
        environment.databasePath,
        "--port",
        String(environment.databasePort),
      ],
      {
        cwd: environment.temporaryRoot,
        env: inheritedEnvironment,
        stdin: "ignore",
        stdout: "inherit",
        stderr: "inherit",
      }
    )
    await waitForDatabase(environment.databaseOrigin)
    await runMigration(environment.databaseOrigin)
    if (stopping) return

    const apiConfig = {
      name: environment.apiWorkerName,
      main: resolve(apiWorkspace, "src/worker.ts"),
      compatibility_date: "2026-07-22",
      compatibility_flags: ["nodejs_compat"],
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
        TURSO_DATABASE_URL: environment.databaseOrigin,
        TURSO_AUTH_TOKEN: "agent-e2e-unused-token",
        EMAIL_PROVIDER: "noop",
        EMAIL_FROM: "noreply@example.test",
        MAILPIT_URL: "",
        GITHUB_CLIENT_ID: "unused-in-emulator",
        GITHUB_CLIENT_SECRET: "unused-in-emulator",
        GITHUB_OAUTH_EMULATOR_URL: environment.githubOrigin,
        GITHUB_OAUTH_EMULATOR_CLIENT_ID: "enterprise-agentic-saas-local",
        GITHUB_OAUTH_EMULATOR_CLIENT_SECRET:
          "enterprise-agentic-saas-local-secret",
        GITHUB_OAUTH_CALLBACK_URL: `${environment.apiOrigin}/auth/oauth2/callback/github`,
        SENTRY_DSN: "",
        SENTRY_ENVIRONMENT: "agent-e2e",
        SENTRY_RELEASE: "",
        SENTRY_SPOTLIGHT: "",
        SENTRY_TRACES_SAMPLE_RATE: "0",
      },
    }
    const agentConfig = {
      name: environment.agentWorkerName,
      main: resolve(agentWorkspace, "src/worker.ts"),
      compatibility_date: "2026-07-22",
      compatibility_flags: ["nodejs_compat"],
      workers_dev: false,
      preview_urls: false,
      services: [
        {
          binding: "AGENT_INTERNAL_API",
          service: environment.apiWorkerName,
          entrypoint: "AgentInternalApi",
        },
      ],
      secrets: { required: ["OPENROUTER_API_KEY"] },
      observability: { enabled: false },
      vars: {
        NODE_ENV: "development",
        AGENT_RUNS_ENABLED: "1",
        AGENT_VISION_ENABLED: "1",
        AGENT_WRITES_ENABLED: "1",
        SENTRY_DSN: "",
        SENTRY_ENVIRONMENT: "agent-e2e",
        SENTRY_RELEASE: "",
        SENTRY_TRACES_SAMPLE_RATE: "0",
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
      writePrivateFile(
        environment.agentDevVarsPath,
        `OPENROUTER_API_KEY=${JSON.stringify(openRouterApiKey)}\n`
      ),
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
      turso.exited.then((code) => ({ source: "Turso", code })),
    ])
    if (!stopping) {
      throw new Error(
        `Agent E2E ${outcome.source} exited unexpectedly with code ${outcome.code}`
      )
    }
  } finally {
    process.off("SIGINT", stop)
    process.off("SIGTERM", stop)
    await Promise.allSettled([stopProcess(wrangler), stopProcess(turso)])
    await removeAgentE2EArtifacts(environment.runId)
  }
}

await main()
