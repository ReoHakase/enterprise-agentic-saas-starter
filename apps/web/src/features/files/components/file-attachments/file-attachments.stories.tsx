import { http, HttpResponse } from "msw"
import type { ComponentProps } from "react"
import { expect, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"

import { fictionalFiles } from "../../test-support/fixtures"
import { FileAttachments } from "./file-attachments"

const listUrl = "*/files/organizations/:organizationId/owners/issue/:issueId"
const fileAttachmentArgs = {
  organizationId: "org_01K1ACMECLOUD0000000000",
  ownerType: "issue",
  ownerId: "issue_01K1BILLING00000000000",
} satisfies ComponentProps<typeof FileAttachments>

const readyHandlers = () => [
  http.get(listUrl, () =>
    HttpResponse.json({ items: fictionalFiles, nextCursor: null })
  ),
  http.get("*/issues/:issueId/thumbnail", () =>
    HttpResponse.json({ mode: "automatic", file: null })
  ),
]

const meta = preview.meta({
  title: "Web/Files/File Attachments",
  component: FileAttachments,
  tags: ["autodocs"],
  args: fileAttachmentArgs,
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
  beforeEach({ msw }) {
    msw.use(...readyHandlers())
  },
})

export const DeleteCancellation = meta.story({
  beforeEach({ msw }) {
    msw.use(...readyHandlers())
  },
  play: async ({ canvas, canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body)
    await step("破壊的な削除をキャンセルする", async () => {
      const deleteTrigger = await canvas.findByRole("button", {
        name: "Delete tenant-architecture.png",
      })
      await userEvent.click(deleteTrigger)
      const deleteDialog = body.getByRole("alertdialog", {
        name: "Delete this file?",
      })
      await expect(deleteDialog).toBeInTheDocument()
      await userEvent.click(
        within(deleteDialog).getByRole("button", { name: "Cancel" })
      )
      await waitFor(() => expect(deleteTrigger).toHaveFocus())
      await waitFor(() => expect(deleteDialog).not.toBeVisible())
    })
  },
})

export const Empty = meta.story({})

export const RetrySuccess = meta.story({
  beforeEach({ msw }) {
    let attempt = 0
    msw.use(
      http.get(listUrl, () => {
        attempt += 1
        return attempt === 1
          ? HttpResponse.json(
              {
                error: "internal_error",
                message: "The request could not be completed.",
              },
              { status: 500 }
            )
          : HttpResponse.json({ items: fictionalFiles, nextCursor: null })
      })
    )
  },
  play: async ({ canvas, step }) => {
    await step("失敗した添付ファイル リストを再試行する", async () => {
      await expect(
        await canvas.findByText("Attachments could not be loaded.")
      ).toBeVisible()
      await userEvent.click(canvas.getByRole("button", { name: "Try again" }))
      await expect(
        await canvas.findByText("tenant-architecture.png")
      ).toBeVisible()
    })
  },
})
