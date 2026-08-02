import type { TestInfo } from "@playwright/test"

import { expect } from "../fixtures/test"
import {
  assertAuditPersistence,
  assertUsagePersistence,
  createScriptedIssue,
  isRecord,
  readCreatedIssue,
  setupScriptedAgentScenario,
  type ScriptedAgentTestFixtures,
} from "./scripted-agent-fixture"

export const runScriptedAgentIssueWriteApproval = async (
  fixtures: ScriptedAgentTestFixtures,
  testInfo: TestInfo
) => {
  const runtime = await createScriptedIssue(
    await setupScriptedAgentScenario(fixtures, testInfo)
  )
  const {
    agentShell,
    apiOrigin,
    composer,
    context,
    cookieHeader,
    createResumeResult,
    organizationId,
    origin,
    page,
  } = runtime

  await composer.fill("[E1:FOLLOWUP-2] Confirm the second follow-up.")
  await agentShell.getByRole("button", { name: "Send", exact: true }).click()
  await expect(agentShell.getByText("E1_FOLLOWUP_2_OK")).toBeVisible()
  await expect(
    agentShell.getByRole("button", { name: "Send", exact: true })
  ).toBeEnabled()
  await composer.fill("[E1:FOLLOWUP-3] Confirm the third follow-up.")
  await agentShell.getByRole("button", { name: "Send", exact: true }).click()
  await expect(agentShell.getByText("E1_FOLLOWUP_3_OK")).toBeVisible()

  const createdIssue = await readCreatedIssue(context.request, {
    apiOrigin,
    cookie: cookieHeader,
    organizationId,
    origin,
  })
  const issueId = Reflect.get(createdIssue, "id")
  if (typeof issueId !== "string") {
    throw new Error("Scripted Agent persisted issue id is missing")
  }
  const actionId = isRecord(createResumeResult)
    ? Reflect.get(createResumeResult, "actionId")
    : undefined
  if (typeof actionId !== "string") {
    throw new Error("Scripted Agent approval action id is missing")
  }
  await assertAuditPersistence(context.request, {
    actionId,
    apiOrigin,
    cookie: cookieHeader,
    issueId,
    organizationId,
    origin,
  })
  await assertUsagePersistence(context.request, {
    apiOrigin,
    cookie: cookieHeader,
    expectedRunCount: 3,
    origin,
  })
  await page.reload()
  await page.getByRole("button", { name: "Open Agent" }).click()
  const reloadedAgent = page.getByRole("complementary", { name: "Agent" })
  await expect(reloadedAgent.getByText("SCRIPTED_AGENT_OK")).toBeVisible()
  await expect(reloadedAgent.getByText("E1_FOLLOWUP_3_OK")).toBeVisible()
}
