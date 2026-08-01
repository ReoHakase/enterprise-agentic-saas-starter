import type { Buffer } from "node:buffer"
import { readFile } from "node:fs/promises"

import type { Locator, Page, TestInfo } from "@playwright/test"

import { expect } from "../fixtures/test"
import {
  assertCanonicalMessages,
  readIssueFiles,
} from "./scripted-agent-attachment-support"
import {
  assertAuditPersistence,
  assertUsagePersistence,
  createScriptedIssue,
  isRecord,
  readCreatedIssue,
  setupScriptedAgentScenario,
  type ScriptedAgentTestFixtures,
} from "./scripted-agent-fixture"

const createAgentImageUploader =
  (page: Page, imageInput: Locator, imageBuffer: Buffer) =>
  async (filename: string): Promise<string> => {
    await expect(imageInput).toBeEnabled()
    const uploadResponsePromise = page.waitForResponse(
      (response) =>
        /\/files\/organizations\/[^/]+\/agent-threads\/[^/]+\/assets$/u.test(
          new URL(response.url()).pathname
        ) && response.request().method() === "POST"
    )
    await imageInput.setInputFiles({
      name: filename,
      mimeType: "image/png",
      buffer: imageBuffer,
    })
    const uploadResponse = await uploadResponsePromise
    expect(uploadResponse.status()).toBe(201)
    const uploadedAsset: unknown = await uploadResponse.json()
    if (!isRecord(uploadedAsset) || typeof uploadedAsset.id !== "string") {
      throw new Error("Scripted Agent staged asset id is missing")
    }
    await expect(imageInput).toBeEnabled()
    return uploadedAsset.id
  }

const sendAndApproveNextAction = async (
  page: Page,
  agentShell: Locator,
  send: () => Promise<void>
): Promise<unknown> => {
  const approvalCount = await agentShell
    .getByText("Approve Issue change?")
    .count()
  const successCount = await agentShell
    .getByText("succeeded", { exact: true })
    .count()
  await send()
  await expect(agentShell.getByText("Approve Issue change?")).toHaveCount(
    approvalCount + 1
  )
  const resumeResponsePromise = page.waitForResponse(
    (response) =>
      /\/agent\/actions\/[^/]+\/resume$/u.test(
        new URL(response.url()).pathname
      ) && response.request().method() === "POST"
  )
  await agentShell.getByRole("button", { name: "Yes" }).last().click()
  const resumeResponse = await resumeResponsePromise
  expect(resumeResponse.status()).toBe(200)
  const result: unknown = await resumeResponse.json()
  await expect(agentShell.getByText("succeeded", { exact: true })).toHaveCount(
    successCount + 1
  )
  return result
}

