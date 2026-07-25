import type { APIRequestContext } from "@playwright/test"

import { expect, test } from "../fixtures/test"

const SCRIPTED_ISSUE_TITLE = "Scripted Agent cross-worker issue"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const recordArray = (
  record: Record<string, unknown>,
  key: string
): Record<string, unknown>[] => {
  const value = Reflect.get(record, key)
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new Error(`Scripted Agent E2E ${key} is invalid`)
  }
  return value
}

const readApiOrigin = (metadata: Record<string, unknown>): string => {
  const origin = Reflect.get(metadata, "agentE2EApiOrigin")
  if (
    typeof origin !== "string" ||
    !/^http:\/\/127\.0\.0\.1:\d+$/u.test(origin)
  ) {
    throw new Error("Scripted Agent E2E API origin metadata is invalid")
  }
  return origin
}

const assertCanonicalMessages = (
  messages: unknown
): { actionId: string; issueId: string } => {
  if (!Array.isArray(messages) || !messages.every(isRecord)) {
    throw new Error("Scripted Agent E2E messages are invalid")
  }
  const assistant = messages.find(
    (message) => Reflect.get(message, "role") === "assistant"
  )
  if (!assistant) throw new Error("Scripted Agent assistant message is missing")
  const parts = recordArray(assistant, "parts")
  expect(parts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "tool-create_issue",
        state: "output-available",
        output: expect.objectContaining({
          kind: "create_issue",
          status: "succeeded",
        }),
      }),
      expect.objectContaining({
        type: "data-context-budget",
        data: expect.objectContaining({ observedInputTokens: 28 }),
      }),
      expect.objectContaining({ type: "text", text: "SCRIPTED_AGENT_OK" }),
    ])
  )
  const toolPart = parts.find(
    (part) => Reflect.get(part, "type") === "tool-create_issue"
  )
  const output = toolPart && Reflect.get(toolPart, "output")
  const issue = isRecord(output) && Reflect.get(output, "issue")
  const actionId = isRecord(output) && Reflect.get(output, "actionId")
  const issueId = isRecord(issue) && Reflect.get(issue, "id")
  if (typeof actionId !== "string" || typeof issueId !== "string") {
    throw new Error("Scripted Agent canonical action receipt is invalid")
  }
  return { actionId, issueId }
}

const readCreatedIssue = async (
  request: APIRequestContext,
  input: {
    apiOrigin: string
    cookie: string
    organizationId: string
    origin: string
  }
): Promise<Record<string, unknown>> => {
  const response = await request.get(`${input.apiOrigin}/issues`, {
    headers: { cookie: input.cookie, origin: input.origin },
    params: {
      organizationId: input.organizationId,
      search: SCRIPTED_ISSUE_TITLE,
    },
  })
  expect(response.status()).toBe(200)
  const page: unknown = await response.json()
  if (!isRecord(page)) throw new Error("Scripted Agent issue page is invalid")
  const issue = recordArray(page, "items").find(
    (candidate) => Reflect.get(candidate, "title") === SCRIPTED_ISSUE_TITLE
  )
  if (!issue) throw new Error("Scripted Agent issue was not persisted")
  expect(issue).toMatchObject({
    description: "Created by the deterministic cross-Worker Agent E2E.",
    priority: "high",
  })
  return issue
}

const assertAuditPersistence = async (
  request: APIRequestContext,
  input: {
    apiOrigin: string
    actionId: string
    cookie: string
    issueId: string
    organizationId: string
    origin: string
  }
): Promise<void> => {
  const response = await request.get(
    `${input.apiOrigin}/organizations/${input.organizationId}/audit-logs`,
    {
      headers: { cookie: input.cookie, origin: input.origin },
      params: { action: "issue.created" },
    }
  )
  expect(response.status()).toBe(200)
  const events: unknown = await response.json()
  if (!Array.isArray(events) || !events.every(isRecord)) {
    throw new Error("Scripted Agent audit events are invalid")
  }
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        action: "issue.created",
        targetId: input.issueId,
        metadata: expect.objectContaining({
          actionId: input.actionId,
          approvalMode: "auto_policy",
          source: "agent",
        }),
      }),
    ])
  )
}

