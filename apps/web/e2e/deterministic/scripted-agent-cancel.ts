import type { TestInfo } from "@playwright/test"

import { expect } from "../fixtures/test"
import {
  isRecord,
  recordArray,
  setupScriptedAgentScenario,
  type ScriptedAgentTestFixtures,
} from "./scripted-agent-fixture"

export const runScriptedAgentCancel = async (
  fixtures: ScriptedAgentTestFixtures,
  testInfo: TestInfo
) => {
  const {
    agentShell,
    apiOrigin,
    composer,
    context,
    cookieHeader,
    origin,
    submittedMessageIds,
  } = await setupScriptedAgentScenario(fixtures, testInfo)

  await composer.fill("[E1:STOP] Stream a partial response until I stop it.")
  await agentShell.getByRole("button", { name: "Send", exact: true }).click()
  await expect(agentShell.getByText("E1_PARTIAL_SESSION_ONLY")).toBeVisible()
  const cancelResponsePromise = fixtures.page.waitForResponse(
    (response) =>
      /\/agent\/threads\/[^/]+\/runs\/[^/]+\/cancel$/u.test(
        new URL(response.url()).pathname
      ) && response.request().method() === "POST"
  )
  await agentShell.getByRole("button", { name: "Stop", exact: true }).click()
  const cancelResponse = await cancelResponsePromise
  expect(cancelResponse.status()).toBe(200)
  const cancelResult: unknown = await cancelResponse.json()
  if (
    !isRecord(cancelResult) ||
    typeof cancelResult.runId !== "string" ||
    cancelResult.status !== "canceled"
  ) {
    throw new Error("Stopped Agent run result is invalid")
  }
  await expect(agentShell.getByText("Turn stopped.")).toBeVisible()
  await expect(
    agentShell.getByRole("button", { name: "Send", exact: true })
  ).toBeEnabled()

  const threadId = new URL(fixtures.page.url()).searchParams.get("agentThread")
  expect(threadId).toBeTruthy()
  if (!threadId) throw new Error("Stopped Agent thread id is missing")
  const historyResponse = await context.request.get(
    `${apiOrigin}/agent/threads/${threadId}/messages`,
    { headers: { cookie: cookieHeader, origin } }
  )
  expect(historyResponse.ok()).toBe(true)
  const history: unknown = await historyResponse.json()
  if (!isRecord(history)) {
    throw new Error("Stopped Agent history is invalid")
  }
  const messages = recordArray(history, "messages")
  expect(
    messages.every((message) => Reflect.get(message, "role") === "user")
  ).toBe(true)
  expect(JSON.stringify(messages)).not.toMatch(
    /E1_PARTIAL_SESSION_ONLY|data-run/u
  )
  const replayCancel = await context.request.post(
    `${apiOrigin}/agent/threads/${threadId}/runs/${cancelResult.runId}/cancel`,
    { headers: { cookie: cookieHeader, origin } }
  )
  expect(replayCancel.status()).toBe(200)
  expect(await replayCancel.json()).toEqual(cancelResult)
  expect(submittedMessageIds).toHaveLength(1)
}
