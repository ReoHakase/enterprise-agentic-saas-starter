import type { FileDto, FileListDto } from "@enterprise-agentic-saas/api/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { PropsWithChildren } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listFiles: vi.fn<() => Promise<FileListDto>>(),
  deleteFile: vi.fn<() => Promise<void>>(),
}))

vi.mock("@/features/files/api", () => ({
  listFiles: mocks.listFiles,
  deleteFile: mocks.deleteFile,
}))

vi.mock("@/lib/api-client", () => ({ apiClient: {} }))

import { FileAttachments } from "./file-attachments"

const imageFile: FileDto = {
  id: "file-image",
  owner: { type: "issue", id: "issue-1" },
  filename: "architecture.png",
  sizeBytes: 12_345,
  declaredContentType: "image/png",
  previewable: true,
  imageWidth: 500,
  imageHeight: 300,
  uploader: { id: "user-1", name: "Alex Example", image: null },
  createdAt: "2026-07-18T00:00:00.000Z",
  canDelete: true,
}

const documentFile: FileDto = {
  ...imageFile,
  id: "file-document",
  filename: "requirements.pdf",
  declaredContentType: "application/pdf",
  previewable: false,
  imageWidth: null,
  imageHeight: null,
  canDelete: false,
}

const renderAttachments = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const Wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  render(
    <FileAttachments
      organizationId="org alpha"
      ownerType="issue"
      ownerId="issue-1"
    />,
    { wrapper: Wrapper }
  )
}

describe("file attachments", () => {
  beforeEach(() => {
    mocks.listFiles.mockReset()
    mocks.deleteFile.mockReset()
    mocks.listFiles.mockResolvedValue({
      items: [imageFile, documentFile],
      nextCursor: null,
    })
    mocks.deleteFile.mockResolvedValue()
  })

  it("renders private previews and authenticated downloads", async () => {
    renderAttachments()

    expect(
      await screen.findByRole("img", { name: "architecture.png" })
    ).toHaveAttribute(
      "srcset",
      expect.stringContaining(
        "/files/organizations/org%20alpha/file-image/preview/720 500w"
      )
    )
    expect(
      screen.getByRole("link", { name: "Download requirements.pdf" })
    ).toHaveAttribute(
      "href",
      expect.stringContaining(
        "/files/organizations/org%20alpha/file-document/download"
      )
    )
    expect(
      screen.queryByRole("button", { name: "Delete requirements.pdf" })
    ).toBeNull()
    expect(mocks.listFiles).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId: "org alpha",
        ownerType: "issue",
        ownerId: "issue-1",
        limit: 50,
      }),
      expect.any(AbortSignal)
    )
  })

  it("confirms deletion and refreshes the owner list", async () => {
    const user = userEvent.setup()
    renderAttachments()
    await screen.findByText("architecture.png")

    await user.click(
      screen.getByRole("button", { name: "Delete architecture.png" })
    )
    expect(
      screen.getByRole("alertdialog", { name: "Delete this file?" })
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Delete file" }))

    await waitFor(() =>
      expect(mocks.deleteFile).toHaveBeenCalledWith(expect.anything(), {
        organizationId: "org alpha",
        fileId: "file-image",
      })
    )
    await waitFor(() => expect(mocks.listFiles).toHaveBeenCalledTimes(2))
  })
})
