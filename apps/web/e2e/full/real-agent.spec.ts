import { readFile } from "node:fs/promises"

import type { APIRequestContext, Locator, Page } from "@playwright/test"

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

const assistantArticles = (agentShell: Locator) =>
  agentShell.locator('article[aria-label="Agent response"]')

const readPersistedToolStates = async (
  request: APIRequestContext,
  apiOrigin: string,
  threadId: string
) => {
  const response = await request.get(
    `${apiOrigin}/agent/threads/${encodeURIComponent(threadId)}/messages`
  )
  if (!response.ok()) return []
  const body: unknown = await response.json()
  const messages = Array.isArray(body)
    ? body
    : isRecord(body) && Array.isArray(body.messages)
      ? body.messages
      : []
  return messages.flatMap((message) => {
    if (!isRecord(message) || !Array.isArray(message.parts)) return []
    return message.parts.flatMap((part) =>
      isRecord(part) &&
      typeof part.type === "string" &&
      part.type.startsWith("tool-") &&
      typeof part.state === "string"
        ? [`${part.type.slice(5)}:${part.state}`]
        : []
    )
  })
}

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
  await expect
    .poll(() => assistantArticles(agentShell).count(), { timeout: 120_000 })
    .toBeGreaterThan(previousCount)
  await expect(
    agentShell.getByRole("button", { name: "Send", exact: true })
  ).toBeEnabled({ timeout: 360_000 })
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
  const issue: unknown = await response.json()
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
  await expect(page).toHaveURL(/\/settings\/organizations$/u)

  const createOrganizationResponse = await request.post(
    `${apiOrigin}/organizations`,
    {
      headers: { origin: new URL(page.url()).origin },
      data: {
        name: `Agent Canary ${runSuffix}`,
        slug: organizationSlug,
      },
    }
  )
  expect(createOrganizationResponse.status()).toBe(201)
  const organization: unknown = await createOrganizationResponse.json()
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

test("agent-canary-read-source", async ({ context, page }) => {
  const harness = await openCanaryHarness(page, context.request)
  const issueTitle = `Urgent access regression ${harness.runSuffix}`
  await createSeedIssue(context.request, {
    apiOrigin: harness.apiOrigin,
    organizationId: harness.organizationId,
    origin: new URL(page.url()).origin,
    title: issueTitle,
  })

  await sendMessage(
    page,
    harness.agentShell,
    [
      "Use public Web search and cite the latest official source.",
      "Public-only Web query: official Cloudflare Workers CPU time limits",
    ].join("\n")
  )
  const threadId = new URL(page.url()).searchParams.get("agentThread")
  expect(threadId).toBeTruthy()
  await expect
    .poll(
      () =>
        readPersistedToolStates(
          context.request,
          harness.apiOrigin,
          threadId ?? ""
        ),
      { timeout: 30_000 }
    )
    .toContain("web_search:output-available")
  await expect(
    harness.agentShell.getByText(/web search · completed/u).last()
  ).toBeVisible({ timeout: 120_000 })
  await expect(
    assistantArticles(harness.agentShell)
      .last()
      .locator('a[href^="http"]')
      .first()
  ).toBeVisible({ timeout: 120_000 })

  await sendMessage(
    page,
    harness.agentShell,
    `Read the Issue titled "${issueTitle}" in this organization and explain its priority. Use the Issue tool rather than guessing.`
  )
  await expect(
    harness.agentShell
      .getByText(/(?:get issue|search issues) · completed/u)
      .last()
  ).toBeVisible({ timeout: 120_000 })
  await expect(
    harness.agentShell
      .getByRole("link", { name: new RegExp(issueTitle, "u") })
      .first()
  ).toHaveAttribute(
    "href",
    `/organization/${harness.organizationSlug}/issues/1`
  )
})

