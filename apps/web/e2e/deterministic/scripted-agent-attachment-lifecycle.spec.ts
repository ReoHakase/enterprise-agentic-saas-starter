import { test } from "../fixtures/test"
import { runScriptedAgentAttachmentLifecycle } from "./scripted-agent-attachment-lifecycle"

test("スクリプト化したAgentの添付ライフサイクルを実構成で検証する", ({
  agentScenario,
  context,
  page,
}, testInfo) =>
  runScriptedAgentAttachmentLifecycle(
    { agentScenario, context, page },
    testInfo
  ))
