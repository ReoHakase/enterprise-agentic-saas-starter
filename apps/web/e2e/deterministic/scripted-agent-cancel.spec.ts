import { test } from "../fixtures/test"
import { runScriptedAgentCancel } from "./scripted-agent-cancel"

test("scripted Agent cancel traverses the real stack", ({
  agentScenario,
  context,
  page,
}, testInfo) =>
  runScriptedAgentCancel({ agentScenario, context, page }, testInfo))
