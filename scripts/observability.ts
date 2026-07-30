#!/usr/bin/env bun

import { resolve } from "node:path"

const COMPOSE_FILE = resolve(
  import.meta.dirname,
  "../compose.observability.yaml"
)
const GRAFANA_ALIAS = "grafana.enterprise-agentic-saas"
const OTEL_ALIAS = "otel.enterprise-agentic-saas"
const GRAFANA_HEALTH = "http://127.0.0.1:3000/api/health"
const COLLECTOR_HEALTH = "http://127.0.0.1:13133/ready"
const OTLP_TRACES = "http://127.0.0.1:4318/v1/traces"

type RunResult = {
  exitCode: number
  stderr: string
  stdout: string
}

export type ObservabilityDependencies = {
  fetch(
    input: string,
    init?: RequestInit
  ): Promise<{
    headers: { get(name: string): string | null }
    json(): Promise<unknown>
    ok: boolean
    status: number
    text(): Promise<string>
  }>
  run(argv: string[]): Promise<RunResult>
}

const dependencies: ObservabilityDependencies = {
  fetch: async (input, init) => await fetch(input, init),
  async run(argv) {
    const child = Bun.spawn(argv, { stderr: "pipe", stdout: "pipe" })
    const [stderr, stdout, exitCode] = await Promise.all([
      new Response(child.stderr).text(),
      new Response(child.stdout).text(),
      child.exited,
    ])
    return { exitCode, stderr, stdout }
  },
}

const compose = (...arguments_: string[]) => [
  "docker",
  "compose",
  "--file",
  COMPOSE_FILE,
  ...arguments_,
]

const requireSuccess = async (
  tools: ObservabilityDependencies,
  argv: string[],
  message: string
) => {
  const result = await tools.run(argv)
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim()
    throw new Error(`${message}${detail ? `\n${detail}` : ""}`)
  }
}

const ready = async (tools: ObservabilityDependencies) => {
  const [grafana, collector, otlp] = await Promise.all([
    tools.fetch(GRAFANA_HEALTH),
    tools.fetch(COLLECTOR_HEALTH),
    tools.fetch(OTLP_TRACES, {
      body: '{"resourceSpans":[]}',
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  ])
  if (!grafana.ok || grafana.status !== 200) return false
  const grafanaBody = await grafana.json()
  if (
    typeof grafanaBody !== "object" ||
    grafanaBody === null ||
    !("database" in grafanaBody) ||
    grafanaBody.database !== "ok"
  )
    return false
  if (!collector.ok || collector.status !== 200) return false
  const collectorBody = await collector.json()
  if (
    typeof collectorBody !== "object" ||
    collectorBody === null ||
    !("status" in collectorBody) ||
    collectorBody.status !== "Server available"
  )
    return false
  return (
    otlp.ok &&
    otlp.status === 200 &&
    otlp.headers.get("content-type")?.includes("application/json") === true
  )
}

export const checkObservability = async (
  tools: ObservabilityDependencies = dependencies
) => {
  try {
    const [isReady, routes] = await Promise.all([
      ready(tools),
      tools.run(["portless", "list"]),
    ])
    const routeLines = routes.stdout.split("\n")
    const hasAlias = (alias: string, port: string) =>
      routeLines.some(
        (line) =>
          line.includes(`https://${alias}.localhost`) &&
          line.includes(`localhost:${port}`) &&
          line.includes("(alias)")
      )
    if (
      isReady &&
      routes.exitCode === 0 &&
      hasAlias(GRAFANA_ALIAS, "3000") &&
      hasAlias(OTEL_ALIAS, "4318")
    )
      return
  } catch {
    // The stable error below explains the only supported recovery.
  }
  throw new Error(
    "Local observability is not running. Start Docker/OrbStack yourself, then run `bun run observability:up`. `bun run dev` never starts Docker or requests administrator privileges."
  )
}

export const upObservability = async (
  tools: ObservabilityDependencies = dependencies
) => {
  await requireSuccess(
    tools,
    ["docker", "info"],
    "Docker daemon is unavailable. Start Docker/OrbStack yourself and retry."
  )
  await requireSuccess(
    tools,
    ["portless", "doctor"],
    "Portless proxy is unavailable. Start it yourself and retry."
  )
  await requireSuccess(
    tools,
    compose("up", "--detach", "--wait", "--wait-timeout", "60"),
    "Unable to start the shared LGTM container."
  )
  await requireSuccess(
    tools,
    ["portless", "alias", GRAFANA_ALIAS, "3000", "--force"],
    "Unable to register the Grafana Portless alias."
  )
  await requireSuccess(
    tools,
    ["portless", "alias", OTEL_ALIAS, "4318", "--force"],
    "Unable to register the OTLP Portless alias."
  )
  await checkObservability(tools)
}

export const downObservability = async (
  tools: ObservabilityDependencies = dependencies
) => {
  await tools.run(["portless", "alias", "--remove", GRAFANA_ALIAS])
  await tools.run(["portless", "alias", "--remove", OTEL_ALIAS])
  await requireSuccess(
    tools,
    compose("down"),
    "Unable to stop the shared LGTM container."
  )
}

export const main = async (
  action: string | undefined,
  tools: ObservabilityDependencies = dependencies
) => {
  if (action === "check") return await checkObservability(tools)
  if (action === "up") return await upObservability(tools)
  if (action === "down") return await downObservability(tools)
  throw new Error("Usage: observability.ts <check|up|down>")
}

if (import.meta.main) {
  try {
    await main(process.argv[2])
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Observability command failed"
    )
    process.exitCode = 1
  }
}