export const runScriptedAgentAttachmentLifecycle = async (
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
    permission,
    submittedChatBodies,
    submittedMessageIds,
    threadId,
  } = runtime
  const createdIssue = await readCreatedIssue(context.request, {
    apiOrigin,
    cookie: cookieHeader,
    organizationId,
    origin,
  })
  const issueId = Reflect.get(createdIssue, "id")
  const issueRevisionBeforeAdd = Reflect.get(createdIssue, "revision")
  if (typeof issueId !== "string") {
    throw new Error("Scripted Agent persisted issue id is missing")
  }
  if (typeof issueRevisionBeforeAdd !== "number") {
    throw new Error("Scripted Agent persisted Issue revision is missing")
  }

  const imageInput = agentShell.getByLabel("Attach images")
  const imageBuffer = await readFile(
    new URL(
      "../../../../packages/db/fixtures/files/preview.png",
      import.meta.url
    )
  )
  const uploadImage = createAgentImageUploader(page, imageInput, imageBuffer)
  const firstBatchAssetIds: string[] = []
  for (const filename of [
    "oldest-e1.png",
    "filler-e1-1.png",
    "filler-e1-2.png",
    "filler-e1-3.png",
  ]) {
    // oxlint-disable-next-line no-await-in-loop -- staged browser uploads must finish in selection order.
    firstBatchAssetIds.push(await uploadImage(filename))
  }
  const uploadedAssetId = firstBatchAssetIds[0]
  if (!uploadedAssetId) {
    throw new Error("Scripted Agent oldest staged asset id is missing")
  }
  await expect(agentShell.getByLabel("Images ready to send")).toBeVisible()
  await composer.fill(
    "[E1:ATTACHMENT_DESCRIBE] Describe these four images without changing an Issue."
  )
  await agentShell.getByRole("button", { name: "Send", exact: true }).click()
  await expect(
    agentShell.getByText("E1_ATTACHMENT_DESCRIBE_OK blue gradient")
  ).toBeVisible()
  const describeChatBody = submittedChatBodies.find((body) =>
    JSON.stringify(body).includes("[E1:ATTACHMENT_DESCRIBE]")
  )
  expect(describeChatBody).toMatchObject({ assetIds: firstBatchAssetIds })

  const secondBatchAssetIds: string[] = []
  for (const filename of ["filler-e1-4.png", "newest-e1.png"]) {
    // oxlint-disable-next-line no-await-in-loop -- staged browser uploads must finish in selection order.
    secondBatchAssetIds.push(await uploadImage(filename))
  }
  await composer.fill(
    "[E1:ATTACHMENT_DESCRIBE_MORE] Describe these two more images without changing an Issue."
  )
  await agentShell.getByRole("button", { name: "Send", exact: true }).click()
  await expect(
    agentShell.getByText("E1_ATTACHMENT_DESCRIBE_MORE_OK blue gradient")
  ).toBeVisible()
  const describeMoreChatBody = submittedChatBodies.find((body) =>
    JSON.stringify(body).includes("[E1:ATTACHMENT_DESCRIBE_MORE]")
  )
  expect(describeMoreChatBody).toMatchObject({ assetIds: secondBatchAssetIds })
  expect(
    await readIssueFiles(context.request, {
      apiOrigin,
      cookie: cookieHeader,
      issueId,
      organizationId,
      origin,
    })
  ).toHaveLength(0)

  await permission.click()
  await page.getByRole("option", { name: /Ask always/u }).click()
  await expect(permission).toContainText("Ask always")
  const addResult = await sendAndApproveNextAction(
    page,
    agentShell,
    async () => {
      await composer.fill(
        "[E1:PAST_ATTACHMENT_REUSE] Add oldest-e1.png from the six earlier images to Issue number 1."
      )
      await agentShell
        .getByRole("button", { name: "Send", exact: true })
        .click()
    }
  )
  await expect(agentShell.getByText("E1_PAST_ATTACHMENT_ADD_OK")).toBeVisible()
  const pastAssetChatBody = submittedChatBodies.find((body) =>
    JSON.stringify(body).includes("[E1:PAST_ATTACHMENT_REUSE]")
  )
  expect(pastAssetChatBody).toMatchObject({ assetIds: [] })
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
  const [addedFile] = await readIssueFiles(context.request, {
    apiOrigin,
    cookie: cookieHeader,
    issueId,
    organizationId,
    origin,
  })
  const addedFileId = addedFile && Reflect.get(addedFile, "id")
  if (typeof addedFileId !== "string") {
    throw new Error("Scripted Agent promoted file id is missing")
  }
  expect(addedFile).toMatchObject({ filename: "oldest-e1.png" })
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
  expect(issueRevisionAfterAdd).toBe(issueRevisionBeforeAdd + 1)
  expect(addResult).toMatchObject({
    actionId: expect.any(String),
    kind: "update_issue",
    status: "succeeded",
    issue: {
      attachmentMutation: { fileIds: [addedFileId], operation: "added" },
      deleted: false,
      id: issueId,
      number: 1,
      revision: issueRevisionAfterAdd,
    },
  })
  await expect(
    agentShell.getByText(
      `Added 1 attachment at revision ${issueRevisionAfterAdd}.`
    )
  ).toBeVisible()

  await permission.click()
  await page.getByRole("option", { name: /Full access/u }).click()
  await expect(permission).toContainText("Full access")
  await composer.fill(
    "[E1:ATTACHMENT_READ] Read the image attached to Issue number 1."
  )
  await agentShell.getByRole("button", { name: "Send", exact: true }).click()
  await expect(
    agentShell.getByRole("status", { name: "Issue #1を確認" }).last()
  ).toBeVisible()
  await expect(
    agentShell.getByRole("status", { name: "添付画像を確認" }).last()
  ).toBeVisible()
  await expect(
    agentShell.getByText("E1_ATTACHMENT_READ_OK blue gradient")
  ).toBeVisible()
  await composer.fill(
    "[E1:ATTACHMENT_REMOVE] Remove the image attached to Issue number 1."
  )
  await agentShell.getByRole("button", { name: "Send", exact: true }).click()
  await expect(
    agentShell.getByRole("status", { name: "Issueの添付を削除" }).last()
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

  await expect.poll(() => submittedMessageIds.length).toBe(6)
  expect(new Set(submittedMessageIds).size).toBe(6)
  const messagesResponse = await context.request.get(
    `${apiOrigin}/agent/threads/${threadId}/messages`,
    { headers: { cookie: cookieHeader, origin } }
  )
  expect(messagesResponse.status()).toBe(200)
  const receipt = assertCanonicalMessages(
    await messagesResponse.json(),
    uploadedAssetId
  )
  expect(issueId).toBe(receipt.issueId)
  expect(addResult).toMatchObject({ actionId: receipt.addActionId })
  expect(receipt.removedActionId).not.toBe("")
  expect(receipt.removedFileId).toBe(addedFileId)
  expect(receipt.readFileId).toBe(addedFileId)
  expect(receipt.removedRevision).toBe(issueRevisionAfterRemove)
  await assertAuditPersistence(context.request, {
    actionId: receipt.actionId,
    apiOrigin,
    cookie: cookieHeader,
    issueId,
    organizationId,
    origin,
  })
  await assertUsagePersistence(context.request, {
    apiOrigin,
    cookie: cookieHeader,
    expectedRunCount: 6,
    origin,
  })

  await page.reload()
  await page.getByRole("button", { name: "Open Agent" }).click()
  const reloadedAgent = page.getByRole("complementary", { name: "Agent" })
  await expect(reloadedAgent.getByText("SCRIPTED_AGENT_OK")).toBeVisible()
  await expect(reloadedAgent.getByText("E1_ATTACHMENT_REMOVE_OK")).toBeVisible()
  await expect(
    reloadedAgent.getByText("E1_PAST_ATTACHMENT_ADD_OK")
  ).toBeVisible()
  await expect(
    reloadedAgent.getByRole("region", {
      name: "Issue attachments awaiting approval",
    })
  ).toBeVisible()
  await expect(
    reloadedAgent.getByText("oldest-e1.png", { exact: true })
  ).toBeVisible()
  await expect(
    reloadedAgent.getByText("succeeded", { exact: true })
  ).toHaveCount(2)
  await expect(
    reloadedAgent.getByRole("status", { name: "Issueの添付を削除" }).last()
  ).toBeVisible()
  await expect(
    reloadedAgent.getByRole("status", { name: "添付画像を確認" }).last()
  ).toBeVisible()
  const visibleConversation = await reloadedAgent.textContent()
  expect(visibleConversation).not.toContain("data:image")
  expect(visibleConversation).not.toContain("objectKey")
  expect(visibleConversation).not.toContain(uploadedAssetId)
  expect(visibleConversation).not.toContain(addedFileId)

  const persistedResponse = await context.request.get(
    `${apiOrigin}/agent/threads/${threadId}/messages`,
    { headers: { cookie: cookieHeader, origin } }
  )
  expect(persistedResponse.status()).toBe(200)
  const serializedHistory = JSON.stringify(await persistedResponse.json())
  expect(serializedHistory).not.toContain("data:image")
  expect(serializedHistory).not.toContain('"objectKey"')
  expect(serializedHistory).not.toContain('"previewUrl"')
  expect(serializedHistory).not.toContain("/agent-assets/")

  await reloadedAgent.getByRole("button", { name: /^Archive /u }).click()
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
    .toEqual({
      error: "not_found",
      message: "The requested resource was not found.",
    })
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
}
