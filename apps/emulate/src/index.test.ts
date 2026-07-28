import { describe, expect, it, vi } from "vitest"

import { runPortless } from "./index"

type RunTopology = (input: {
  command: string[]
  environment: NodeJS.ProcessEnv
  logicalName: string
}) => Promise<number>

describe("Emulate Portless launcher", () => {
  it("runs through the computed multi-label route", async () => {
    const runTopology = vi.fn<RunTopology>(async () => 17)
    const resolveApiOrigin = vi.fn<() => Promise<string>>(
      async () => "https://api.feature-auth.enterprise-agentic-saas.localhost"
    )

    const exitCode = await runPortless("github", {
      environment: {},
      resolveApiOrigin,
      runTopology,
    })

    expect(exitCode).toBe(17)
    expect(resolveApiOrigin).toHaveBeenCalledOnce()
    expect(runTopology).toHaveBeenCalledWith({
      command: ["bun", "run", "src/index.ts", "github"],
      environment: {
        GITHUB_OAUTH_CALLBACK_URL:
          "https://api.feature-auth.enterprise-agentic-saas.localhost/auth/oauth2/callback/github",
      },
      logicalName: "github.emulate.enterprise-agentic-saas",
    })
  })
})
