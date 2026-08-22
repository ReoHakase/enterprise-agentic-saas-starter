import type {
  APIRequestContext,
  APIResponse,
  Locator,
  Page,
} from "@playwright/test"

import { projectAgentE2EHistory } from "../fixtures/agent-e2e-projection"
import { expect, test } from "../fixtures/test"

type CanaryHarness = {
  agentShell: Locator
  apiOrigin: string
  organizationId: string
  organizationSlug: string
  runSuffix: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const LUNA_MODEL_ID = "openai/gpt-5.6-luna"
const LUNA_PROVIDER_ID = "openrouter"
const AGENT_RESUME_RESPONSE_TIMEOUT_MS = 60_000

const safeApiRequest = async (
  run: () => Promise<APIResponse>
): Promise<APIResponse | undefined> => {
  try {
    return await run()
  } catch {
    return undefined
  }
}

const safeResponseJson = async (
  response: Pick<APIResponse, "json" | "ok"> | undefined
) => {
  if (!response?.ok()) return { responseOk: false, value: undefined }
  try {
    const value: unknown = await response.json()
    return { responseOk: true, value }
  } catch {
    return { responseOk: false, value: undefined }
  }
}

const readHistoryProjection = async (
  request: APIRequestContext,
  apiOrigin: string,
  threadId: string
) => {
  const response = await safeApiRequest(() =>
    request.get(
      `${apiOrigin}/agent/threads/${encodeURIComponent(threadId)}/messages`
    )
  )
  const parsed = await safeResponseJson(response)
  return projectAgentE2EHistory(parsed.value, parsed.responseOk)
}

const readIssueState = async (
  request: APIRequestContext,
  input: {
    apiOrigin: string
    organizationId: string
    title: string
  }
) => {
  const response = await safeApiRequest(() =>
    request.get(`${input.apiOrigin}/issues`, {
      params: {
        organizationId: input.organizationId,
        search: input.title,
      },
    })
  )
  const parsed = await safeResponseJson(response)
  const body = isRecord(parsed.value) ? parsed.value : undefined
  const items = body && Array.isArray(body.items) ? body.items : undefined
  const candidates = items ?? []
  const matches = candidates.filter(
    (candidate) => isRecord(candidate) && candidate.title === input.title
  )
  const single = matches.length === 1 ? matches[0] : undefined
  const issueId =
    isRecord(single) && typeof single.id === "string" ? single.id : undefined
  const priority = isRecord(single) ? single.priority : undefined
  return {
    issueId,
    projection: {
      matchingIssueCount: matches.length,
      matchingIssueHasId: issueId !== undefined,
      matchingOpenCount: matches.filter(
        (candidate) => isRecord(candidate) && candidate.status === "open"
      ).length,
      matchingPriority:
        typeof priority === "string" &&
        ["high", "low", "medium", "urgent"].includes(priority)
          ? priority
          : null,
      responseOk: parsed.responseOk && items !== undefined,
    },
  }
}

const readIssueByNumberState = async (
  request: APIRequestContext,
  input: {
    apiOrigin: string
    expectedTitle: string
    number: number
    organizationId: string
  }
) => {
  const response = await safeApiRequest(() =>
    request.get(`${input.apiOrigin}/issues/by-number/${input.number}`, {
      params: { organizationId: input.organizationId },
    })
  )
  const parsed = await safeResponseJson(response)
  const issue = isRecord(parsed.value) ? parsed.value : undefined
  const priority = issue?.priority
  const status = issue?.status
  return {
    issueHasId: typeof issue?.id === "string",
    priority:
      typeof priority === "string" &&
      ["high", "low", "medium", "urgent"].includes(priority)
        ? priority
        : null,
    responseOk: parsed.responseOk && issue !== undefined,
    status:
      typeof status === "string" &&
      ["closed", "in_progress", "open"].includes(status)
        ? status
        : null,
    titleMatches: issue?.title === input.expectedTitle,
  }
}

const usageCount = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0

const readLunaUsage = async (request: APIRequestContext, apiOrigin: string) => {
  const response = await safeApiRequest(() =>
    request.get(`${apiOrigin}/agent/usage/monthly`)
  )
  const parsed = await safeResponseJson(response)
  const rows =
    isRecord(parsed.value) && Array.isArray(parsed.value.byModel)
      ? parsed.value.byModel
      : []
  const lunaRows = rows.filter(
    (row) =>
      isRecord(row) &&
      row.provider === LUNA_PROVIDER_ID &&
      row.model === LUNA_MODEL_ID
  )
  const totals = isRecord(parsed.value) ? parsed.value.totals : undefined
  const lunaOutputTokenCount = lunaRows.reduce(
    (total, row) =>
      total + (isRecord(row) ? usageCount(row.outputTokenCount) : 0),
    0
  )
  return {
    lunaModelRowCount: lunaRows.length,
    lunaOutputObserved: lunaOutputTokenCount > 0,
    lunaRunCount: lunaRows.reduce(
      (total, row) => total + (isRecord(row) ? usageCount(row.runCount) : 0),
      0
    ),
    responseOk: parsed.responseOk,
    totalRunCount: isRecord(totals) ? usageCount(totals.runCount) : 0,
  }
}

const readApiOrigin = (metadata: Record<string, unknown>): string => {
  const origin = Reflect.get(metadata, "agentE2EApiOrigin")
  if (
    typeof origin !== "string" ||
    !/^http:\/\/api\.agent-e2e\.enterprise-agentic-saas\.localhost:\d+$/u.test(
      origin
    )
  ) {
    throw new Error("Full E2E API origin metadata is invalid")
  }
  return origin
}

const agentAnswers = (agentShell: Locator) =>
  agentShell.getByRole("group", { name: "Agent answer" })

const projectCanonicalIssueLink = async (
  agentShell: Locator,
  expectedHref: string
) => ({
  canonicalIssueLinkMatches: await agentShell
    .getByRole("link")
    .evaluateAll(
      (links, href) => links.some((link) => link.getAttribute("href") === href),
      expectedHref
    ),
})

const reloadCanaryThread = async (page: Page) => {
  await page.reload()
  await page.getByRole("button", { name: "Open Agent" }).click()
  const agentShell = page.getByRole("complementary", { name: "Agent" })
  await expect(agentShell).toBeVisible()
  return agentShell
}

const sendMessage = async (
  page: Page,
  agentShell: Locator,
  message: string,
  options: { requireAnswer?: boolean } = {}
) => {
  const previousAnswerCount = await agentAnswers(agentShell).count()
  const composer = agentShell.getByPlaceholder(
    "Describe the issue, or attach screenshots for analysis."
  )
  await composer.fill(message)
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/agent/chat") &&
      response.request().method() === "POST"
  )
  await agentShell.getByRole("button", { name: "Send" }).click()

  const response = await responsePromise
  expect(response.status()).toBe(200)
  expect(
    response.headers()["content-type"]?.startsWith("text/event-stream")
  ).toBe(true)
  const sendButton = agentShell.getByRole("button", {
    name: "Send",
    exact: true,
  })
  const terminalAlerts = agentShell.getByRole("alert")
  await expect(sendButton).toBeEnabled({ timeout: 360_000 })
  await expect
    .poll(
      async () => {
        const terminalError =
          (await terminalAlerts.count()) === 0
            ? null
            : (await terminalAlerts.first().textContent())?.trim()
        return {
          answerCreated:
            !options.requireAnswer ||
            (await agentAnswers(agentShell).count()) > previousAnswerCount,
          terminalErrorCode:
            terminalError ===
            "Agent response timed out. You can retry the same draft safely."
              ? "agent_timeout"
              : terminalError ===
                  "Agent response failed. You can retry the same draft safely."
                ? "model_failed"
                : terminalError === null
                  ? null
                  : "unknown_error",
        }
      },
      { timeout: 10_000 }
    )
    .toEqual({
      answerCreated: true,
      terminalErrorCode: null,
    })
}

