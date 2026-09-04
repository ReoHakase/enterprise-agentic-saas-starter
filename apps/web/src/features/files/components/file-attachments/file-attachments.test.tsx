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

import { fileKeys } from "../../queries"

type IssueThumbnail = {
  mode: "automatic" | "selected"
  file: {
    id: string
    filename: string
    imageWidth: number | null
    imageHeight: number | null
  } | null
}

const mocks = vi.hoisted(() => ({
  listFiles: vi.fn<
    (
      client: unknown,
      input: {
        organizationId: string
        ownerType: "agent_thread" | "issue"
        ownerId: string
        cursor?: string
        limit?: number
      },
      signal?: AbortSignal
    ) => Promise<FileListDto>
  >(),
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

vi.mock("../../api", () => ({
  listFiles: mocks.listFiles,
  deleteFile: mocks.deleteFile,
  getTextFilePreview: mocks.getTextFilePreview,
}))

vi.mock("@/features/issues", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/issues")>()
  return {
    ...original,
    updateIssueThumbnail: mocks.updateIssueThumbnail,
    issueThumbnailQueryOptions: (
      client: unknown,
      organizationId: string,
      issueId: string
    ) => ({
      queryKey: original.issueKeys.thumbnail(organizationId, issueId),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        mocks.getIssueThumbnail(
          client,
          { id: issueId, organizationId },
          signal
        ),
      enabled: organizationId.length > 0 && issueId.length > 0,
    }),
  }
})

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

describe("添付ファイル", () => {
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

  it("認証付きdownloadリンクを描画する", async () => {
    renderAttachments()

    expect(
      await screen.findByRole("link", { name: "Download requirements.pdf" })
    ).toHaveAttribute(
      "href",
      expect.stringContaining(
        "/files/organizations/org%20alpha/file-document/download"
      )
    )
  })

  it("削除権限がないファイルには削除操作を表示しない", async () => {
    renderAttachments()

    await screen.findByRole("link", { name: "Download requirements.pdf" })
    expect(
      screen.queryByRole("button", { name: "Delete requirements.pdf" })
    ).toBeNull()
  })

  it("所有者scopeでファイル一覧を取得する", async () => {
    renderAttachments()

    await waitFor(() => expect(mocks.listFiles).toHaveBeenCalledOnce())
    expect(mocks.listFiles.mock.calls[0]?.[1]).toMatchObject({
      organizationId: "org alpha",
      ownerType: "issue",
      ownerId: "issue-1",
      limit: 50,
    })
  })

  it("テキストpreviewを無害化済み文字列として描画する", async () => {
    const user = userEvent.setup()
    renderAttachments()

    await user.click(await screen.findByRole("button", { name: "notes.txt" }))

    expect(
      await screen.findByText("<script>alert('escaped')</script>")
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Preview limited to the first 1 MB/u)
    ).toBeInTheDocument()
  })

  it("画像へ戻るとテキストpreviewのcacheを破棄する", async () => {
    const user = userEvent.setup()
    const queryClient = renderAttachments()

    await user.click(
      await screen.findByRole("button", {
        name: "Preview image architecture.png",
      })
    )
    await user.click(screen.getByRole("button", { name: "Preview next file" }))
    await waitFor(() =>
      expect(
        queryClient.getQueryData(fileKeys.textPreview("org alpha", "file-text"))
      ).toBeDefined()
    )

    await user.click(
      screen.getByRole("button", { name: "Preview previous file" })
    )
    await waitFor(() =>
      expect(
        queryClient.getQueryData(fileKeys.textPreview("org alpha", "file-text"))
      ).toBeUndefined()
    )
  })

  it("ファイル名とアップロード者を公開文言で表示する", async () => {
    renderAttachments()
    await screen.findByRole("button", {
      name: "Preview image architecture.png",
    })

    const filename = screen.getByRole("button", { name: "architecture.png" })
    expect(within(filename).getByText("architecture.png")).toBeInTheDocument()

    const uploader = screen.getAllByLabelText("Uploaded by Alex Example")[0]
    if (!uploader) throw new Error("Expected the file uploader identity")
    expect(within(uploader).getByText("AE")).toBeInTheDocument()
    expect(within(uploader).getByText("Alex Example")).toBeInTheDocument()
  })

  it("削除を確認して所有者の一覧を再取得する", async () => {
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

  it("画像だけをthumbnail候補として有効にする", async () => {
    const user = userEvent.setup()
    renderAttachments()

    await user.click(
      await screen.findByRole("button", { name: "Change thumbnail" })
    )
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
  })

  it("thumbnail変更を取り消す", async () => {
    const user = userEvent.setup()
    renderAttachments()

    await user.click(
      await screen.findByRole("button", { name: "Change thumbnail" })
    )
    await user.click(
      screen.getByRole("radio", {
        name: "Use architecture.png as thumbnail",
      })
    )
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("radio")).toBeNull()
    expect(mocks.updateIssueThumbnail).not.toHaveBeenCalled()
  })

  it("画像をthumbnailへ明示指定する", async () => {
    const user = userEvent.setup()
    renderAttachments()

    await user.click(
      await screen.findByRole("button", {
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
  })

  it("編集開始時に現在の明示指定thumbnailを選択済みにする", async () => {
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
