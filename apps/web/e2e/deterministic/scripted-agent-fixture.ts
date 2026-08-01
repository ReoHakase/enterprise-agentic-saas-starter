import type {
  APIRequestContext,
  BrowserContext,
  Locator,
  Page,
  TestInfo,
} from "@playwright/test"

import { expect, type AgentScenario } from "../fixtures/test"

const SCRIPTED_ISSUE_TITLE = "Scripted Agent cross-worker issue"

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

export const recordArray = (
  record: Record<string, unknown>,
  key: string
): Record<string, unknown>[] => {
  const value = Reflect.get(record, key)
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new Error(`Deterministic Agent E2E ${key} is invalid`)
  }
  return value
}

const readApiOrigin = (metadata: Record<string, unknown>): string => {
  const origin = Reflect.get(metadata, "agentE2EApiOrigin")
  if (
    typeof origin !== "string" ||
    !/^http:\/\/127\.0\.0\.1:\d+$/u.test(origin)
  ) {
    throw new Error("Deterministic Agent E2E API origin metadata is invalid")
  }
  return origin
}

export type ScriptedAgentTestFixtures = {
  agentScenario: AgentScenario
  context: BrowserContext
  page: Page
}

export type ScriptedAgentRuntime = {
  agentShell: Locator
  apiOrigin: string
  composer: Locator
  context: BrowserContext
  cookieHeader: string
  organizationId: string
  origin: string
  page: Page
  permission: Locator
  submittedChatBodies: Record<string, unknown>[]
  submittedMessageIds: string[]
}

export type ScriptedCreatedIssueRuntime = ScriptedAgentRuntime & {
  createResumeResult: unknown
  threadId: string
}

export const setupScriptedAgentScenario = async (
  { agentScenario, context, page }: ScriptedAgentTestFixtures,
  testInfo: TestInfo
): Promise<ScriptedAgentRuntime> => {
  const apiOrigin = readApiOrigin(testInfo.config.metadata)
  const organizationSlug = agentScenario.organizationSlug

  await page.goto("/settings/organizations")
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
        name: agentScenario.organizationName,
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
  await expect(permission).toContainText("Ask always")
  const composer = agentShell.getByPlaceholder(
    "Describe the issue, or attach screenshots for analysis."
  )
  const submittedMessageIds: string[] = []
  const submittedChatBodies: Record<string, unknown>[] = []
  page.on("request", (request) => {
    if (request.url().endsWith("/agent/chat") && request.method() === "POST") {
      const body: unknown = request.postDataJSON()
      const messageId = isRecord(body)
        ? Reflect.get(body, "messageId")
        : undefined
      if (typeof messageId === "string" && isRecord(body)) {
        submittedMessageIds.push(messageId)
        submittedChatBodies.push(body)
      }
    }
  })

  return {
    agentShell,
    apiOrigin,
    composer,
    context,
    cookieHeader,
    organizationId: organization.id,
    origin,
    page,
    permission,
    submittedChatBodies,
    submittedMessageIds,
  }
}

export const createScriptedIssue = async (
  runtime: ScriptedAgentRuntime
): Promise<ScriptedCreatedIssueRuntime> => {
  const { agentShell, composer, page } = runtime
  await composer.fill(
    "[E1:CREATE] Create the scripted Issue and report the result."
  )
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
  await expect(agentShell.getByText("Approve Issue change?")).toBeVisible()
  const resumeResponsePromise = page.waitForResponse(
    (resumeResponse) =>
      /\/agent\/actions\/[^/]+\/resume$/u.test(
        new URL(resumeResponse.url()).pathname
      ) && resumeResponse.request().method() === "POST"
  )
  await agentShell.getByRole("button", { name: "Yes" }).click()
  const resumeResponse = await resumeResponsePromise
  expect(resumeResponse.status()).toBe(200)
  const createResumeResult: unknown = await resumeResponse.json()
  await expect(agentShell.getByText("succeeded", { exact: true })).toBeVisible()
  await expect(agentShell.getByText("SCRIPTED_AGENT_OK")).toBeVisible()
  await expect(
    agentShell.getByRole("button", { name: "Send", exact: true })
  ).toBeEnabled()
  await runtime.permission.click()
  await page.getByRole("option", { name: /Full access/u }).click()
  await expect(runtime.permission).toContainText("Full access")
  const threadId = new URL(page.url()).searchParams.get("agentThread")
  expect(threadId).toBeTruthy()
  if (!threadId) throw new Error("Scripted Agent thread id is missing")

  return { ...runtime, createResumeResult, threadId }
}

export const readCreatedIssue = async (
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

export const assertAuditPersistence = async (
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
          approvalMode: "manual",
          source: "agent",
        }),
      }),
    ])
  )
}

export const assertUsagePersistence = async (
  request: APIRequestContext,
  input: {
    apiOrigin: string
    cookie: string
    expectedRunCount: number
    origin: string
  }
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
      inputTokenCount: expect.any(Number),
      outputTokenCount: expect.any(Number),
      reasoningTokenCount: 0,
      runCount: input.expectedRunCount,
      totalTokenCount: expect.any(Number),
    })
}