test("agent-canary-approved-image-write", async ({ context, page }) => {
  const harness = await openCanaryHarness(page, context.request)
  const issueTitle = `Approved image write ${harness.runSuffix}`

  await harness.agentShell.getByLabel("Attach images").setInputFiles({
    name: "preview.png",
    mimeType: "image/png",
    buffer: await readFile(
      new URL(
        "../../../../packages/db/fixtures/files/preview.png",
        import.meta.url
      )
    ),
  })
  await expect(
    harness.agentShell.getByLabel("Images ready to send")
  ).toBeVisible({ timeout: 30_000 })

  await sendMessage(
    page,
    harness.agentShell,
    [
      `Compare this image with current public Cloudflare dashboard accessibility guidance, cite the official source, then prepare a high-priority Issue titled "${issueTitle}" and attach this image.`,
      "Public-only Web query: official Cloudflare dashboard accessibility guidance",
    ].join("\n")
  )
  await expect(
    harness.agentShell.getByText(/web search · completed/u).last()
  ).toBeVisible({ timeout: 120_000 })
  await expect(
    harness.agentShell.getByText("Approve Issue change?").last()
  ).toBeVisible({ timeout: 120_000 })
  await expect(harness.agentShell).toContainText("preview.png")

  const issueBeforeApproval = await context.request.get(
    `${harness.apiOrigin}/issues`,
    {
      params: {
        organizationId: harness.organizationId,
        search: issueTitle,
      },
    }
  )
  expect(await issueBeforeApproval.text()).not.toContain(issueTitle)

  await harness.agentShell.getByRole("button", { name: "Yes" }).last().click()
  let createdIssueId = ""
  await expect
    .poll(
      async () => {
        const response = await context.request.get(
          `${harness.apiOrigin}/issues`,
          {
            params: {
              organizationId: harness.organizationId,
              search: issueTitle,
            },
          }
        )
        if (!response.ok()) return false
        const value: unknown = await response.json()
        if (!isRecord(value) || !Array.isArray(value.items)) return false
        const issue = value.items.find(
          (candidate) => isRecord(candidate) && candidate.title === issueTitle
        )
        if (!isRecord(issue) || typeof issue.id !== "string") return false
        createdIssueId = issue.id
        return true
      },
      { timeout: 60_000 }
    )
    .toBe(true)

  const filesResponse = await context.request.get(
    `${harness.apiOrigin}/files/organizations/${harness.organizationId}/owners/issue/${createdIssueId}`
  )
  expect(filesResponse.status()).toBe(200)
  expect(JSON.stringify(await filesResponse.json())).toContain("preview.png")

  const threadId = new URL(page.url()).searchParams.get("agentThread")
  expect(threadId).toBeTruthy()
  const historyResponse = await context.request.get(
    `${harness.apiOrigin}/agent/threads/${encodeURIComponent(threadId ?? "")}/messages`
  )
  expect(historyResponse.status()).toBe(200)
  const serializedHistory = JSON.stringify(await historyResponse.json())
  expect(serializedHistory).toContain("data-agent-assets")
  expect(serializedHistory).toContain("attachmentAssetIds")
  expect(serializedHistory).not.toContain("data:image")
  expect(serializedHistory).not.toContain('"objectKey"')
})

test("agent-canary-existing-issue-image-followup @diagnostic-qwen", async ({
  context,
  page,
}) => {
  const harness = await openCanaryHarness(page, context.request)
  const issueTitle = `Existing image target ${harness.runSuffix}`
  const issue = await createSeedIssue(context.request, {
    apiOrigin: harness.apiOrigin,
    organizationId: harness.organizationId,
    origin: new URL(page.url()).origin,
    title: issueTitle,
  })
  const image = {
    name: "followup.png",
    mimeType: "image/png",
    buffer: await readFile(
      new URL(
        "../../../../packages/db/fixtures/files/preview.png",
        import.meta.url
      )
    ),
  }
  const stageImage = async () => {
    await harness.agentShell.getByLabel("Attach images").setInputFiles(image)
    await expect(
      harness.agentShell.getByLabel("Images ready to send")
    ).toBeVisible({ timeout: 30_000 })
  }

  await stageImage()
  await sendMessage(
    page,
    harness.agentShell,
    "Describe this image in one sentence. Do not create or update an Issue."
  )
  const threadId = new URL(page.url()).searchParams.get("agentThread")
  expect(threadId).toBeTruthy()

  await sendMessage(
    page,
    harness.agentShell,
    `Attach the image from my previous message to Issue #${issue.number} titled "${issueTitle}". Call get_issue with the Issue number, then call add_issue_attachments in the same response using the server-authorized reusable asset ID and the returned exact Issue id and revision. Do not stop after the read.`
  )
  await expect(
    harness.agentShell
      .getByText(/(?:get issue|search issues) · completed/u)
      .last()
  ).toBeVisible({ timeout: 120_000 })
  await expect(
    harness.agentShell.getByText("Approve Issue change?").last()
  ).toBeVisible({ timeout: 120_000 })
  await expect(harness.agentShell).toContainText("followup.png")
  await harness.agentShell.getByRole("button", { name: "Yes" }).last().click()

  await expect
    .poll(
      async () => {
        const response = await context.request.get(
          `${harness.apiOrigin}/files/organizations/${harness.organizationId}/owners/issue/${issue.id}`
        )
        return response.ok() ? await response.text() : ""
      },
      { timeout: 60_000 }
    )
    .toContain("followup.png")

  await expect
    .poll(
      () =>
        readPersistedToolStates(
          context.request,
          harness.apiOrigin,
          threadId ?? ""
        ),
      { timeout: 30_000 }
    )
    .toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^(?:get_issue|search_issues):output-available$/u
        ),
        expect.stringMatching(
          /^add_issue_attachments:(?:approval-requested|output-available)$/u
        ),
      ])
    )

  const historyResponse = await context.request.get(
    `${harness.apiOrigin}/agent/threads/${encodeURIComponent(threadId ?? "")}/messages`
  )
  expect(historyResponse.status()).toBe(200)
  const serializedHistory = JSON.stringify(await historyResponse.json())
  expect(serializedHistory).toContain("data-agent-assets")
  expect(serializedHistory).toContain("tool-add_issue_attachments")
  expect(serializedHistory).not.toContain("Structured content unavailable")
  expect(serializedHistory).not.toContain("Tool state unavailable")
  expect(serializedHistory).not.toContain("data:image")
  expect(serializedHistory).not.toContain('"objectKey"')
})
