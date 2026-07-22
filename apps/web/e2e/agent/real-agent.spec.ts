import { expect, test } from "../fixtures/test"

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

test("実Mastra Agentをlayout shellからstreamできる", async ({
  context,
  page,
}) => {
  const apiOrigin = readApiOrigin(test.info().config.metadata)

  await page.goto("/auth/sign-in?redirectTo=%2Fsettings%2Forganizations")
  await page.getByRole("button", { name: "GitHub" }).click()
  await page.getByRole("button", { name: /oauth-alice/ }).click()
  await expect(page).toHaveURL(/\/settings\/organizations$/u)

  const createOrganizationResponse = await context.request.post(
    `${apiOrigin}/organizations`,
    {
      headers: { origin: new URL(page.url()).origin },
      data: {
        name: "Agent Paid E2E",
        slug: "agent-paid-e2e",
      },
    }
  )
  expect(createOrganizationResponse.status()).toBe(201)
  const organization: unknown = await createOrganizationResponse.json()
  expect(
    organization !== null &&
      typeof organization === "object" &&
      Reflect.get(organization, "slug") === "agent-paid-e2e"
  ).toBe(true)

  await page.goto("/organization/agent-paid-e2e/issues")
  await expect(
    page.getByRole("heading", { name: "Issues", exact: true })
  ).toBeVisible()
  await page.getByRole("button", { name: "Open Agent" }).click()
  const agentShell = page.getByRole("complementary", { name: "Agent" })
  await expect(agentShell).toBeVisible()
  await agentShell.getByRole("button", { name: "New agent thread" }).click()

  const composer = agentShell.getByPlaceholder(
    "Describe the issue, or attach screenshots for analysis."
  )
  await expect(composer).toBeEnabled()
  await expect(page).toHaveURL(/[?&]agentThread=[^&]+/u)
  const threadId = new URL(page.url()).searchParams.get("agentThread")
  expect(Boolean(threadId)).toBe(true)

  await agentShell.evaluate((element) => {
    element.setAttribute("data-agent-e2e-persistent", "true")
  })
  await page.getByRole("link", { name: "Overview", exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard\?.*agentThread=/u)
  await expect(page.locator('[data-agent-e2e-persistent="true"]')).toBeVisible()

  const sentinel = `AGENT_E2E_OK_${crypto.randomUUID().replaceAll("-", "")}`
  await composer.fill(
    `Reply with exactly ${sentinel}. Do not call any tool or add other text.`
  )
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

  await page.waitForFunction(
    ({ expected }) =>
      [...document.querySelectorAll('aside[aria-label="Agent"] article')].some(
        (article) =>
          article.querySelector(":scope > p")?.textContent?.trim() ===
            "Issue agent" && article.textContent?.includes(expected)
      ),
    { expected: sentinel },
    { timeout: 120_000 }
  )

  await expect
    .poll(
      async () => {
        const response = await context.request.get(
          `${apiOrigin}/agent/threads/${encodeURIComponent(threadId ?? "")}/messages`
        )
        if (!response.ok()) return false
        const value: unknown = await response.json()
        return (
          Array.isArray(value) &&
          value.some(
            (message) =>
              message !== null &&
              typeof message === "object" &&
              Reflect.get(message, "role") === "assistant" &&
              Array.isArray(Reflect.get(message, "parts")) &&
              Reflect.get(message, "parts").some(
                (part: unknown) =>
                  part !== null &&
                  typeof part === "object" &&
                  Reflect.get(part, "type") === "text" &&
                  typeof Reflect.get(part, "text") === "string" &&
                  Reflect.get(part, "text").includes(sentinel)
              )
          )
        )
      },
      { timeout: 30_000 }
    )
    .toBe(true)
})
