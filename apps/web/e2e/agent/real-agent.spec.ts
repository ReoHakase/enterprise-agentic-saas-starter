import { readFile } from "node:fs/promises"

import type { APIRequestContext, Locator, Page } from "@playwright/test"

import { expect, test } from "../fixtures/test"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const readApiOrigin = (metadata: Record<string, unknown>): string => {
  const origin = Reflect.get(metadata, "agentE2EApiOrigin")
  if (
    typeof origin !== "string" ||
    !/^http:\/\/api\.agent-e2e\.enterprise-agentic-saas\.localhost:\d+$/u.test(
      origin
    )
  ) {
    throw new Error("Agent E2E API origin metadata is invalid")
  }
  return origin
}

const assistantArticles = (agentShell: Locator) =>
  agentShell.locator('article[aria-label="Agent response"]')

const sendMessage = async (
  page: Page,
  agentShell: Locator,
  message: string
) => {
  const previousCount = await assistantArticles(agentShell).count()
  const composer = agentShell.getByPlaceholder(
    "Describe the issue, or attach screenshots for analysis."
  )
  await composer.fill(message)
  const chatResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/agent/chat") &&
      response.request().method() === "POST"
  )
  await agentShell.getByRole("button", { name: "Send" }).click()
  const chatResponse = await chatResponsePromise
  expect(chatResponse.status()).toBe(200)
  expect(
    chatResponse.headers()["content-type"]?.startsWith("text/event-stream")
  ).toBe(true)
  await expect
    .poll(() => assistantArticles(agentShell).count(), { timeout: 120_000 })
    .toBeGreaterThan(previousCount)
  await expect(
    agentShell.getByRole("button", { name: "Send", exact: true })
  ).toBeEnabled({ timeout: 150_000 })
  await expect(
    agentShell.getByText(
      "Agent response failed. You can retry the same draft safely."
    )
  ).toHaveCount(0)
}

const createSeedIssue = async (
  request: APIRequestContext,
  input: {
    apiOrigin: string
    organizationId: string
    origin: string
    title: string
  }
) => {
  const response = await request.post(`${input.apiOrigin}/issues`, {
    headers: { origin: input.origin },
    data: {
      organizationId: input.organizationId,
      title: input.title,
      description:
        "A private tenant detail about an unreleased access-control regression.",
      status: "open",
      priority: "urgent",
      labels: ["Security"],
    },
  })
  expect(response.status()).toBe(201)
}

