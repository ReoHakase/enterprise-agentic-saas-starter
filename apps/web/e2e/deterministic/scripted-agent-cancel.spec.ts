import { test } from "../fixtures/test"
import { runScriptedAgentCancel } from "./scripted-agent-cancel"

test("スクリプト化したAgentのキャンセルを実構成で検証する", ({
  agentScenario,
  context,
  page,
}, testInfo) =>
  runScriptedAgentCancel({ agentScenario, context, page }, testInfo))
