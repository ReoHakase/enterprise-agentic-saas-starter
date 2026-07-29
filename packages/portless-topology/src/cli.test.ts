import { spawn } from "node:child_process"
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { createLocalTopologyEnvironment, resolvePortlessService } from "./cli"

const repositoryRoot = resolve(import.meta.dirname, "../../..")
const temporaryDirectories: string[] = []

const publicServices = [
  ["enterprise-agentic-saas", ""],
  ["storybook.enterprise-agentic-saas", "storybook."],
  ["storybook.ui.enterprise-agentic-saas", "storybook.ui."],
  ["api.enterprise-agentic-saas", "api."],
  ["agent.enterprise-agentic-saas", "agent."],
  ["agent-storage.enterprise-agentic-saas", "agent-storage."],
  ["mastra-studio.enterprise-agentic-saas", "mastra-studio."],
  ["db.enterprise-agentic-saas", "db."],
  ["mailpit.enterprise-agentic-saas", "mailpit."],
  ["email.enterprise-agentic-saas", "email."],
  ["github.emulate.enterprise-agentic-saas", "github.emulate."],
] as const

const createPortlessStub = async (baseOrigin: string) => {
  const directory = await mkdtemp(join(tmpdir(), "portless-topology-test-"))
  temporaryDirectories.push(directory)
  const executable = join(directory, "portless")
  await writeFile(
    executable,
    [
      "#!/bin/sh",
      'if [ "${1:-}" = get ]; then',
      `  printf '%s\\n' '${baseOrigin}'`,
      "  exit 0",
      "fi",
      'printf "%s\\n" "$@" > "$PORTLESS_ARGUMENTS_FILE"',
      "shift",
      'exec "$@"',
      "",
    ].join("\n")
  )
  await chmod(executable, 0o755)
  return directory
}

const runCli = async (
  arguments_: string[],
  environment: Record<string, string | undefined>,
  onSpawn?: (child: ReturnType<typeof spawn>) => (() => void) | undefined
) => {
  const childEnvironment = { ...process.env }
  for (const [name, value] of Object.entries(environment)) {
    if (value === undefined) delete childEnvironment[name]
    else childEnvironment[name] = value
  }

  return await new Promise<{
    exitCode: number | null
    stderr: string
    stdout: string
  }>((resolveResult, reject) => {
    let cleanup: (() => void) | undefined
    const child = spawn("portless-topology", arguments_, {
      cwd: repositoryRoot,
      env: childEnvironment,
    })
    let stderr = ""
    let stdout = ""
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk
    })
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk
    })
    child.once("error", (error) => {
      cleanup?.()
      reject(error)
    })
    child.once("spawn", () => {
      cleanup = onSpawn?.(child)
    })
    child.once("close", (exitCode) => {
      cleanup?.()
      resolveResult({ exitCode, stderr, stdout })
    })
  })
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  )
})

