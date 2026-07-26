import { readFile } from "node:fs/promises"
import path from "node:path"

export type HookInput = {
  cwd?: unknown
  hook_event_name?: unknown
  source?: unknown
  tool_input?: unknown
  tool_name?: unknown
}

export const readHookInput = async (): Promise<HookInput> => {
  const raw = await readFile(0, "utf8")
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("hook input must be a JSON object")
  }
  return {
    cwd: "cwd" in parsed ? parsed.cwd : undefined,
    hook_event_name:
      "hook_event_name" in parsed ? parsed.hook_event_name : undefined,
    source: "source" in parsed ? parsed.source : undefined,
    tool_input: "tool_input" in parsed ? parsed.tool_input : undefined,
    tool_name: "tool_name" in parsed ? parsed.tool_name : undefined,
  }
}

export const inputText = (input: HookInput) => {
  const toolInput = input.tool_input
  if (toolInput && typeof toolInput === "object" && !Array.isArray(toolInput)) {
    const hasCommand = "command" in toolInput
    const hasCmd = "cmd" in toolInput
    if (hasCommand && hasCmd) {
      throw new TypeError("ambiguous command fields")
    }
    const toolName = typeof input.tool_name === "string" ? input.tool_name : ""
    const usesCmd = /exec_command|(?:^|[.:/])exec$/iu.test(toolName)
    const usesCommand = /bash|shell/iu.test(toolName)
    if (usesCmd) {
      if (!hasCmd || typeof toolInput.cmd !== "string") {
        throw new TypeError("exec tool requires cmd")
      }
      return toolInput.cmd
    }
    if (usesCommand) {
      if (!hasCommand || typeof toolInput.command !== "string") {
        throw new TypeError("shell tool requires command")
      }
      return toolInput.command
    }
    if (hasCommand && typeof toolInput.command === "string") {
      return toolInput.command
    }
    if (hasCmd && typeof toolInput.cmd === "string") return toolInput.cmd
  }
  return JSON.stringify(toolInput ?? "")
}

const writeStdinStopCharacters = new Set(["\u0003", "\u0004"])

export const writeStdinInputIsSafe = (input: HookInput) => {
  const toolName = typeof input.tool_name === "string" ? input.tool_name : ""
  if (!/write_stdin/iu.test(toolName)) return null
  const toolInput = input.tool_input
  if (!toolInput || typeof toolInput !== "object" || Array.isArray(toolInput)) {
    return false
  }
  if ("command" in toolInput || "cmd" in toolInput) return false
  if (!("chars" in toolInput) || toolInput.chars === "") return true
  return (
    typeof toolInput.chars === "string" &&
    toolInput.chars.length > 0 &&
    [...toolInput.chars].every((character) =>
      writeStdinStopCharacters.has(character)
    )
  )
}

export const inputWorkingDirectory = (input: HookInput) => {
  const base = typeof input.cwd === "string" ? input.cwd : "."
  const toolInput = input.tool_input
  if (
    toolInput &&
    typeof toolInput === "object" &&
    !Array.isArray(toolInput) &&
    "workdir" in toolInput &&
    typeof toolInput.workdir === "string"
  ) {
    return path.resolve(base, toolInput.workdir)
  }
  return path.resolve(base)
}

export const writeJson = (value: unknown) => {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

export const denyPreToolUse = (reason: string) => ({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: reason,
  },
})
