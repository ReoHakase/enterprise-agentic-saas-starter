import type {
  FileDto,
  FileListDto,
  TextFilePreviewDto,
} from "@enterprise-agentic-saas/api/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { PropsWithChildren } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { fileKeys } from "@/features/files/queries"
import type { IssueThumbnail } from "@/features/issues/schema"

const mocks = vi.hoisted(() => ({
  listFiles: vi.fn<() => Promise<FileListDto>>(),
  deleteFile: vi.fn<() => Promise<void>>(),
  getTextFilePreview: vi.fn<() => Promise<TextFilePreviewDto>>(),
  getIssueThumbnail:
    vi.fn<
      (
        client: unknown,
        input: { id: string; organizationId: string },
        signal?: AbortSignal
      ) => Promise<IssueThumbnail>
    >(),
  updateIssueThumbnail:
    vi.fn<
      (
        client: unknown,
        input: { id: string; organizationId: string; fileId: string | null }
      ) => Promise<IssueThumbnail>
    >(),
}))

vi.mock("@/features/files/api", () => ({
  listFiles: mocks.listFiles,
  deleteFile: mocks.deleteFile,
  getTextFilePreview: mocks.getTextFilePreview,
}))

vi.mock("@/features/issues/api", () => ({
  getIssueThumbnail: mocks.getIssueThumbnail,
  updateIssueThumbnail: mocks.updateIssueThumbnail,
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
  textPreviewable: false,
  imageWidth: 500,
  imageHeight: 300,
  uploader: { id: "user-1", name: "Alex Example", profileImage: null },
  createdAt: "2026-07-18T00:00:00.000Z",
  canDelete: true,
}

const documentFile: FileDto = {
  ...imageFile,
  id: "file-document",
  filename: "requirements.pdf",
  declaredContentType: "application/pdf",
  previewable: false,
  textPreviewable: false,
  imageWidth: null,
  imageHeight: null,
  canDelete: false,
}

const textFile: FileDto = {
  ...documentFile,
  id: "file-text",
  filename: "notes.txt",
  sizeBytes: 1_000_001,
  declaredContentType: "text/plain",
  textPreviewable: true,
  canDelete: true,
}

const renderAttachments = (onFilesChanged?: () => void | Promise<void>) => {
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
      onFilesChanged={onFilesChanged}
    />,
    { wrapper: Wrapper }
  )
  return queryClient
}

describe("file attachments", () => {
  beforeEach(() => {
    mocks.listFiles.mockReset()
    mocks.deleteFile.mockReset()
    mocks.getTextFilePreview.mockReset()
    mocks.getIssueThumbnail.mockReset()
    mocks.updateIssueThumbnail.mockReset()
    mocks.listFiles.mockResolvedValue({
      items: [imageFile, textFile, documentFile],
      nextCursor: null,
    })
    mocks.deleteFile.mockResolvedValue()
    mocks.getTextFilePreview.mockResolvedValue({
      content: "<script>alert('escaped')</script>",
      truncated: true,
    })
    mocks.getIssueThumbnail.mockResolvedValue({
      mode: "automatic",
      file: {
        id: imageFile.id,
        filename: imageFile.filename,
        imageWidth: imageFile.imageWidth,
        imageHeight: imageFile.imageHeight,
      },
    })
    mocks.updateIssueThumbnail.mockImplementation(
      async (_client: unknown, input: { fileId: string | null }) => ({
        mode: input.fileId ? "selected" : "automatic",
        file: input.fileId
          ? {
              id: input.fileId,
              filename: imageFile.filename,
              imageWidth: imageFile.imageWidth,
              imageHeight: imageFile.imageHeight,
            }
          : {
              id: imageFile.id,
              filename: imageFile.filename,
              imageWidth: imageFile.imageWidth,
              imageHeight: imageFile.imageHeight,
            },
      })
    )
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

  it("opens image and escaped text previews in a viewport dialog", async () => {
    const user = userEvent.setup()
    const queryClient = renderAttachments()

    const trigger = await screen.findByRole("button", {
      name: "Preview image architecture.png",
    })
    await user.click(trigger)

    let dialog = await screen.findByRole("dialog", {
      name: "architecture.png",
    })
    expect(dialog).toHaveClass("h-dvh", "w-screen", "max-w-none")
    expect(dialog).toHaveStyle({
      animation: "none",
      maxHeight: "none",
      maxWidth: "none",
      transform: "none",
    })
    expect(dialog.style.width).toBe("100vw")
    expect(
      within(dialog).getByRole("img", { name: "architecture.png" })
    ).toHaveAttribute("sizes", "100vw")

    await user.keyboard("{ArrowRight}")
    dialog = await screen.findByRole("dialog", { name: "notes.txt" })
    expect(
      await within(dialog).findByText("<script>alert('escaped')</script>")
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(/Preview limited to the first 1 MB/u)
    ).toBeInTheDocument()
    expect(mocks.getTextFilePreview).toHaveBeenCalledWith(
      expect.anything(),
      { organizationId: "org alpha", fileId: "file-text" },
      expect.any(AbortSignal)
    )

    await user.keyboard("{ArrowLeft}")
    expect(
      await screen.findByRole("dialog", { name: "architecture.png" })
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(
        queryClient.getQueryData(fileKeys.textPreview("org alpha", "file-text"))
      ).toBeUndefined()
    )
    await user.keyboard("{Escape}")
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it("keeps card dimensions while placing icons next to their labels", async () => {
    renderAttachments()
    const imageTrigger = await screen.findByRole("button", {
      name: "Preview image architecture.png",
    })
    expect(imageTrigger).toHaveClass("min-h-36", "max-h-72")

    const filename = screen.getByRole("button", { name: "architecture.png" })
    const fileIcon = within(filename).getByTestId("file-icon-file-image")
    expect(fileIcon).toHaveClass("size-4")
    expect(within(filename).getByText("architecture.png")).toBeInTheDocument()

    const uploader = screen.getAllByLabelText("Uploaded by Alex Example")[0]
    if (!uploader) throw new Error("Expected the file uploader identity")
    expect(within(uploader).getByText("AE")).toBeInTheDocument()
    expect(within(uploader).getByText("Alex Example")).toBeInTheDocument()
    expect(
      screen.getByRole("group", {
        name: "File details for architecture.png",
      })
    ).toHaveClass("min-h-16", "p-3")
  })

  it("confirms deletion and refreshes the owner list", async () => {
    const user = userEvent.setup()
    const onFilesChanged = vi.fn<() => Promise<void>>().mockResolvedValue()
    renderAttachments(onFilesChanged)
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
    expect(onFilesChanged).toHaveBeenCalledOnce()
  })

  it("keeps thumbnail controls in an explicit edit mode", async () => {
    const user = userEvent.setup()
    renderAttachments()

    const changeThumbnail = await screen.findByRole("button", {
      name: "Change thumbnail",
    })
    const attachmentActions = screen.getByRole("group", {
      name: "Attachment actions",
    })
    expect(
      within(attachmentActions).getByRole("button", { name: "Add files" })
    ).toBeInTheDocument()
    expect(
      within(attachmentActions).getByRole("button", {
        name: "Change thumbnail",
      })
    ).toBe(changeThumbnail)
    expect(screen.getByTestId("change-thumbnail-icon")).toHaveAttribute(
      "data-icon",
      "inline-start"
    )
    expect(screen.queryByText("Thumbnail")).toBeNull()
    expect(screen.queryByRole("radio")).toBeNull()
    expect(
      screen.queryByRole("button", { name: "Use oldest automatically" })
    ).toBeNull()

    await user.click(changeThumbnail)
    const imageRadio = screen.getByRole("radio", {
      name: "Use architecture.png as thumbnail",
    })
    expect(imageRadio).toBeEnabled()
    expect(imageRadio).not.toBeChecked()
    expect(
      screen.getByRole("radio", {
        name: "Use notes.txt as thumbnail",
      })
    ).toBeDisabled()
    expect(
      screen.getByRole("radio", {
        name: "Use requirements.pdf as thumbnail",
      })
    ).toBeDisabled()
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled()

    await user.click(imageRadio)
    expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled()
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("radio")).toBeNull()
    expect(mocks.updateIssueThumbnail).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole("button", {
        name: "Change thumbnail",
      })
    )
    await user.click(
      screen.getByRole("radio", {
        name: "Use architecture.png as thumbnail",
      })
    )
    await user.click(screen.getByRole("button", { name: "Confirm" }))
    await waitFor(() =>
      expect(mocks.updateIssueThumbnail).toHaveBeenCalledWith(
        expect.anything(),
        {
          id: "issue-1",
          organizationId: "org alpha",
          fileId: "file-image",
        }
      )
    )
    await waitFor(() => expect(screen.queryByRole("radio")).toBeNull())
    expect(screen.queryByText("Thumbnail")).toBeNull()
  })

  it("checks the current explicit thumbnail when editing starts", async () => {
    const user = userEvent.setup()
    mocks.getIssueThumbnail.mockResolvedValue({
      mode: "selected",
      file: {
        id: imageFile.id,
        filename: imageFile.filename,
        imageWidth: imageFile.imageWidth,
        imageHeight: imageFile.imageHeight,
      },
    })
    renderAttachments()

    await user.click(
      await screen.findByRole("button", {
        name: "Change thumbnail",
      })
    )
    expect(
      screen.getByRole("radio", {
        name: "Use architecture.png as thumbnail",
      })
    ).toBeChecked()
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled()
  })
})
