import { spawnSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import path from "node:path"

import { describe, expect, test } from "vitest"

const repositoryRoot = process.cwd()
const hooksRoot = path.join(repositoryRoot, ".codex/hooks")

type HookInput = Record<string, unknown>

const runHook = (script: string, input: HookInput | string) => {
  const result = spawnSync("bun", [path.join(hooksRoot, script)], {
    cwd: repositoryRoot,
    encoding: "utf8",
    input: typeof input === "string" ? input : JSON.stringify(input),
  })
  return {
    exitCode: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  }
}

const preToolInput = (command: string, toolName = "Bash"): HookInput => ({
  session_id: "contract",
  cwd: repositoryRoot,
  hook_event_name: "PreToolUse",
  tool_name: toolName,
  tool_use_id: "contract",
  tool_input: { command },
})

const expectDenied = (command: string, reason: string, toolName = "Bash") => {
  const result = runHook(
    "pre-tool-use-policy.ts",
    preToolInput(command, toolName)
  )
  expect(result).toMatchObject({ exitCode: 0, stderr: "" })
  expect(JSON.parse(result.stdout)).toMatchObject({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: expect.stringContaining(reason),
    },
  })
}

describe("Codex harness", () => {
  test("keeps the project configuration under version control", () => {
    const result = spawnSync(
      "git",
      [
        "check-ignore",
        "--no-index",
        ".codex/config.toml",
        ".codex/hooks.json",
        ".codex/rules/default.rules",
      ],
      { cwd: repositoryRoot, encoding: "utf8" }
    )
    expect(result).toMatchObject({ status: 1, stderr: "", stdout: "" })
  })

  test("adds repository context at session start", () => {
    const result = runHook("session-start.ts", {
      session_id: "contract",
      cwd: repositoryRoot,
      hook_event_name: "SessionStart",
      source: "startup",
    })
    expect(result).toMatchObject({ exitCode: 0, stderr: "" })
    expect(JSON.parse(result.stdout)).toMatchObject({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: expect.stringContaining("docs/exec-plans/active/"),
      },
    })
  })

  test("allows a read-only command", () => {
    expect(
      runHook("pre-tool-use-policy.ts", preToolInput("bun run check"))
    ).toEqual({ exitCode: 0, stderr: "", stdout: "" })
  })

  test.each([
    ["bunx drizzle-kit push", "drizzle-kit push", "Bash"],
    [
      "*** Update File: .agents/skills/frontend/SKILL.md",
      ".agents/skills",
      "apply_patch",
    ],
    ["git -C /workspace push origin feature", "Git push", "Bash"],
    ["bunx wrangler d1 execute --remote production", "remote database", "Bash"],
    ["env turso db destroy production --yes", "remote database", "Bash"],
    ["env turso db shell production DELETE", "remote database", "Bash"],
    [
      "env turso --config-path /tmp/turso db destroy production --yes",
      "remote database",
      "Bash",
    ],
    [
      "env turso db --config-path /tmp/turso destroy production --yes",
      "remote database",
      "Bash",
    ],
    ["env bun run --cwd packages/db db:migrate", "remote database", "Bash"],
  ])("denies protected mutation %s", (command, reason, toolName) => {
    expectDenied(command, reason, toolName)
  })

  test.each([
    "turso db destroy production --yes",
    "turso db shell production DELETE",
    "turso --config-path /tmp/turso db destroy production --yes",
    "turso db --config-path /tmp/turso destroy production --yes",
    "bun run --cwd packages/db db:migrate",
    "node node_modules/drizzle-kit/bin.cjs migrate",
  ])("routes standard remote database command through Rules: %s", (command) => {
    expect(
      runHook("pre-tool-use-policy.ts", preToolInput(command))
    ).toMatchObject({ exitCode: 0, stderr: "", stdout: "" })
  })

  test("fails closed on dynamic shell input", () => {
    expectDenied('eval "$REMOTE_COMMAND"', "fail-closed")
  })

  test("fails closed on malformed input", () => {
    const result = spawnSync(
      "bun",
      [path.join(hooksRoot, "pre-tool-use-policy.ts")],
      { cwd: repositoryRoot, encoding: "utf8", input: "{" }
    )
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      hookSpecificOutput: {
        permissionDecision: "deny",
        permissionDecisionReason: expect.stringContaining("fail-closed"),
      },
    })
  })

  test("routes shell aliases through hooks and direct commands through Rules", async () => {
    const [hooks, rules] = await Promise.all([
      readFile(path.join(repositoryRoot, ".codex/hooks.json"), "utf8"),
      readFile(path.join(repositoryRoot, ".codex/rules/default.rules"), "utf8"),
    ])
    for (const toolName of [
      "Bash",
      "exec",
      "exec_command",
      "shell",
      "write_stdin",
    ]) {
      expect(hooks).toContain(toolName)
    }
    for (const command of [
      '"/usr/bin/git push origin feature"',
      '"bunx wrangler deploy"',
      '"bun run --cwd packages/db db:reset"',
      '"turso db destroy production --yes"',
      '"turso --config-path /tmp/turso db destroy production --yes"',
      '"turso db --config-path /tmp/turso destroy production --yes"',
      '"bun run --cwd packages/db db:migrate"',
    ]) {
      expect(rules).toContain(command)
    }
  })

  test("requests review after a protected harness mutation", () => {
    const postToolInput = (command: string): HookInput => ({
      session_id: "contract",
      cwd: repositoryRoot,
      hook_event_name: "PostToolUse",
      tool_name: "apply_patch",
      tool_use_id: "contract",
      tool_input: { command },
      tool_response: { success: true },
    })
    const protectedResult = runHook(
      "post-tool-use-review.ts",
      postToolInput("*** Update File: .codex/config.toml")
    )
    const unrelatedResult = runHook(
      "post-tool-use-review.ts",
      postToolInput("*** Update File: apps/web/src/app/page.tsx")
    )
    expect(JSON.parse(protectedResult.stdout)).toMatchObject({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: expect.stringContaining("独立review"),
      },
    })
    expect(unrelatedResult).toEqual({ exitCode: 0, stderr: "", stdout: "" })
  })
})
