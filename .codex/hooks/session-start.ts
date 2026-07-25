import { readHookInput, writeJson } from "./hook-io.ts"

try {
  const input = await readHookInput()
  if (input.hook_event_name !== "SessionStart") {
    throw new TypeError("expected SessionStart input")
  }
  writeJson({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: [
        "このrepositoryではroot AGENTS.mdを共通contractとして使う。",
        "作業前にdocs/exec-plans/active/のactive plan、docs/architecture/README.md、",
        "変更領域のlocal skill、docs/testing/README.md、関連ADRを読む。",
        "仕様と設計理由の正本はdocs/、skill artifactの編集元は.agents/local-skills/である。",
      ].join(""),
    },
  })
} catch {
  writeJson({
    systemMessage:
      "SessionStart hook inputを解析できず、repository contextを追加できませんでした。",
  })
}