describe("Portless topology resolver", () => {
  it.each([
    [
      "https://enterprise-agentic-saas.localhost",
      "enterprise-agentic-saas.localhost",
    ],
    [
      "https://feature-auth.enterprise-agentic-saas.localhost",
      "feature-auth.enterprise-agentic-saas.localhost",
    ],
    [
      "http://feature-auth.enterprise-agentic-saas.localhost:7443",
      "feature-auth.enterprise-agentic-saas.localhost",
    ],
  ])("resolves all public services from %s", (baseOrigin, webHostname) => {
    for (const [logicalName, servicePrefix] of publicServices) {
      const service = resolvePortlessService(baseOrigin, logicalName)
      expect(service.origin).toBe(
        `${new URL(baseOrigin).protocol}//${servicePrefix}${webHostname}${new URL(baseOrigin).port ? `:${new URL(baseOrigin).port}` : ""}`
      )
      expect(service.portlessName).toBe(
        `${servicePrefix}${webHostname.replace(/\.localhost$/u, "")}`
      )
    }
  })

  it("preserves a multi-label service prefix to the left of the worktree namespace", () => {
    expect(
      resolvePortlessService(
        "https://feature-auth.enterprise-agentic-saas.localhost",
        "storybook.ui.enterprise-agentic-saas"
      )
    ).toEqual({
      hostname: "storybook.ui.feature-auth.enterprise-agentic-saas.localhost",
      origin:
        "https://storybook.ui.feature-auth.enterprise-agentic-saas.localhost",
      portlessName: "storybook.ui.feature-auth.enterprise-agentic-saas",
    })
  })

  it.each([
    "",
    "api",
    "https://api.enterprise-agentic-saas.localhost",
    "api.enterprise-agentic-saas.localhost",
    "api enterprise-agentic-saas",
  ])("rejects invalid logical input %j", (logicalName) => {
    expect(() =>
      resolvePortlessService(
        "https://enterprise-agentic-saas.localhost",
        logicalName
      )
    ).toThrow(/Portless/u)
  })

  it.each([
    "",
    "enterprise-agentic-saas.localhost",
    "https://enterprise-agentic-saas.localhost/path",
  ])("rejects invalid base origin %j", (baseOrigin) => {
    expect(() =>
      resolvePortlessService(baseOrigin, "enterprise-agentic-saas")
    ).toThrow(/Portless/u)
  })

  it("creates the shared local topology without exposing or changing secrets", () => {
    const source = {
      BETTER_AUTH_SECRET: "keep-this-secret",
      CORS_ORIGIN: "https://stale.example.test",
      EMULATE_BASE_URL: "https://stale-emulator.localhost",
      GITHUB_OAUTH_CALLBACK_URL:
        "https://api.stale.localhost/auth/oauth2/callback/github",
      HOME: "/Users/example",
      MASTRA_STORAGE_AUTH_TOKEN: "remote-agent-token",
      MASTRA_STORAGE_URL: "libsql://remote-agent.example.test",
      TURSO_AUTH_TOKEN: "must-not-reach-local-turso",
    }
    const environment = createLocalTopologyEnvironment(
      "https://feature-auth.enterprise-agentic-saas.localhost:7443",
      source
    )

    expect(environment).toMatchObject({
      API_PUBLIC_URL:
        "https://api.feature-auth.enterprise-agentic-saas.localhost:7443",
      APP_BASE_URL:
        "https://feature-auth.enterprise-agentic-saas.localhost:7443",
      AUTH_COOKIE_DOMAIN: "feature-auth.enterprise-agentic-saas.localhost",
      BETTER_AUTH_SECRET: "keep-this-secret",
      BETTER_AUTH_URL:
        "https://api.feature-auth.enterprise-agentic-saas.localhost:7443",
      CORS_ORIGIN:
        "https://feature-auth.enterprise-agentic-saas.localhost:7443",
      GITHUB_OAUTH_EMULATOR_URL:
        "https://github.emulate.feature-auth.enterprise-agentic-saas.localhost:7443",
      GITHUB_OAUTH_CALLBACK_URL:
        "https://api.feature-auth.enterprise-agentic-saas.localhost:7443/auth/oauth2/callback/github",
      MASTRA_STORAGE_AUTH_TOKEN: "local-agent-storage",
      MASTRA_STORAGE_URL:
        "https://agent-storage.feature-auth.enterprise-agentic-saas.localhost:7443",
      NEXT_PUBLIC_API_BASE_URL:
        "https://api.feature-auth.enterprise-agentic-saas.localhost:7443",
      NODE_EXTRA_CA_CERTS: "/Users/example/.portless/ca.pem",
      TRUSTED_ORIGINS:
        "https://feature-auth.enterprise-agentic-saas.localhost:7443",
      TURSO_DATABASE_URL:
        "https://db.feature-auth.enterprise-agentic-saas.localhost:7443",
    })
    expect(environment).not.toHaveProperty("EMULATE_BASE_URL")
    expect(environment).not.toHaveProperty("TURSO_AUTH_TOKEN")
    expect(source.EMULATE_BASE_URL).toBe("https://stale-emulator.localhost")
    expect(source.MASTRA_STORAGE_AUTH_TOKEN).toBe("remote-agent-token")
    expect(source.MASTRA_STORAGE_URL).toBe("libsql://remote-agent.example.test")
    expect(source).not.toHaveProperty("NODE_EXTRA_CA_CERTS")
    expect(source.TURSO_AUTH_TOKEN).toBe("must-not-reach-local-turso")
  })

  it("preserves an explicit Node certificate bundle", () => {
    expect(
      createLocalTopologyEnvironment(
        "https://enterprise-agentic-saas.localhost",
        {
          HOME: "/Users/example",
          NODE_EXTRA_CA_CERTS: "/tmp/custom-ca.pem",
        }
      )
    ).toMatchObject({ NODE_EXTRA_CA_CERTS: "/tmp/custom-ca.pem" })
  })
})