const assertUsagePersistence = async (
  request: APIRequestContext,
  input: { apiOrigin: string; cookie: string; origin: string }
): Promise<void> => {
  await expect
    .poll(async () => {
      const response = await request.get(
        `${input.apiOrigin}/agent/usage/monthly`,
        { headers: { cookie: input.cookie, origin: input.origin } }
      )
      if (!response.ok()) return null
      const usage: unknown = await response.json()
      if (!isRecord(usage)) return null
      return Reflect.get(usage, "totals")
    })
    .toMatchObject({
      inputTokenCount: 36,
      outputTokenCount: 11,
      reasoningTokenCount: 0,
      runCount: 2,
      totalTokenCount: 47,
    })
}

test("scripted Agent Worker traverses the real Web/API/Auth/DB stack", async ({
  context,
  page,
}) => {
  const apiOrigin = readApiOrigin(test.info().config.metadata)
  const runSuffix = crypto.randomUUID().slice(0, 8)
  const organizationSlug = `scripted-agent-${runSuffix}`

  await page.goto("/auth/sign-in?redirectTo=%2Fsettings%2Forganizations")
  await page.getByRole("button", { name: "GitHub" }).click()
  await page.getByRole("button", { name: /oauth-alice/u }).click()
  await expect(page).toHaveURL(/\/settings\/organizations$/u)
  const origin = new URL(page.url()).origin
  const cookieHeader = (await context.cookies())
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ")

  const organizationResponse = await context.request.post(
    `${apiOrigin}/organizations`,
    {
      headers: { cookie: cookieHeader, origin },
      data: {
        name: `Scripted Agent ${runSuffix}`,
        slug: organizationSlug,
      },
    }
  )
  expect(organizationResponse.status()).toBe(201)
  const organization: unknown = await organizationResponse.json()
  if (!isRecord(organization) || typeof organization.id !== "string") {
    throw new Error("Scripted Agent E2E organization id is missing")
  }

  await page.goto(`/organization/${organizationSlug}/issues`)
  await page.getByRole("button", { name: "Open Agent" }).click()
  const agentShell = page.getByRole("complementary", { name: "Agent" })
  await expect(agentShell).toBeVisible()
  await agentShell.getByRole("button", { name: "New agent thread" }).click()
  const permission = agentShell
    .getByRole("combobox")
    .filter({ hasText: /Ask always|Full access/u })
  await permission.click()
  await page.getByRole("option", { name: /Full access/u }).click()
  await expect(permission).toContainText("Full access")

  const composer = agentShell.getByPlaceholder(
    "Describe the issue, or attach screenshots for analysis."
  )
  await composer.fill("Create the scripted Issue and report the result.")
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/agent/chat") &&
      response.request().method() === "POST"
  )
  await agentShell.getByRole("button", { name: "Send", exact: true }).click()

  const response = await responsePromise
  expect(response.status()).toBe(200)
  expect(
    response.headers()["content-type"]?.startsWith("text/event-stream")
  ).toBe(true)
  await expect(
    agentShell.getByText(/create issue · output available/u)
  ).toBeVisible()
  await expect(agentShell.getByText("SCRIPTED_AGENT_OK")).toBeVisible()
  await expect(
    agentShell.getByRole("button", { name: "Send", exact: true })
  ).toBeEnabled()

  const threadId = new URL(page.url()).searchParams.get("agentThread")
  expect(threadId).toBeTruthy()
  if (!threadId) return

  const messagesResponse = await context.request.get(
    `${apiOrigin}/agent/threads/${threadId}/messages`,
    { headers: { cookie: cookieHeader, origin } }
  )
  expect(messagesResponse.status()).toBe(200)
  const canonicalReceipt = assertCanonicalMessages(
    await messagesResponse.json()
  )

  const createdIssue = await readCreatedIssue(context.request, {
    apiOrigin,
    cookie: cookieHeader,
    organizationId: organization.id,
    origin,
  })
  const issueId = Reflect.get(createdIssue, "id")
  if (typeof issueId !== "string") {
    throw new Error("Scripted Agent persisted issue id is missing")
  }
  expect(issueId).toBe(canonicalReceipt.issueId)
  await assertAuditPersistence(context.request, {
    actionId: canonicalReceipt.actionId,
    apiOrigin,
    cookie: cookieHeader,
    issueId,
    organizationId: organization.id,
    origin,
  })
  await assertUsagePersistence(context.request, {
    apiOrigin,
    cookie: cookieHeader,
    origin,
  })

  await page.reload()
  await page.getByRole("button", { name: "Open Agent" }).click()
  await expect(
    page
      .getByRole("complementary", { name: "Agent" })
      .getByText("SCRIPTED_AGENT_OK")
  ).toBeVisible()
})
