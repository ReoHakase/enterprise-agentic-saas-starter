import { describe, expect, it } from "vitest"

import { buildVitestCommands, runVitestCommands } from "./test-related"

describe("pre-commit Vitest selection", () => {
  it("groups root and workspace files into related unit commands", () => {
    const commands = buildVitestCommands([
      ".github/compatibility-rollout-policy.ts",
      "apps/web/src/features/issues/api.ts",
      "docs/README.md",
    ])

    expect(commands).toHaveLength(2)
    expect(commands[0]?.args).toEqual([
      "bun",
      "vitest",
      "related",
      "--run",
      "--coverage=false",
      "./.github/compatibility-rollout-policy.ts",
    ])
    expect(commands[1]?.args).toEqual([
      "bun",
      "vitest",
      "related",
      "--run",
      "--coverage=false",
      "--project=unit",
      "./src/features/issues/api.ts",
    ])
  })

  it("falls back to the workspace unit suite for trigger and deleted files", () => {
    const commands = buildVitestCommands([
      "tsconfig.json",
      "apps/api/vitest.config.ts",
      "apps/api/src/deleted-module.ts",
    ])

    expect(commands).toHaveLength(2)
    expect(commands[0]?.args).toEqual([
      "bun",
      "vitest",
      "run",
      "--coverage=false",
    ])
    expect(commands[1]?.args).toEqual([
      "bun",
      "vitest",
      "run",
      "--coverage=false",
    ])
  })

  it("keeps the database force-rerun triggers on the full unit suite", () => {
    const commands = buildVitestCommands([
      "packages/db/src/schema/issues.ts",
      "packages/db/drizzle/0025_next.sql",
      "packages/db/drizzle.config.ts",
    ])

    expect(commands).toHaveLength(1)
    expect(commands[0]?.args).toEqual([
      "bun",
      "vitest",
      "run",
      "--coverage=false",
    ])
  })

  it("does not select browser-only, unsupported, or documentation files", () => {
    expect(
      buildVitestCommands([
        "apps/web/src/features/agent/agent-chat.browser.test.tsx",
        "apps/web/e2e/fixtures/run-full-e2e.ts",
        "packages/typescript-config/package.json",
        "docs/testing-strategy/README.md",
      ])
    ).toEqual([])
  })

  it("runs commands in order and stops after the first failure", async () => {
    const commands = buildVitestCommands(["scripts/observability.ts"])
    const seen: string[] = []

    await expect(
      runVitestCommands(commands, async (command) => {
        seen.push(command.args.join(" "))
        return 1
      })
    ).resolves.toBe(1)
    expect(seen).toHaveLength(1)
  })
})
