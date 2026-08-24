import { http, HttpResponse } from "msw"
import { expect, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"

import { FilePreviewDialogStoryFixture } from "./test-support/file-preview-dialog-story-fixture"

const meta = preview.meta({
  title: "Web/Files/File Preview Dialog",
  component: FilePreviewDialogStoryFixture,
  tags: ["autodocs"],
})

export const ImageAndText = meta.story({
  tags: ["theme-sensitive"],
  beforeEach({ msw }) {
    msw.use(
      http.get(
        "*/files/organizations/:organizationId/:fileId/text-preview",
        () =>
          HttpResponse.json({
            content:
              "# Incident runbook\n\nRetry the webhook with the original idempotency key.",
            truncated: false,
          })
      )
    )
  },
  play: async ({ canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body)

    await step("キーボードでファイル間を移動する", async () => {
      await expect(
        body.getByRole("dialog", { name: "tenant-architecture.png" })
      ).toBeInTheDocument()
      await userEvent.keyboard("{ArrowRight}")
      await expect(
        body.getByRole("dialog", { name: "incident-runbook.txt" })
      ).toBeInTheDocument()
    })
  },
})

export const ViewportGeometry = meta.story({})

export const CloseFocusReturn = meta.story({
  play: async ({ canvas, canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body)
    await step("閉じてフォーカスを復元する", async () => {
      await userEvent.keyboard("{Escape}")
      await waitFor(() =>
        expect(
          canvas.getByRole("button", { name: "Reopen file preview" })
        ).toHaveFocus()
      )
      await waitFor(() =>
        expect(body.queryByRole("dialog")).not.toBeInTheDocument()
      )
    })
  },
})
