import { test } from "../fixtures/test"
import { runScriptedAgentAttachmentLifecycle } from "./scripted-agent-attachment-lifecycle"

test("scripted Agent attachment-lifecycle traverses the real stack", ({
  agentScenario,
  context,
  page,
}, testInfo) =>
  runScriptedAgentAttachmentLifecycle(
    { agentScenario, context, page },
    testInfo
  ))
