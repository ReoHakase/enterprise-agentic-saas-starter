import { test } from "../fixtures/test"
import { runScriptedAgentWebSearchRead } from "./scripted-agent-web-search-read"

test("スクリプト化したAgentのweb-search-readを実構成で検証する", ({
  agentScenario,
  context,
  page,
}, testInfo) =>
  runScriptedAgentWebSearchRead({ agentScenario, context, page }, testInfo))
