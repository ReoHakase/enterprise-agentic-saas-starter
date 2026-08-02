import { test } from "../fixtures/test"
import { runScriptedAgentIssueWriteApproval } from "./scripted-agent-issue-write-approval"

test("scripted Agent issue-write-approval traverses the real stack", ({
  agentScenario,
  context,
  page,
}, testInfo) =>
  runScriptedAgentIssueWriteApproval(
    { agentScenario, context, page },
    testInfo
  ))
