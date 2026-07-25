import type { FileDto } from "@enterprise-agentic-saas/api/client"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { useRef } from "react"
import { fn } from "storybook/test"

import { AuthenticatedFileImage } from "../authenticated-file-image/authenticated-file-image"
import { FileAttachments } from "../file-attachments/file-attachments"
import { FilePreviewDialog } from "../file-preview-dialog/file-preview-dialog"

const imageFile: FileDto = {
  id: "file-image",
  owner: { type: "issue", id: "issue-1" },
  filename: "architecture.png",
  sizeBytes: 12_345,
  declaredContentType: "image/png",
  previewable: true,
  textPreviewable: false,
  imageWidth: 640,
  imageHeight: 480,
  uploader: { id: "user-1", name: "Avery Stone", profileImage: null },
  createdAt: "2026-07-24T09:30:00.000Z",
  canDelete: true,
}
const imageFiles: FileDto[] = [imageFile]
const noop = fn()

const PreviewCatalogue = () => {
  const finalFocusRef = useRef<HTMLButtonElement>(null)

  return (
    <div className="grid gap-5">
      <button ref={finalFocusRef} type="button">
        Preview trigger
      </button>
      <AuthenticatedFileImage
        file={imageFile}
        organizationId="org-1"
        sizes="(max-width: 640px) 100vw, 640px"
        className="max-h-80 max-w-xl rounded-xl border object-contain"
      />
      <FilePreviewDialog
        organizationId="org-1"
        files={imageFiles}
        selectedFileId={imageFile.id}
        finalFocusRef={finalFocusRef}
        onSelectFile={noop}
        onClose={noop}
      />
    </div>
  )
}

const AttachmentsCatalogue = () => (
  <div className="mx-auto max-w-3xl">
    <FileAttachments
      organizationId="org-1"
      ownerType="issue"
      ownerId="issue-1"
    />
  </div>
)

const meta = {
  title: "Web/Files/Component Catalogue",
  component: AttachmentsCatalogue,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AttachmentsCatalogue>

export default meta
type Story = StoryObj<typeof meta>

export const AttachmentsLoading: Story = {
  render: () => <AttachmentsCatalogue />,
}

export const AuthenticatedImagePreview: Story = {
  render: () => <PreviewCatalogue />,
}
