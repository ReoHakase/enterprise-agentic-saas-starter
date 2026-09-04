import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it, vi } from "vitest"

import {
  checkObservability,
  downObservability,
  type ObservabilityDependencies,
  upObservability,
} from "./observability"

const COMPOSE_FILE = resolve(
  import.meta.dirname,
  "../compose.observability.yaml"
)

const tools = (
  overrides: Partial<ObservabilityDependencies> = {}
): ObservabilityDependencies => ({
  fetch: vi.fn(async (input) => {
    const collector = input.includes("13133")
    const grafana = input.includes("/api/health")
    return {
      headers: {
        get: (name) =>
          name === "access-control-allow-origin"
            ? "https://enterprise-agentic-saas.localhost"
            : "application/json",
      },
      json: async () =>
        grafana
          ? { database: "ok" }
          : collector
            ? { status: "Server available" }
            : {},
      ok: true,
      status: input.startsWith("https://otel.") ? 204 : 200,
      text: async () => (collector ? "Server available" : "{}"),
    }
  }),
  run: vi.fn(async (argv) => ({
    exitCode: 0,
    stderr: "",
    stdout:
      argv[0] === "portless" && argv[1] === "list"
        ? [
            "https://grafana.enterprise-agentic-saas.localhost -> localhost:3000 (alias)",
            "https://otel.enterprise-agentic-saas.localhost -> localhost:4318 (alias)",
          ].join("\n")
        : "",
  })),
  ...overrides,
})

describe("local observability lifecycleの契約", () => {
  it("固定loopback endpointとbrowser aliasを確認する", async () => {
    const dependencies = tools()

    await checkObservability(dependencies)

    expect(dependencies.run).toHaveBeenCalledWith(["portless", "list"])
    expect(dependencies.fetch).toHaveBeenCalledTimes(3)
  })

  it("stackが利用不能な場合は手動復旧command付きで失敗する", async () => {
    const dependencies = tools({
      fetch: vi.fn(async () => {
        throw new Error("connection refused")
      }),
    })

    await expect(checkObservability(dependencies)).rejects.toThrow(
      /Start Docker\/OrbStack yourself.*observability:up/u
    )
    expect(dependencies.run).toHaveBeenCalledWith(["portless", "list"])
  })

  it("単一compose projectを起動して両aliasを登録する", async () => {
    const dependencies = tools()

    await upObservability(dependencies)

    expect(dependencies.run).toHaveBeenNthCalledWith(1, ["docker", "info"])
    expect(dependencies.run).toHaveBeenNthCalledWith(2, ["portless", "doctor"])
    expect(dependencies.run).toHaveBeenNthCalledWith(3, [
      "docker",
      "compose",
      "--file",
      COMPOSE_FILE,
      "up",
      "--detach",
      "--wait",
      "--wait-timeout",
      "60",
    ])
    expect(dependencies.run).toHaveBeenNthCalledWith(4, [
      "portless",
      "alias",
      "grafana.enterprise-agentic-saas",
      "3000",
      "--force",
    ])
    expect(dependencies.run).toHaveBeenNthCalledWith(5, [
      "portless",
      "alias",
      "otel.enterprise-agentic-saas",
      "4318",
      "--force",
    ])
  })

  it("両aliasを除去してnamed volumeを保持する", async () => {
    const dependencies = tools()

    await downObservability(dependencies)

    expect(dependencies.run).toHaveBeenNthCalledWith(1, [
      "portless",
      "alias",
      "--remove",
      "grafana.enterprise-agentic-saas",
    ])
    expect(dependencies.run).toHaveBeenNthCalledWith(2, [
      "portless",
      "alias",
      "--remove",
      "otel.enterprise-agentic-saas",
    ])
    expect(dependencies.run).toHaveBeenNthCalledWith(3, [
      "docker",
      "compose",
      "--file",
      COMPOSE_FILE,
      "down",
    ])
  })
})

it("root collector設定をLGTM wiringとlocal filteringだけに制限する", async () => {
  const config = await readFile(
    resolve(import.meta.dirname, "../otelcol.observability.yaml"),
    "utf8"
  )

  expect(config).toContain("connectors:\n  spanmetrics:")
  expect(config).toContain("transform/redact-auth:")
  expect(config).toContain(
    'set(resource.attributes["dev.session.id"], attributes["dev.session.id"])'
  )
  expect(config).toContain("endpoint: http://127.0.0.1:4418")
  expect(config).toContain("transform/remove-trace-error-details:")
  expect(config).toContain("filter/drop-trace-exceptions:")
  expect(config).toContain('set(status.message, "")')
  expect(config).toContain(
    [
      "        - transform/redact-auth",
      "        - transform/remove-trace-error-details",
      "        - filter/drop-trace-exceptions",
      "        - batch",
    ].join("\n")
  )
  expect(config).toContain("processors: [transform/redact-auth, batch]")
  expect(config).toContain("(?:^|[._-])(?:authorization|proxy")
  expect(config).toContain("(?:cookie|set[._-]?cookie)")
  expect(config).toContain("\\\\beyJ[A-Za-z0-9_-]*\\\\.")
  expect(config).toContain("x-amz-")
  expect(config).toContain("oauth_token|refresh_token|state|signature")
  expect(config).not.toContain("flatten(body)")
  expect(config).not.toContain("|key|")
  expect(config).not.toContain('delete_matching_keys(attributes, "(?i)^url')
})

it("全local Loki streamをcompactor削除前に七日間保持する", async () => {
  const compose = await readFile(COMPOSE_FILE, "utf8")

  expect(compose).toContain("--compactor.retention-enabled=true")
  expect(compose).toContain("--compactor.delete-request-store=filesystem")
  expect(compose).toContain("--store.retention=168h")
})