describe("Portless topology CLI", () => {
  it("uses the direct named form and preserves command argv", async () => {
    const stubDirectory = await createPortlessStub(
      "https://feature-auth.enterprise-agentic-saas.localhost:7443"
    )
    const argumentsFile = join(stubDirectory, "arguments.txt")
    const result = await runCli(
      [
        "run",
        "storybook.ui.enterprise-agentic-saas",
        "--",
        "bun",
        "-e",
        "process.stdout.write(process.env.APP_BASE_URL ?? '')",
      ],
      {
        PATH: `${stubDirectory}:${process.env.PATH ?? ""}`,
        PORTLESS_ARGUMENTS_FILE: argumentsFile,
      }
    )

    expect(result).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "https://feature-auth.enterprise-agentic-saas.localhost:7443",
    })
    expect((await readFile(argumentsFile, "utf8")).trim().split("\n")).toEqual([
      "storybook.ui.feature-auth.enterprise-agentic-saas",
      "bun",
      "-e",
      "process.stdout.write(process.env.APP_BASE_URL ?? '')",
    ])
  })

  it("executes an unproxied command with topology env, argv, and exit code", async () => {
    const stubDirectory = await createPortlessStub(
      "https://feature-auth.enterprise-agentic-saas.localhost:7443"
    )
    const argumentsFile = join(stubDirectory, "arguments.txt")
    const resultFile = join(stubDirectory, "exec-result.json")
    const recorder = join(stubDirectory, "exec-recorder.ts")
    await writeFile(
      recorder,
      [
        'import { writeFileSync } from "node:fs"',
        `writeFileSync(${JSON.stringify(resultFile)}, JSON.stringify({`,
        "  apiOrigin: process.env.API_PUBLIC_URL,",
        "  arguments: process.argv.slice(2),",
        "  callbackUrl: process.env.GITHUB_OAUTH_CALLBACK_URL,",
        "  emulateBaseUrl: process.env.EMULATE_BASE_URL ?? null,",
        "  nodeExtraCaCerts: process.env.NODE_EXTRA_CA_CERTS,",
        "  storageToken: process.env.MASTRA_STORAGE_AUTH_TOKEN,",
        "  storageUrl: process.env.MASTRA_STORAGE_URL,",
        "  tursoToken: process.env.TURSO_AUTH_TOKEN ?? null,",
        "}))",
        "process.exit(17)",
        "",
      ].join("\n")
    )

    const result = await runCli(
      ["exec", "--", "bun", recorder, "alpha", "two words"],
      {
        PATH: `${stubDirectory}:${process.env.PATH ?? ""}`,
        PORTLESS_ARGUMENTS_FILE: argumentsFile,
        EMULATE_BASE_URL: "https://stale-emulator.localhost",
        GITHUB_OAUTH_CALLBACK_URL:
          "https://api.stale.localhost/auth/oauth2/callback/github",
        HOME: stubDirectory,
        MASTRA_STORAGE_AUTH_TOKEN: "remote-agent-token",
        MASTRA_STORAGE_URL: "libsql://remote-agent.example.test",
        NODE_EXTRA_CA_CERTS: undefined,
        PORTLESS_CA_CERT: undefined,
        TURSO_AUTH_TOKEN: "must-not-reach-local-turso",
      }
    )

    expect(result).toEqual({ exitCode: 17, stderr: "", stdout: "" })
    expect(JSON.parse(await readFile(resultFile, "utf8"))).toEqual({
      apiOrigin:
        "https://api.feature-auth.enterprise-agentic-saas.localhost:7443",
      arguments: ["alpha", "two words"],
      callbackUrl:
        "https://api.feature-auth.enterprise-agentic-saas.localhost:7443/auth/oauth2/callback/github",
      emulateBaseUrl: null,
      nodeExtraCaCerts: `${stubDirectory}/.portless/ca.pem`,
      storageToken: "local-agent-storage",
      storageUrl:
        "https://agent-storage.feature-auth.enterprise-agentic-saas.localhost:7443",
      tursoToken: null,
    })
  })

  it("returns the child exit code and rejects an empty command", async () => {
    const stubDirectory = await createPortlessStub(
      "https://enterprise-agentic-saas.localhost"
    )
    const argumentsFile = join(stubDirectory, "arguments.txt")
    const environment = {
      PATH: `${stubDirectory}:${process.env.PATH ?? ""}`,
      PORTLESS_ARGUMENTS_FILE: argumentsFile,
    }

    expect(
      (
        await runCli(
          [
            "run",
            "api.enterprise-agentic-saas",
            "--",
            "bun",
            "-e",
            "process.exit(23)",
          ],
          environment
        )
      ).exitCode
    ).toBe(23)
    const empty = await runCli(
      ["run", "api.enterprise-agentic-saas", "--"],
      environment
    )
    expect(empty.exitCode).toBe(1)
    expect(empty.stderr).toContain("Specify a command after `--`.")

    const emptyExec = await runCli(["exec", "--"], environment)
    expect(emptyExec.exitCode).toBe(1)
    expect(emptyExec.stderr).toContain("Specify a command after `--`.")
  })

  it("cleans readiness polling when the wrapped process exits before ready", async () => {
    const stubDirectory = await createPortlessStub(
      "https://enterprise-agentic-saas.localhost"
    )
    const argumentsFile = join(stubDirectory, "arguments.txt")
    const cleanup = vi.fn<() => void>()

    const result = await runCli(
      [
        "run",
        "agent.enterprise-agentic-saas",
        "--",
        "bun",
        "-e",
        "process.exit(9)",
      ],
      {
        PATH: `${stubDirectory}:${process.env.PATH ?? ""}`,
        PORTLESS_ARGUMENTS_FILE: argumentsFile,
      },
      () => {
        const poll = setInterval(() => undefined, 10)
        const deadline = setTimeout(() => undefined, 2_000)
        return () => {
          clearInterval(poll)
          clearTimeout(deadline)
          cleanup()
        }
      }
    )

    expect(result.exitCode).toBe(9)
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it.each([
    ["SIGINT", 41],
    ["SIGTERM", 42],
  ] as const)("forwards %s to the Portless child", async (signal, exitCode) => {
    const stubDirectory = await createPortlessStub(
      "https://enterprise-agentic-saas.localhost"
    )
    const argumentsFile = join(stubDirectory, "arguments.txt")
    const readyFile = join(stubDirectory, "ready")
    const childScript = join(stubDirectory, "signal-child.ts")
    await writeFile(
      childScript,
      [
        'import { writeFileSync } from "node:fs"',
        `process.once(${JSON.stringify(signal)}, () => process.exit(${exitCode}))`,
        `writeFileSync(${JSON.stringify(readyFile)}, "ready")`,
        "setInterval(() => undefined, 1_000)",
        "",
      ].join("\n")
    )

    const result = await runCli(
      ["run", "agent.enterprise-agentic-saas", "--", "bun", childScript],
      {
        PATH: `${stubDirectory}:${process.env.PATH ?? ""}`,
        PORTLESS_ARGUMENTS_FILE: argumentsFile,
      },
      (child) => {
        const poll = setInterval(async () => {
          try {
            await readFile(readyFile)
            clearInterval(poll)
            clearTimeout(deadline)
            child.kill(signal)
          } catch {
            // The child has not reached its signal handler yet.
          }
        }, 10)
        const deadline = setTimeout(() => {
          clearInterval(poll)
          child.kill("SIGKILL")
        }, 2_000)
        return () => {
          clearInterval(poll)
          clearTimeout(deadline)
        }
      }
    )

    expect(result.exitCode).toBe(exitCode)
  })
})
