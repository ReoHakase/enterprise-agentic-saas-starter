import { test } from "../fixtures/test"
import { runScriptedAgentIssueWriteApproval } from "./scripted-agent-issue-write-approval"

test("スクリプト化したAgentのIssue書き込み承認を実構成で検証する", ({
  agentScenario,
  context,
  page,
}, testInfo) =>
  runScriptedAgentIssueWriteApproval(
    { agentScenario, context, page },
    testInfo
  ))
