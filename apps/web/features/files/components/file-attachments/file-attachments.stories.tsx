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

const meta = preview.meta({
  title: "Web/Files/File Attachments",
  component: FileAttachments,
  tags: ["autodocs"],
  args: fileAttachmentArgs,
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
  beforeEach({ msw }) {
    msw.use(
      http.get(listUrl, () =>
        HttpResponse.json({ items: fictionalFiles, nextCursor: null })
      ),
      http.get("*/issues/:issueId/thumbnail", () =>
        HttpResponse.json({ mode: "automatic", file: null })
      )
    )
  },
  play: async ({ canvas, canvasElement, step }) => {
    const ownerBody = canvasElement.ownerDocument.body
    const body = within(ownerBody)

    await step("Preview an image and restore focus", async () => {
      const trigger = await canvas.findByRole("button", {
        name: "Preview image tenant-architecture.png",
      })
      await userEvent.click(trigger)
      const previewDialog = body.getByRole("dialog", {
        name: "tenant-architecture.png",
      })
      await expect(previewDialog).toBeInTheDocument()
      await userEvent.keyboard("{Escape}")
      await waitFor(() => expect(trigger).toHaveFocus())
      await waitFor(
        () => expect(previewDialog).toHaveAttribute("data-closed"),
        { timeout: 3_000 }
      )
      await waitFor(
        () =>
          expect(
            ownerBody.querySelector("[data-base-ui-focus-guard]")
          ).not.toBeInTheDocument(),
        { timeout: 5_000 }
      )
    })

    await step("Cancel a destructive deletion", async () => {
      await userEvent.click(
        canvas.getByRole("button", {
          name: "Delete tenant-architecture.png",
        })
      )
      const deleteDialog = body.getByRole("alertdialog", {
        name: "Delete this file?",
      })
      await expect(deleteDialog).toBeInTheDocument()
      await userEvent.keyboard("{Escape}")
      await waitFor(() => expect(deleteDialog).toHaveAttribute("data-closed"), {
        timeout: 3_000,
      })
      await waitFor(
        () =>
          expect(
            ownerBody.querySelector("[data-base-ui-focus-guard]")
          ).not.toBeInTheDocument(),
        { timeout: 5_000 }
      )
    })
  },
})

export const Empty = meta.story({
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No files attached yet.")
    ).toBeVisible()
  },
})

export const RetrySuccess = meta.story({
  beforeEach({ msw }) {
    let attempt = 0
    msw.use(
      http.get(listUrl, () => {
        attempt += 1
        return attempt === 1
          ? HttpResponse.json(
              { message: "Attachment list failed." },
              { status: 500 }
            )
          : HttpResponse.json({ items: fictionalFiles, nextCursor: null })
      })
    )
  },
  play: async ({ canvas, step }) => {
    await step("Retry a failed attachment list", async () => {
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
