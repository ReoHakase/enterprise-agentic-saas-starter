import { http, HttpResponse } from "msw"
import { useCallback, useRef, useState } from "react"
import { expect, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"

import { fictionalFiles, fictionalImageFile } from "../../test-support/fixtures"
import { FilePreviewDialog } from "./file-preview-dialog"

const PreviewExample = () => {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [selectedFileId, setSelectedFileId] = useState<string | null>(
    fictionalImageFile.id
  )
  const closePreview = useCallback(() => setSelectedFileId(null), [])

  return (
    <>
      <button ref={triggerRef} type="button">
        Reopen file preview
      </button>
      <FilePreviewDialog
        organizationId="org_01K1ACMECLOUD0000000000"
        files={fictionalFiles}
        selectedFileId={selectedFileId}
        finalFocusRef={triggerRef}
        onSelectFile={setSelectedFileId}
        onClose={closePreview}
      />
    </>
  )
}

const meta = preview.meta({
  title: "Web/Files/File Preview Dialog",
  component: PreviewExample,
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
  play: async ({ canvas, step }) => {
    const body = within(document.body)

    await step("Move between files with the keyboard", async () => {
      await expect(
        body.getByRole("dialog", { name: "tenant-architecture.png" })
      ).toBeInTheDocument()
      await userEvent.keyboard("{ArrowRight}")
      await expect(
        body.getByRole("dialog", { name: "incident-runbook.txt" })
      ).toBeInTheDocument()
    })

    await step("Close and restore focus", async () => {
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
