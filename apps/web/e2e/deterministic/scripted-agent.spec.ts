import { readFile } from "node:fs/promises"

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

const assertCanonicalMessages = (
  page: unknown
): {
  actionId: string
  addedFileId: string
  addedRevision: number
  issueId: string
  readFileId: string
  removedActionId: string
  removedFileId: string
  removedRevision: number
} => {
  if (!isRecord(page)) {
    throw new Error("Scripted Agent E2E message page is invalid")
  }
  const messages = recordArray(page, "messages")
  expect(page).toMatchObject({
    hasMore: false,
    page: 0,
    perPage: 40,
    total: messages.length,
  })
  const parts = messages
    .filter((message) => Reflect.get(message, "role") === "assistant")
    .flatMap((message) => recordArray(message, "parts"))
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
  const readAttachmentReceipt = (toolType: string) => {
    const receiptPart = parts.find(
      (part) => Reflect.get(part, "type") === toolType
    )
    const receipt = receiptPart && Reflect.get(receiptPart, "output")
    if (!isRecord(receipt)) {
      throw new Error(`Scripted Agent ${toolType} receipt is missing`)
    }
    const receiptActionId = Reflect.get(receipt, "actionId")
    const receiptIssueId = Reflect.get(receipt, "issueId")
    const revision = Reflect.get(receipt, "revision")
    const fileIds = Reflect.get(receipt, "fileIds")
    if (
      typeof receiptActionId !== "string" ||
      typeof receiptIssueId !== "string" ||
      typeof revision !== "number" ||
      !Array.isArray(fileIds) ||
      fileIds.length !== 1 ||
      typeof fileIds[0] !== "string"
    ) {
      throw new Error(`Scripted Agent ${toolType} receipt is invalid`)
    }
    return {
      actionId: receiptActionId,
      fileId: fileIds[0],
      issueId: receiptIssueId,
      revision,
    }
  }
  const added = readAttachmentReceipt("tool-add_issue_attachments")
  const removed = readAttachmentReceipt("tool-remove_issue_attachments")
  const source = parts.find(
    (part) => Reflect.get(part, "type") === "source-url"
  )
  expect(source).toMatchObject({
    title: "Cloudflare Workers compatibility flags",
    url: "https://developers.cloudflare.com/workers/configuration/compatibility-flags/",
  })
  const webSearch = parts.find(
    (part) => Reflect.get(part, "type") === "tool-web_search"
  )
  const webSearchOutput = webSearch && Reflect.get(webSearch, "output")
  expect(webSearchOutput).toMatchObject({
    sources: [
      {
        title: "Cloudflare Workers compatibility flags",
        url: "https://developers.cloudflare.com/workers/configuration/compatibility-flags/",
      },
    ],
    trust: "untrusted_public_web_content",
  })
  const imageRead = parts.find(
    (part) => Reflect.get(part, "type") === "tool-read_issue_attachment_image"
  )
  const imageReadOutput = imageRead && Reflect.get(imageRead, "output")
  if (
    !isRecord(imageReadOutput) ||
    typeof imageReadOutput.fileId !== "string"
  ) {
    throw new Error("Scripted Agent image read metadata is invalid")
  }
  expect(imageReadOutput).toMatchObject({
    contentType: "image/webp",
    issueId,
    sizeBytes: expect.any(Number),
  })
  expect(added.issueId).toBe(issueId)
  expect(removed.issueId).toBe(issueId)
  return {
    actionId,
    addedFileId: added.fileId,
    addedRevision: added.revision,
    issueId,
    readFileId: imageReadOutput.fileId,
    removedActionId: removed.actionId,
    removedFileId: removed.fileId,
    removedRevision: removed.revision,
  }
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
      inputTokenCount: 87,
      outputTokenCount: 26,
      reasoningTokenCount: 0,
      runCount: 8,
      totalTokenCount: 113,
    })
}

