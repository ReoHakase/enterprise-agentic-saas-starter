import type { APIRequestContext } from "@playwright/test"

import { expect } from "../fixtures/test"
import { isRecord, recordArray } from "./scripted-agent-fixture"

export const readIssueFiles = async (
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

export const assertCanonicalMessages = (
  page: unknown,
  expectedAssetId: string
): {
  actionId: string
  addActionId: string
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
  const serializedMessages = JSON.stringify(messages)
  expect(serializedMessages).not.toContain("Structured content unavailable")
  expect(serializedMessages).not.toContain("Tool state unavailable")
  const userParts = messages
    .filter((message) => Reflect.get(message, "role") === "user")
    .flatMap((message) => recordArray(message, "parts"))
  expect(userParts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "data-agent-assets",
        data: expect.objectContaining({
          assetIds: expect.arrayContaining([expectedAssetId]),
        }),
      }),
    ])
  )
  const parts = messages
    .filter((message) => Reflect.get(message, "role") === "assistant")
    .flatMap((message) => recordArray(message, "parts"))
  expect(parts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "tool-create_issue",
        state: "output-available",
        output: expect.objectContaining({
          requiresApproval: true,
          status: "pending",
        }),
      }),
      expect.objectContaining({ type: "text", text: "SCRIPTED_AGENT_OK" }),
    ])
  )
  const toolPart = parts.find(
    (part) => Reflect.get(part, "type") === "tool-create_issue"
  )
  const output = toolPart && Reflect.get(toolPart, "output")
  const actionId = isRecord(output) && Reflect.get(output, "actionId")
  if (typeof actionId !== "string") {
    throw new Error("Scripted Agent canonical pending action is invalid")
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
  const addPart = parts.find(
    (part) => Reflect.get(part, "type") === "tool-add_issue_attachments"
  )
  const addInput = addPart && Reflect.get(addPart, "input")
  const addOutput = addPart && Reflect.get(addPart, "output")
  const addActionId = isRecord(addOutput)
    ? Reflect.get(addOutput, "actionId")
    : undefined
  if (
    !isRecord(addInput) ||
    !isRecord(addOutput) ||
    typeof addActionId !== "string"
  ) {
    throw new Error(
      "Scripted Agent tool-add_issue_attachments approval is invalid"
    )
  }
  expect(addInput).toMatchObject({ assetIds: [expectedAssetId] })
  expect(addOutput).toMatchObject({
    actionId: addActionId,
    requiresApproval: true,
    status: "pending",
    preview: {
      attachmentOperation: "add",
      attachments: [
        {
          assetId: expectedAssetId,
          filename: "oldest-e1.png",
          source: "asset",
        },
      ],
      issueNumber: 1,
      kind: "update_issue",
    },
  })
  const removed = readAttachmentReceipt("tool-remove_issue_attachments")
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
    issueId: removed.issueId,
    sizeBytes: expect.any(Number),
  })
  return {
    actionId,
    addActionId,
    issueId: removed.issueId,
    readFileId: imageReadOutput.fileId,
    removedActionId: removed.actionId,
    removedFileId: removed.fileId,
    removedRevision: removed.revision,
  }
}