test("実Agent release journeyが安全境界とcanonical stateを満たす", async ({
  context,
  page,
}) => {
  const apiOrigin = readApiOrigin(test.info().config.metadata)
  const runSuffix = `${test.info().repeatEachIndex}-${crypto
    .randomUUID()
    .slice(0, 8)}`
  const organizationSlug = `agent-eval-${runSuffix}`

  await page.goto("/auth/sign-in?redirectTo=%2Fsettings%2Forganizations")
  await page.getByRole("button", { name: "GitHub" }).click()
  await page.getByRole("button", { name: /oauth-alice/ }).click()
  await expect(page).toHaveURL(/\/settings\/organizations$/u)

  const createOrganizationResponse = await context.request.post(
    `${apiOrigin}/organizations`,
    {
      headers: { origin: new URL(page.url()).origin },
      data: {
        name: `Agent Eval ${runSuffix}`,
        slug: organizationSlug,
      },
    }
  )
  expect(createOrganizationResponse.status()).toBe(201)
  const organization: unknown = await createOrganizationResponse.json()
  const organizationId =
    organization !== null && typeof organization === "object"
      ? Reflect.get(organization, "id")
      : undefined
  expect(typeof organizationId).toBe("string")
  if (typeof organizationId !== "string") {
    throw new Error("Agent E2E organization id is missing")
  }
  await createSeedIssue(context.request, {
    apiOrigin,
    organizationId,
    origin: new URL(page.url()).origin,
    title: `Urgent access regression ${runSuffix}`,
  })

  await page.goto(`/organization/${organizationSlug}/issues`)
  await expect(
    page.getByRole("heading", { name: "Issues", exact: true })
  ).toBeVisible()
  await page.getByRole("button", { name: "Open Agent" }).click()
  const agentShell = page.getByRole("complementary", { name: "Agent" })
  await expect(agentShell).toBeVisible()
  await expect(
    agentShell.getByText(`Agent Eval ${runSuffix}`, { exact: true })
  ).toHaveCount(0)

  await agentShell.getByRole("button", { name: "New agent thread" }).click()
  await expect(page).not.toHaveURL(/[?&]agentThread=/u)
  await expect(
    agentShell.getByRole("region", { name: "Sample prompts" })
  ).toContainText("Try an Agent prompt")

  await agentShell.evaluate((element) => {
    element.setAttribute("data-agent-e2e-persistent", "true")
  })
  await page.getByRole("link", { name: "Overview", exact: true }).click()
  await expect(page.locator('[data-agent-e2e-persistent="true"]')).toBeVisible()

  const sentinel = `AGENT_E2E_OK_${crypto.randomUUID().replaceAll("-", "")}`
  await sendMessage(
    page,
    agentShell,
    `Reply with exactly ${sentinel}. Do not call Issue or public research tools.`
  )
  await expect(page).toHaveURL(/[?&]agentThread=[^&]+/u)
  const threadId = new URL(page.url()).searchParams.get("agentThread")
  expect(Boolean(threadId)).toBe(true)
  await expect(assistantArticles(agentShell).last()).toContainText(sentinel)
  await expect
    .poll(async () => {
      const response = await context.request.get(`${apiOrigin}/agent/threads`)
      if (!response.ok()) return false
      const value: unknown = await response.json()
      if (!Array.isArray(value)) return false
      const renamedThread = value.find(
        (candidate) => isRecord(candidate) && candidate.id === threadId
      )
      return (
        isRecord(renamedThread) &&
        typeof renamedThread.title === "string" &&
        renamedThread.title !== "New conversation" &&
        typeof renamedThread.titleRevision === "number" &&
        renamedThread.titleRevision > 1
      )
    })
    .toBe(true)
  await expect(
    agentShell.getByRole("combobox", { name: "Agent thread" })
  ).not.toContainText("New conversation")
  await expect(
    agentShell.getByRole("button", { name: /^Context window \d+% used$/u })
  ).toBeVisible()

  await sendMessage(
    page,
    agentShell,
    "What are the current official Cloudflare Workers CPU time limits? Find the latest public source and summarize it."
  )
  await expect(
    agentShell.getByText(/web search · output available/u).last()
  ).toBeVisible({ timeout: 120_000 })

  await sendMessage(
    page,
    agentShell,
    "Read the urgent Issue in this organization and explain its priority. Use the Issue tool rather than guessing."
  )
  await expect(
    agentShell
      .getByText(/(?:get issue|search issues) · output available/u)
      .last()
  ).toBeVisible({ timeout: 120_000 })
  await expect(
    agentShell
      .getByRole("link", {
        name: new RegExp(`Urgent access regression ${runSuffix}`, "u"),
      })
      .first()
  ).toHaveAttribute("href", `/organization/${organizationSlug}/issues/1`)

  const composer = agentShell.getByPlaceholder(
    "Describe the issue, or attach screenshots for analysis."
  )
  await composer.fill("@")
  await page.getByRole("button", { name: /Current page/u }).click()
  await expect(composer).toContainText("@Current page")
  await sendMessage(
    page,
    agentShell,
    "Summarize the attached page context in one sentence."
  )

  await agentShell.locator('input[type="file"]').setInputFiles({
    name: "preview.png",
    mimeType: "image/png",
    buffer: await readFile(
      new URL(
        "../../../../packages/db/fixtures/files/preview.png",
        import.meta.url
      )
    ),
  })
  await expect(agentShell.getByLabel("Images ready to send")).toBeVisible({
    timeout: 30_000,
  })
  const imageIssueTitle = `Image research ${runSuffix}`
  await sendMessage(
    page,
    agentShell,
    `Compare this image with current public Cloudflare dashboard accessibility guidance, cite the latest source you find, then create a high-priority Issue titled "${imageIssueTitle}" and attach this image.`
  )
  await expect(
    agentShell.getByText(/web search · output available/u).last()
  ).toBeVisible({ timeout: 120_000 })
  await expect(
    agentShell.getByText("Approve Issue change?").last()
  ).toBeVisible({ timeout: 120_000 })
  await expect(agentShell).toContainText("preview.png")
  await agentShell.getByRole("button", { name: "Yes" }).last().click()
  let imageIssueId = ""
  await expect
    .poll(
      async () => {
        const response = await context.request.get(`${apiOrigin}/issues`, {
          params: { organizationId, search: imageIssueTitle },
        })
        if (!response.ok()) return false
        const value: unknown = await response.json()
        if (!isRecord(value) || !Array.isArray(value.items)) return false
        const issue = value.items.find(
          (candidate) =>
            isRecord(candidate) && candidate.title === imageIssueTitle
        )
        const id = isRecord(issue) ? issue.id : undefined
        if (typeof id !== "string") return false
        imageIssueId = id
        return true
      },
      { timeout: 60_000 }
    )
    .toBe(true)
  const imageIssueFiles = await context.request.get(
    `${apiOrigin}/files/organizations/${organizationId}/owners/issue/${imageIssueId}`
  )
  expect(imageIssueFiles.status()).toBe(200)
  expect(JSON.stringify(await imageIssueFiles.json())).toContain("preview.png")

  await sendMessage(
    page,
    agentShell,
    `Create an Issue titled "Rejected agent change ${runSuffix}" with priority low.`
  )
  await expect(
    agentShell.getByText("Approve Issue change?").last()
  ).toBeVisible({ timeout: 120_000 })
  await agentShell.getByRole("button", { name: "No" }).last().click()
  await expect(agentShell.getByText("rejected").last()).toBeVisible()

  const approvedTitle = `Approved agent change ${runSuffix}`
  await sendMessage(
    page,
    agentShell,
    `Create an Issue titled "${approvedTitle}" with priority high.`
  )
  await expect(
    agentShell.getByText("Approve Issue change?").last()
  ).toBeVisible({ timeout: 120_000 })
  await agentShell.getByRole("button", { name: "Yes" }).last().click()
  await expect
    .poll(
      async () => {
        const response = await context.request.get(`${apiOrigin}/issues`, {
          params: { organizationId, search: approvedTitle },
        })
        if (!response.ok()) return false
        const value: unknown = await response.json()
        return JSON.stringify(value).includes(approvedTitle)
      },
      { timeout: 60_000 }
    )
    .toBe(true)

  const permissionSelect = agentShell
    .getByRole("combobox")
    .filter({ hasText: "Ask always" })
  await permissionSelect.click()
  await page.getByRole("option", { name: /Full access/u }).click()
  await expect(
    agentShell.getByRole("combobox").filter({ hasText: "Full access" })
  ).toBeVisible()
  const approvalCountBeforeFullAccess = await agentShell
    .getByText("Approve Issue change?")
    .count()
  const fullAccessTitle = `Full access change ${runSuffix}`
  await sendMessage(
    page,
    agentShell,
    `Create an Issue titled "${fullAccessTitle}" with priority medium.`
  )
  await expect(agentShell.getByText("Approve Issue change?")).toHaveCount(
    approvalCountBeforeFullAccess
  )
  await expect
    .poll(
      async () => {
        const response = await context.request.get(`${apiOrigin}/issues`, {
          params: { organizationId, search: fullAccessTitle },
        })
        return (
          response.ok() && (await response.text()).includes(fullAccessTitle)
        )
      },
      { timeout: 60_000 }
    )
    .toBe(true)

  await agentShell
    .getByRole("combobox")
    .filter({ hasText: "Full access" })
    .click()
  await page.getByRole("option", { name: /Ask always/u }).click()

  await sendMessage(
    page,
    agentShell,
    `Prepare an Issue titled "Reload approval ${runSuffix}" and wait for my approval.`
  )
  await expect(
    agentShell.getByText("Approve Issue change?").last()
  ).toBeVisible({ timeout: 120_000 })
  await page.goto(
    `/organization/${organizationSlug}/agent?agentThread=${encodeURIComponent(threadId ?? "")}`
  )
  const reloadedShell = page.getByRole("complementary", { name: "Agent" })
  await expect(reloadedShell).toBeVisible()
  await expect(
    reloadedShell.getByText("Approve Issue change?").last()
  ).toBeVisible({ timeout: 30_000 })
  await expect(
    reloadedShell.getByText("Approval details could not be loaded.")
  ).toHaveCount(0)

  const [historyResponse, contextResponse, usageResponse] = await Promise.all([
    context.request.get(
      `${apiOrigin}/agent/threads/${encodeURIComponent(threadId ?? "")}/messages`
    ),
    context.request.get(
      `${apiOrigin}/agent/threads/${encodeURIComponent(threadId ?? "")}/context`
    ),
    context.request.get(`${apiOrigin}/agent/usage/monthly`),
  ])
  expect(historyResponse.status()).toBe(200)
  expect(contextResponse.status()).toBe(200)
  expect(usageResponse.status()).toBe(200)
  const history: unknown = await historyResponse.json()
  const contextProjection: unknown = await contextResponse.json()
  const usage: unknown = await usageResponse.json()
  const serializedHistory = JSON.stringify(history)
  expect(serializedHistory).not.toContain("data-activity")
  expect(serializedHistory).toContain("data-agent-assets")
  expect(serializedHistory).toContain("attachmentAssetIds")
  expect(serializedHistory).toContain("reasoning")
  expect(
    Array.isArray(history) &&
      new Set(
        history.flatMap((message) =>
          isRecord(message) && typeof message.id === "string"
            ? [message.id]
            : []
        )
      ).size === history.length
  ).toBe(true)
  await expect(reloadedShell.getByRole("status")).toHaveCount(0)
  expect(
    isRecord(contextProjection) &&
      typeof contextProjection.messageCount === "number" &&
      contextProjection.messageCount > 0
  ).toBe(true)
  expect(
    isRecord(usage) &&
      isRecord(usage.totals) &&
      typeof usage.totals.runCount === "number" &&
      usage.totals.runCount > 0
  ).toBe(true)
})
