import type { TestInfo } from "@playwright/test"

import { expect } from "../fixtures/test"
import {
  assertUsagePersistence,
  createScriptedIssue,
  readCreatedIssue,
  setupScriptedAgentScenario,
  type ScriptedAgentTestFixtures,
} from "./scripted-agent-fixture"

const CLOUDFLARE_FLAGS_URL =
  "https://developers.cloudflare.com/workers/configuration/compatibility-flags/"

export const runScriptedAgentWebSearchRead = async (
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
    organizationId,
    origin,
    page,
  } = runtime
  await readCreatedIssue(context.request, {
    apiOrigin,
    cookie: cookieHeader,
    organizationId,
    origin,
  })

  await composer.fill(
    [
      "[E1:WEB_SEARCH]",
      "Public-only Web query: official Cloudflare Workers request signal flags",
    ].join("\n")
  )
  await agentShell.getByRole("button", { name: "Send", exact: true }).click()
  await expect(
    agentShell.getByRole("status", { name: "Search the web" }).last()
  ).toBeVisible()
  await expect(
    agentShell.getByRole("link", {
      name: "Cloudflare Workers compatibility flags",
    })
  ).toHaveAttribute("href", CLOUDFLARE_FLAGS_URL)
  await expect(agentShell.getByText(/E1_SEARCH_OK/u)).toBeVisible()
  await assertUsagePersistence(context.request, {
    apiOrigin,
    cookie: cookieHeader,
    expectedRunCount: 2,
    origin,
  })

  await page.reload()
  await page.getByRole("button", { name: "Open Agent" }).click()
  const reloadedAgent = page.getByRole("complementary", { name: "Agent" })
  await expect(
    reloadedAgent.getByRole("status", { name: "Search the web" })
  ).toBeVisible()
  await expect(
    reloadedAgent.getByRole("link", {
      name: "Cloudflare Workers compatibility flags",
    })
  ).toHaveAttribute("href", CLOUDFLARE_FLAGS_URL)
}