const readIssueFiles = async (
  request: APIRequestContext,
  input: {
    apiOrigin: string
    cookie: string
    issueId: string
    organizationId: string
    origin: string
  }
): Promise<Record<string, unknown>[]> => {
  const response = await request.get(
    `${input.apiOrigin}/files/organizations/${input.organizationId}/owners/issue/${input.issueId}`,
    { headers: { cookie: input.cookie, origin: input.origin } }
  )
  expect(response.status()).toBe(200)
  const page: unknown = await response.json()
  if (!isRecord(page)) {
    throw new Error("Scripted Agent Issue file page is invalid")
  }
  return recordArray(page, "items")
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
  const organizationId = organization.id

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

  await composer.fill("[E1:STOP] Stream a partial response until I stop it.")
  await agentShell.getByRole("button", { name: "Send", exact: true }).click()
  await expect(agentShell.getByText("E1_PARTIAL_SESSION_ONLY")).toBeVisible()
  const cancelResponsePromise = page.waitForResponse(
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
  const canceledRunId = cancelResult.runId
  await expect(agentShell.getByText("Turn stopped.")).toBeVisible()
  await expect(
    agentShell.getByRole("button", { name: "Send", exact: true })
  ).toBeEnabled()

  const threadId = new URL(page.url()).searchParams.get("agentThread")
  expect(threadId).toBeTruthy()
  if (!threadId) return
  await expect
    .poll(async () => {
      const stoppedHistoryResponse = await context.request.get(
        `${apiOrigin}/agent/threads/${threadId}/messages`,
        { headers: { cookie: cookieHeader, origin } }
      )
      if (!stoppedHistoryResponse.ok()) return null
      const stoppedHistory: unknown = await stoppedHistoryResponse.json()
      if (!isRecord(stoppedHistory)) return null
      const stoppedMessages = recordArray(stoppedHistory, "messages")
      return {
        roles: stoppedMessages.map((message) => Reflect.get(message, "role")),
        serialized: JSON.stringify(stoppedMessages),
      }
    })
    .toEqual({
      roles: ["user"],
      serialized: expect.not.stringMatching(
        /E1_PARTIAL_SESSION_ONLY|data-run/u
      ),
    })

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
  await expect(agentShell.getByText(/create issue · completed/u)).toBeVisible()
  await expect(agentShell.getByText("SCRIPTED_AGENT_OK")).toBeVisible()
  await expect(
    agentShell.getByRole("button", { name: "Send", exact: true })
  ).toBeEnabled()
  const replayCancel = await context.request.post(
    `${apiOrigin}/agent/threads/${threadId}/runs/${canceledRunId}/cancel`,
    { headers: { cookie: cookieHeader, origin } }
  )
  expect(replayCancel.status()).toBe(200)
  expect(await replayCancel.json()).toEqual({
    runId: canceledRunId,
    status: "canceled",
  })

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
    organizationId: organization.id,
    origin,
  })
  const issueId = Reflect.get(createdIssue, "id")
  const issueRevisionBeforeAttachmentAdd = Reflect.get(createdIssue, "revision")
  if (typeof issueId !== "string") {
    throw new Error("Scripted Agent persisted issue id is missing")
  }
  if (typeof issueRevisionBeforeAttachmentAdd !== "number") {
    throw new Error("Scripted Agent persisted Issue revision is missing")
  }

  await composer.fill(
    [
      "[E1:WEB_SEARCH]",
      "Public-only Web query: official Cloudflare Workers request signal flags",
    ].join("\n")
  )
  await agentShell.getByRole("button", { name: "Send", exact: true }).click()
  await expect(
    agentShell.getByText(/web search · completed/u).last()
  ).toBeVisible()
  await expect(
    agentShell.getByRole("link", {
      name: "Cloudflare Workers compatibility flags",
    })
  ).toHaveAttribute(
    "href",
    "https://developers.cloudflare.com/workers/configuration/compatibility-flags/"
  )
  await expect(agentShell.getByText(/E1_SEARCH_OK/u)).toBeVisible()

  const assetUploadPromise = page.waitForResponse(
    (uploadResponse) =>
      /\/files\/organizations\/[^/]+\/agent-threads\/[^/]+\/assets$/u.test(
        new URL(uploadResponse.url()).pathname
      ) && uploadResponse.request().method() === "POST"
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
  const assetUploadResponse = await assetUploadPromise
  expect(assetUploadResponse.status()).toBe(201)
  const uploadedAsset: unknown = await assetUploadResponse.json()
  if (!isRecord(uploadedAsset) || typeof uploadedAsset.id !== "string") {
    throw new Error("Scripted Agent staged asset id is missing")
  }
  const uploadedAssetId = uploadedAsset.id
  await expect(agentShell.getByLabel("Images ready to send")).toBeVisible()
  await composer.fill(
    "[E1:ATTACHMENT_ADD] Add the attached image to Issue number 1."
  )
  await agentShell.getByRole("button", { name: "Send", exact: true }).click()
  await expect(
    agentShell.getByText(/add issue attachments · completed/u).last()
  ).toBeVisible()
  await expect(agentShell.getByText("E1_ATTACHMENT_ADD_OK")).toBeVisible()
  const addChatBody = submittedChatBodies.find((body) =>
    JSON.stringify(body).includes("[E1:ATTACHMENT_ADD]")
  )
  expect(addChatBody).toMatchObject({ assetIds: [uploadedAssetId] })

  await expect
    .poll(
      async () =>
        readIssueFiles(context.request, {
          apiOrigin,
          cookie: cookieHeader,
          issueId,
          organizationId,
          origin,
        }),
      { timeout: 30_000 }
    )
    .toHaveLength(1)
  const issueFilesAfterAdd = await readIssueFiles(context.request, {
    apiOrigin,
    cookie: cookieHeader,
    issueId,
    organizationId,
    origin,
  })
  const addedFile = issueFilesAfterAdd[0]
  const addedFileId = addedFile && Reflect.get(addedFile, "id")
  if (typeof addedFileId !== "string") {
    throw new Error("Scripted Agent promoted file id is missing")
  }
  expect(addedFile).toMatchObject({ filename: "preview.png" })
  const issueAfterAdd = await readCreatedIssue(context.request, {
    apiOrigin,
    cookie: cookieHeader,
    organizationId,
    origin,
  })
  const issueRevisionAfterAdd = Reflect.get(issueAfterAdd, "revision")
  if (typeof issueRevisionAfterAdd !== "number") {
    throw new Error("Scripted Agent add receipt revision is missing")
  }
  expect(issueRevisionAfterAdd).toBe(issueRevisionBeforeAttachmentAdd + 1)
  await expect(
    agentShell.getByText(
      `Added 1 attachment on Issue #1 at revision ${issueRevisionAfterAdd}.`
    )
  ).toBeVisible()

  await composer.fill(
    "[E1:ATTACHMENT_READ] Read the image attached to Issue number 1."
  )
  await agentShell.getByRole("button", { name: "Send", exact: true }).click()
  await expect(
    agentShell.getByText(/get issue · completed/u).last()
  ).toBeVisible()
  await expect(
    agentShell.getByText(/read issue attachment image · completed/u).last()
  ).toBeVisible()
  await expect(
    agentShell.getByText("E1_ATTACHMENT_READ_OK blue gradient")
  ).toBeVisible()

  await composer.fill(
    "[E1:ATTACHMENT_REMOVE] Remove the image attached to Issue number 1."
  )
  await agentShell.getByRole("button", { name: "Send", exact: true }).click()
  await expect(
    agentShell.getByText(/remove issue attachments · completed/u).last()
  ).toBeVisible()
  await expect(agentShell.getByText("E1_ATTACHMENT_REMOVE_OK")).toBeVisible()
  await expect
    .poll(
      async () =>
        readIssueFiles(context.request, {
          apiOrigin,
          cookie: cookieHeader,
          issueId,
          organizationId,
          origin,
        }),
      { timeout: 30_000 }
    )
    .toHaveLength(0)
  const issueAfterRemove = await readCreatedIssue(context.request, {
    apiOrigin,
    cookie: cookieHeader,
    organizationId,
    origin,
  })
  const issueRevisionAfterRemove = Reflect.get(issueAfterRemove, "revision")
  if (typeof issueRevisionAfterRemove !== "number") {
    throw new Error("Scripted Agent remove receipt revision is missing")
  }
  expect(issueRevisionAfterRemove).toBe(issueRevisionAfterAdd + 1)
  await expect(
    agentShell.getByText(
      `Removed 1 attachment on Issue #1 at revision ${issueRevisionAfterRemove}.`
    )
  ).toBeVisible()

  await expect.poll(() => submittedMessageIds.length).toBe(8)
  expect(new Set(submittedMessageIds).size).toBe(8)

  const messagesResponse = await context.request.get(
    `${apiOrigin}/agent/threads/${threadId}/messages`,
    { headers: { cookie: cookieHeader, origin } }
  )
  expect(messagesResponse.status()).toBe(200)
  const canonicalReceipt = assertCanonicalMessages(
    await messagesResponse.json()
  )

  expect(issueId).toBe(canonicalReceipt.issueId)
  expect(canonicalReceipt.addedFileId).toBe(addedFileId)
  expect(canonicalReceipt.addedRevision).toBe(issueRevisionAfterAdd)
  expect(canonicalReceipt.removedActionId).not.toBe("")
  expect(canonicalReceipt.removedFileId).toBe(addedFileId)
  expect(canonicalReceipt.readFileId).toBe(addedFileId)
  expect(canonicalReceipt.removedRevision).toBe(issueRevisionAfterRemove)
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
  const reloadedAgentShell = page.getByRole("complementary", { name: "Agent" })
  await expect(reloadedAgentShell.getByText("SCRIPTED_AGENT_OK")).toBeVisible()
  await expect(
    reloadedAgentShell.getByText("E1_ATTACHMENT_REMOVE_OK")
  ).toBeVisible()
  await expect(
    reloadedAgentShell.getByText(/web search · completed/u).last()
  ).toBeVisible()
  await expect(
    reloadedAgentShell.getByRole("link", {
      name: "Cloudflare Workers compatibility flags",
    })
  ).toHaveAttribute(
    "href",
    "https://developers.cloudflare.com/workers/configuration/compatibility-flags/"
  )
  await expect(
    reloadedAgentShell.getByText(/add issue attachments · completed/u).last()
  ).toBeVisible()
  await expect(
    reloadedAgentShell.getByText(/remove issue attachments · completed/u).last()
  ).toBeVisible()
  await expect(
    reloadedAgentShell
      .getByText(/read issue attachment image · completed/u)
      .last()
  ).toBeVisible()
  const visibleReloadedConversation = await reloadedAgentShell.textContent()
  expect(visibleReloadedConversation).not.toContain("data:image")
  expect(visibleReloadedConversation).not.toContain("objectKey")
  expect(visibleReloadedConversation).not.toContain(uploadedAssetId)
  expect(visibleReloadedConversation).not.toContain(addedFileId)

  const persistedHistoryResponse = await context.request.get(
    `${apiOrigin}/agent/threads/${threadId}/messages`,
    { headers: { cookie: cookieHeader, origin } }
  )
  expect(persistedHistoryResponse.status()).toBe(200)
  const serializedHistory = JSON.stringify(
    await persistedHistoryResponse.json()
  )
  expect(serializedHistory).not.toContain("data:image")
  expect(serializedHistory).not.toContain('"objectKey"')
  expect(serializedHistory).not.toContain('"previewUrl"')
  expect(serializedHistory).not.toContain("/agent-assets/")

  await reloadedAgentShell.getByRole("button", { name: /^Archive /u }).click()
  await page.getByRole("button", { name: "Archive and discard" }).click()
  await expect
    .poll(() => new URL(page.url()).searchParams.get("agentThread"))
    .toBeNull()
  await expect
    .poll(async () => {
      const archivedHistory = await context.request.get(
        `${apiOrigin}/agent/threads/${threadId}/messages`,
        { headers: { cookie: cookieHeader, origin } }
      )
      if (archivedHistory.status() !== 404) return null
      const body: unknown = await archivedHistory.json()
      return isRecord(body) ? body : null
    })
    .toMatchObject({ error: { code: "not_found" } })
  const activeThreadsResponse = await context.request.get(
    `${apiOrigin}/agent/threads`,
    { headers: { cookie: cookieHeader, origin } }
  )
  expect(activeThreadsResponse.status()).toBe(200)
  const activeThreads: unknown = await activeThreadsResponse.json()
  if (!Array.isArray(activeThreads) || !activeThreads.every(isRecord)) {
    throw new Error("Scripted Agent active thread list is invalid")
  }
  expect(
    activeThreads.some((thread) => Reflect.get(thread, "id") === threadId)
  ).toBe(false)
})
