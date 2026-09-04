import { describe, expect, it } from "vitest"

import { createWranglerArguments } from "./wrangler-portless"

const localEnvironment = {
  DEV_SESSION_ID: "session_123",
  DEV_WORKTREE_ID: "feature-auth",
  MASTRA_STORAGE_AUTH_TOKEN: "local-agent-storage",
  MASTRA_STORAGE_URL:
    "https://agent-storage.feature-auth.enterprise-agentic-saas.localhost",
  PORT: "43123",
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
}

describe("Agent Wrangler Portless起動器", () => {
  it("worktreeのstorage originとlocal tokenをWranglerへ渡す", () => {
    expect(createWranglerArguments(localEnvironment)).toEqual([
      "dev",
      "--port",
      "43123",
      "--inspector-port",
      "0",
      "--env-file",
      ".dev.vars.example",
      "--env-file",
      ".env.local",
      "--var",
      "MASTRA_STORAGE_URL:https://agent-storage.feature-auth.enterprise-agentic-saas.localhost",
      "--var",
      "MASTRA_STORAGE_AUTH_TOKEN:local-agent-storage",
      "--var",
      "DEV_WORKTREE_ID:feature-auth",
      "--var",
      "DEV_SESSION_ID:session_123",
      "--var",
      "OTEL_EXPORTER_OTLP_ENDPOINT:http://127.0.0.1:4318",
    ])
  })

  it("明示したinspector portを受け入れる", () => {
    expect(
      createWranglerArguments({
        ...localEnvironment,
        WRANGLER_INSPECTOR_PORT: "9234",
      })
    ).toContain("9234")
  })

  it.each([
    [{ ...localEnvironment, PORT: undefined }, "PORT is required"],
    [
      { ...localEnvironment, WRANGLER_INSPECTOR_PORT: "invalid" },
      "WRANGLER_INSPECTOR_PORT must be an integer from 0 to 65535",
    ],
    [
      {
        ...localEnvironment,
        MASTRA_STORAGE_URL: "https://agent-storage.example.test",
      },
      "MASTRA_STORAGE_URL must be a local Agent storage origin",
    ],
    [
      { ...localEnvironment, MASTRA_STORAGE_AUTH_TOKEN: "remote-token" },
      "MASTRA_STORAGE_AUTH_TOKEN must use the local Agent storage token",
    ],
    [
      {
        ...localEnvironment,
        OTEL_EXPORTER_OTLP_ENDPOINT: "https://telemetry.example.test",
      },
      "OTEL_EXPORTER_OTLP_ENDPOINT must be http://127.0.0.1:4318",
    ],
  ])("安全でないenvironment入力を拒否する", (environment, message) => {
    expect(() => createWranglerArguments(environment)).toThrow(message)
  })
})
