import { test } from "../fixtures/test"
import { runScriptedAgentWebSearchRead } from "./scripted-agent-web-search-read"

test("scripted Agent web-search-read traverses the real stack", ({
  agentScenario,
  context,
  page,
}, testInfo) =>
  runScriptedAgentWebSearchRead({ agentScenario, context, page }, testInfo))