const approveLastAction = async (page: Page, agentShell: Locator) => {
  const approvalButton = agentShell.getByRole("button", { name: "Yes" }).last()
  await expect(approvalButton).toBeEnabled({ timeout: 60_000 })
  const decisionPromise = page.waitForResponse(
    (response) =>
      /\/agent\/actions\/[^/]+\/decision$/u.test(
        new URL(response.url()).pathname
      ) && response.request().method() === "POST",
    { timeout: 60_000 }
  )
  const decisionRequestPromise = page.waitForRequest(
    (request) =>
      /\/agent\/actions\/[^/]+\/decision$/u.test(
        new URL(request.url()).pathname
      ) && request.method() === "POST",
    { timeout: 60_000 }
  )
  const resumePromise = page.waitForResponse(
    (response) =>
      /\/agent\/actions\/[^/]+\/resume$/u.test(
        new URL(response.url()).pathname
      ) && response.request().method() === "POST",
    { timeout: AGENT_RESUME_RESPONSE_TIMEOUT_MS }
  )
  const resumeRequestPromise = page.waitForRequest(
    (request) =>
      /\/agent\/actions\/[^/]+\/resume$/u.test(
        new URL(request.url()).pathname
      ) && request.method() === "POST",
    { timeout: 60_000 }
  )
  await approvalButton.click()
  const [
    decisionRequestResult,
    decisionResult,
    resumeRequestResult,
    resumeResult,
  ] = await Promise.allSettled([
    decisionRequestPromise,
    decisionPromise,
    resumeRequestPromise,
    resumePromise,
  ])
  const resumeParsed =
    resumeResult.status === "fulfilled"
      ? await safeResponseJson(resumeResult.value)
      : { responseOk: false, value: undefined }
  const resumeBody = isRecord(resumeParsed.value)
    ? resumeParsed.value
    : undefined
  const resumeIssue = isRecord(resumeBody?.issue) ? resumeBody.issue : undefined
  const resumeKind = resumeBody?.kind
  return {
    issueNumber:
      typeof resumeIssue?.number === "number" &&
      Number.isSafeInteger(resumeIssue.number) &&
      resumeIssue.number > 0
        ? resumeIssue.number
        : undefined,
    projection: {
      decisionHttpStatus:
        decisionResult.status === "fulfilled"
          ? decisionResult.value.status()
          : 0,
      decisionRequestObserved: decisionRequestResult.status === "fulfilled",
      resumeHttpStatus:
        resumeResult.status === "fulfilled" ? resumeResult.value.status() : 0,
      resumeIssueHasId: typeof resumeIssue?.id === "string",
      resumeKind:
        typeof resumeKind === "string" &&
        ["create_issue", "delete_issue", "update_issue"].includes(resumeKind)
          ? resumeKind
          : null,
      resumeRequestObserved: resumeRequestResult.status === "fulfilled",
      resumeSucceeded:
        resumeParsed.responseOk && resumeBody?.status === "succeeded",
    },
  }
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
  const response = await safeApiRequest(() =>
    request.post(`${input.apiOrigin}/issues`, {
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
  )
  if (response?.status() !== 201) {
    throw new Error("Agent canary seed Issue request failed")
  }
  const issue = (await safeResponseJson(response)).value
  if (
    !isRecord(issue) ||
    typeof issue.id !== "string" ||
    typeof issue.number !== "number"
  ) {
    throw new Error("Agent canary seed Issue is invalid")
  }
  return { id: issue.id, number: issue.number }
}

const openCanaryHarness = async (
  page: Page,
  request: APIRequestContext
): Promise<CanaryHarness> => {
  const apiOrigin = readApiOrigin(test.info().config.metadata)
  const runSuffix = crypto.randomUUID().slice(0, 8)
  const organizationSlug = `agent-canary-${runSuffix}`

  await page.goto("/auth/sign-in?redirectTo=%2Fsettings%2Forganizations")
  await page.getByRole("button", { name: "GitHub" }).click()
  await page.getByRole("button", { name: /oauth-alice/u }).click()
  await expect
    .poll(() => {
      try {
        return new URL(page.url()).pathname === "/settings/organizations"
      } catch {
        return false
      }
    })
    .toBe(true)

  const createOrganizationResponse = await safeApiRequest(() =>
    request.post(`${apiOrigin}/organizations`, {
      headers: { origin: new URL(page.url()).origin },
      data: {
        name: `Agent Canary ${runSuffix}`,
        slug: organizationSlug,
      },
    })
  )
  if (createOrganizationResponse?.status() !== 201) {
    throw new Error("Agent canary organization request failed")
  }
  const organization = (await safeResponseJson(createOrganizationResponse))
    .value
  const organizationId =
    isRecord(organization) && typeof organization.id === "string"
      ? organization.id
      : null
  if (!organizationId) {
    throw new Error("Agent canary organization id is missing")
  }

  await page.goto(`/organization/${organizationSlug}/issues`)
  await page.getByRole("button", { name: "Open Agent" }).click()
  const agentShell = page.getByRole("complementary", { name: "Agent" })
  await expect(agentShell).toBeVisible()
  await agentShell.getByRole("button", { name: "New agent thread" }).click()

  return {
    agentShell,
    apiOrigin,
    organizationId,
    organizationSlug,
    runSuffix,
  }
}

test("agent-canary-web-search-source", async ({ context, page }) => {
  const harness = await openCanaryHarness(page, context.request)
  let agentShell = harness.agentShell

  await sendMessage(
    page,
    agentShell,
    [
      "Use public Web search and cite the latest official source.",
      "Public-only Web query: official Cloudflare Workers CPU time limits",
    ].join("\n"),
    { requireAnswer: true }
  )
  const threadId = new URL(page.url()).searchParams.get("agentThread")
  expect(threadId).toBeTruthy()
  await expect
    .poll(
      async () => {
        const history = await readHistoryProjection(
          context.request,
          harness.apiOrigin,
          threadId ?? ""
        )
        return {
          assistantAnswerAvailable: history.assistantAnswerAvailable,
          bounded: history.bounded,
          hasPublicUrl: history.hasPublicUrl,
          responseOk: history.responseOk,
          webSearchOutputAvailable: history.webSearchOutputAvailable,
        }
      },
      { timeout: 120_000 }
    )
    .toEqual({
      assistantAnswerAvailable: true,
      bounded: true,
      hasPublicUrl: true,
      responseOk: true,
      webSearchOutputAvailable: true,
    })
  await expect(
    agentShell.getByRole("status", { name: "Search the web" }).last()
  ).toBeVisible({ timeout: 120_000 })
  await expect(
    agentShell.getByRole("combobox", { name: "Agent thread" })
  ).not.toHaveText("New conversation", { timeout: 60_000 })
  await expect
    .poll(() => readLunaUsage(context.request, harness.apiOrigin), {
      timeout: 60_000,
    })
    .toEqual({
      lunaModelRowCount: 1,
      lunaOutputObserved: true,
      lunaRunCount: 1,
      responseOk: true,
      totalRunCount: 1,
    })

  agentShell = await reloadCanaryThread(page)
  await expect
    .poll(() => agentAnswers(agentShell).count(), { timeout: 120_000 })
    .toBeGreaterThanOrEqual(1)
  await expect(
    agentShell.getByRole("status", { name: "Search the web" }).last()
  ).toBeVisible({ timeout: 120_000 })
})

test("agent-canary-private-issue-read", async ({ context, page }) => {
  const harness = await openCanaryHarness(page, context.request)
  const issueTitle = `Urgent access regression ${harness.runSuffix}`
  const issue = await createSeedIssue(context.request, {
    apiOrigin: harness.apiOrigin,
    organizationId: harness.organizationId,
    origin: new URL(page.url()).origin,
    title: issueTitle,
  })
  let agentShell = harness.agentShell

  await sendMessage(
    page,
    agentShell,
    `Call get_issue for Issue #${issue.number} titled "${issueTitle}". Do not answer until the tool returns; then state the returned priority.`,
    { requireAnswer: true }
  )
  const threadId = new URL(page.url()).searchParams.get("agentThread")
  expect(threadId).toBeTruthy()
  const canonicalIssueHref = `/organization/${harness.organizationSlug}/issues/${issue.number}?agentThread=${encodeURIComponent(threadId ?? "")}`
  await expect(
    agentShell
      .getByRole("status", { name: `View Issue #${issue.number}` })
      .last()
  ).toBeVisible({ timeout: 120_000 })
  await expect
    .poll(
      async () => {
        const history = await readHistoryProjection(
          context.request,
          harness.apiOrigin,
          threadId ?? ""
        )
        return {
          assistantAnswerAvailable: history.assistantAnswerAvailable,
          bounded: history.bounded,
          getIssueInputAvailable: history.getIssueInputAvailable,
          getIssueOutputAvailable: history.getIssueOutputAvailable,
          getIssuePartAvailable: history.getIssuePartAvailable,
          getIssuePriorityUrgent: history.getIssuePriorityUrgent,
          hasDataImage: history.hasDataImage,
          hasObjectKey: history.hasObjectKey,
          hasPrivateUrl: history.hasPrivateUrl,
          hasRawProviderField: history.hasRawProviderField,
          responseOk: history.responseOk,
        }
      },
      { timeout: 120_000 }
    )
    .toEqual({
      assistantAnswerAvailable: true,
      bounded: true,
      getIssueInputAvailable: true,
      getIssueOutputAvailable: true,
      getIssuePartAvailable: true,
      getIssuePriorityUrgent: true,
      hasDataImage: false,
      hasObjectKey: false,
      hasPrivateUrl: false,
      hasRawProviderField: false,
      responseOk: true,
    })
  await expect
    .poll(() => projectCanonicalIssueLink(agentShell, canonicalIssueHref), {
      timeout: 120_000,
    })
    .toEqual({ canonicalIssueLinkMatches: true })
  await expect
    .poll(() => readLunaUsage(context.request, harness.apiOrigin), {
      timeout: 60_000,
    })
    .toEqual({
      lunaModelRowCount: 1,
      lunaOutputObserved: true,
      lunaRunCount: 1,
      responseOk: true,
      totalRunCount: 1,
    })

  agentShell = await reloadCanaryThread(page)
  await expect
    .poll(() => agentAnswers(agentShell).count(), { timeout: 120_000 })
    .toBeGreaterThanOrEqual(1)
  await expect
    .poll(() => projectCanonicalIssueLink(agentShell, canonicalIssueHref), {
      timeout: 120_000,
    })
    .toEqual({ canonicalIssueLinkMatches: true })
})

test("agent-canary-approved-issue-write", async ({ context, page }) => {
  const harness = await openCanaryHarness(page, context.request)
  const issueTitle = `Approved issue write ${harness.runSuffix}`
  const agentShell = harness.agentShell

  await sendMessage(
    page,
    agentShell,
    `Prepare a high-priority Issue titled "${issueTitle}". Ask for approval before writing it.`
  )
  await expect(
    agentShell.getByText("Approve Issue change?").last()
  ).toBeVisible({ timeout: 120_000 })
  const issueBeforeApproval = await readIssueState(context.request, {
    apiOrigin: harness.apiOrigin,
    organizationId: harness.organizationId,
    title: issueTitle,
  })
  expect(issueBeforeApproval.projection).toEqual({
    matchingIssueCount: 0,
    matchingIssueHasId: false,
    matchingOpenCount: 0,
    matchingPriority: null,
    responseOk: true,
  })

  const approval = await approveLastAction(page, agentShell)
  expect(approval.projection).toEqual({
    decisionHttpStatus: 200,
    decisionRequestObserved: true,
    resumeHttpStatus: 200,
    resumeIssueHasId: true,
    resumeKind: "create_issue",
    resumeRequestObserved: true,
    resumeSucceeded: true,
  })
  if (!approval.issueNumber) {
    throw new Error("Agent canary approved Issue number is missing")
  }
  await expect
    .poll(
      () =>
        readIssueByNumberState(context.request, {
          apiOrigin: harness.apiOrigin,
          expectedTitle: issueTitle,
          number: approval.issueNumber ?? 0,
          organizationId: harness.organizationId,
        }),
      { timeout: 60_000 }
    )
    .toEqual({
      issueHasId: true,
      priority: "high",
      responseOk: true,
      status: "open",
      titleMatches: true,
    })
  const threadId = new URL(page.url()).searchParams.get("agentThread")
  expect(threadId).toBeTruthy()
  await expect
    .poll(
      () =>
        readHistoryProjection(
          context.request,
          harness.apiOrigin,
          threadId ?? ""
        ),
      { timeout: 30_000 }
    )
    .toMatchObject({
      bounded: true,
      hasAgentAssetsPart: false,
      hasDataImage: false,
      hasObjectKey: false,
      hasPrivateUrl: false,
      hasRawProviderField: false,
      hasStructuredContentUnavailable: false,
      hasToolStateUnavailable: false,
      responseOk: true,
    })

  await expect
    .poll(() => readLunaUsage(context.request, harness.apiOrigin), {
      timeout: 60_000,
    })
    .toMatchObject({
      lunaModelRowCount: 1,
      lunaOutputObserved: true,
      lunaRunCount: 1,
      responseOk: true,
      totalRunCount: 1,
    })
})
