import { inputText, readHookInput, writeJson } from "./hook-io.ts"

const protectedHarnessPath =
  /(?:^|[/\s"'`])(?:AGENTS\.md|\.codex\/|\.agents\/local-skills\/|docs\/decisions\/|docs\/exec-plans\/)(?:[^\s"'`]*)/
const mutation =
  /(?:\b(?:cp|install|mkdir|mv|rm|touch|truncate)\b|\bsed\s+-i\b|\bperl\s+-pi\b|(?:^|[\s;&|])(?:tee|cat)\b|>>?|apply_patch)/

try {
  const input = await readHookInput()
  if (input.hook_event_name !== "PostToolUse") {
    throw new TypeError("expected PostToolUse input")
  }
  const toolName = typeof input.tool_name === "string" ? input.tool_name : ""
  const command = inputText(input)
  const isMutation =
    /apply_patch|edit|write/i.test(toolName) || mutation.test(command)

  if (isMutation && protectedHarnessPath.test(command)) {
    writeJson({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext:
          "protected harness fileが変更されました。関連ADRとactive exec planを更新し、current diffを独立reviewへ渡してください。",
      },
    })
  }
} catch {
  writeJson({
    systemMessage:
      "PostToolUse hook inputを解析できず、protected harness review要否を判定できませんでした。",
  })
}
