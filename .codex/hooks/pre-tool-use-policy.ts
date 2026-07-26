import { containsGeneratedSkillMutation } from "./generated-skill-policy.ts"
import {
  denyPreToolUse,
  inputText,
  inputWorkingDirectory,
  readHookInput,
  writeStdinInputIsSafe,
  writeJson,
} from "./hook-io.ts"
import {
  containsDrizzlePush,
  containsUnsafeDynamicShellExecution,
  containsUnsafeRepositoryFind,
  protectedCommandKind,
} from "./shell-policy.ts"

try {
  const input = await readHookInput()
  if (input.hook_event_name !== "PreToolUse") {
    throw new TypeError("expected PreToolUse input")
  }
  const toolName = typeof input.tool_name === "string" ? input.tool_name : ""
  const writeStdinIsSafe = writeStdinInputIsSafe(input)

  if (writeStdinIsSafe === false) {
    writeJson(
      denyPreToolUse(
        "`write_stdin`の実行contextを検証できないため、空のpollと停止用control character以外は拒否しました。"
      )
    )
  } else if (writeStdinIsSafe === null) {
    const command = inputText(input)
    const workingDirectory = inputWorkingDirectory(input)
    const isShellTool = /bash|exec|shell/iu.test(toolName)

    if (containsGeneratedSkillMutation(command, toolName, workingDirectory)) {
      writeJson(
        denyPreToolUse(
          "生成先`.agents/skills/**`は直接編集せず、`.agents/local-skills/**`を更新してNixで同期してください。"
        )
      )
    } else if (isShellTool && containsUnsafeDynamicShellExecution(command)) {
      writeJson(
        denyPreToolUse(
          "動的なshell実行を安全に解析できないため、repository policyをfail-closedで適用しました。"
        )
      )
    } else if (
      isShellTool &&
      containsUnsafeRepositoryFind(command, workingDirectory)
    ) {
      writeJson(
        denyPreToolUse(
          "repository全体を対象にする`find`の動的な変更操作は拒否しました。対象を明示した標準commandを使用してください。"
        )
      )
    } else if (isShellTool && containsDrizzlePush(command)) {
      writeJson(
        denyPreToolUse(
          "`drizzle-kit push`は禁止です。schema変更はgenerate + migrateを使ってください。"
        )
      )
    } else if (isShellTool) {
      const protectedCommand = protectedCommandKind(command)
      if (protectedCommand) {
        const reason = {
          cloudflare_deploy:
            "Cloudflare deployのwrapper形式は拒否しました。明示承認を受けるため標準commandを使用してください。",
          database_reset:
            "database resetのwrapper形式は拒否しました。明示承認を受けるため標準commandを使用してください。",
          git_config:
            "Git runtime configまたはalias設定による承認迂回を拒否しました。",
          git_merge:
            "Git mergeのwrapper形式は拒否しました。明示承認を受けるため標準commandを使用してください。",
          git_push:
            "Git pushのwrapper形式は拒否しました。明示承認を受けるため標準commandを使用してください。",
          pull_request_merge:
            "PR mergeのwrapper形式は拒否しました。明示承認を受けるため標準commandを使用してください。",
          remote_database:
            "remote database変更のwrapper形式は拒否しました。明示承認を受けるため標準commandを使用してください。",
        }[protectedCommand]
        writeJson(denyPreToolUse(reason))
      }
    }
  }
} catch {
  writeJson(
    denyPreToolUse(
      "PreToolUse hook inputを解析できないため、repository policyをfail-closedで適用しました。"
    )
  )
}
