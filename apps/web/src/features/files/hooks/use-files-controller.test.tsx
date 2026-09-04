import {
  FileUploadError,
  type FileDto,
  type uploadFileWithProgress,
} from "@enterprise-agentic-saas/api/client"
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  reportObservedError: vi.fn<(error: unknown) => void>(),
  uploadFileWithProgress: vi.fn<typeof uploadFileWithProgress>(),
}))

vi.mock("@enterprise-agentic-saas/api/client", async (importOriginal) => ({
  ...(await importOriginal()),
  uploadFileWithProgress: mocks.uploadFileWithProgress,
}))

vi.mock("@/lib/report-observed-error", () => ({
  reportObservedError: mocks.reportObservedError,
}))

import { MAX_CONCURRENT_FILE_UPLOADS } from "../file-upload-limits"
import { cancelActiveFileUploads } from "../uploads"
import { useFilesController } from "./use-files-controller"

const uploadedFile = (id: string): FileDto => ({
  id,
  owner: { type: "issue", id: "issue-1" },
  filename: `${id}.txt`,
  sizeBytes: 4,
  declaredContentType: "text/plain",
  previewable: false,
  textPreviewable: true,
  imageWidth: null,
  imageHeight: null,
  uploader: { id: "user-1", name: "User", profileImage: null },
  createdAt: "2026-07-18T00:00:00.000Z",
  canDelete: true,
})

describe("ファイルアップロードキュー", () => {
  afterEach(() => {
    mocks.reportObservedError.mockClear()
    mocks.uploadFileWithProgress.mockReset()
  })

  it("uploadの同時実行を最大3件に制限して完了後に次を開始する", async () => {
    const pending: Array<{
      resolve: (file: FileDto) => void
    }> = []
    mocks.uploadFileWithProgress.mockImplementation(
      () =>
        new Promise<FileDto>((resolve) => {
          pending.push({ resolve })
        })
    )
    const onUploaded = vi.fn<() => Promise<void>>().mockResolvedValue()
    const { result } = renderHook(() =>
      useFilesController({
        organizationId: "org-1",
        ownerType: "issue",
        ownerId: "issue-1",
        onUploaded,
      })
    )
    const files = Array.from(
      { length: 4 },
      (_, index) =>
        new File(["test"], `file-${index.toString()}.txt`, {
          type: "text/plain",
        })
    )

    act(() => result.current.addFiles(files))
    await waitFor(() =>
      expect(mocks.uploadFileWithProgress).toHaveBeenCalledTimes(
        MAX_CONCURRENT_FILE_UPLOADS
      )
    )

    await act(async () => pending[0]?.resolve(uploadedFile("file-0")))
    await waitFor(() =>
      expect(mocks.uploadFileWithProgress).toHaveBeenCalledTimes(4)
    )
  })

  it("失敗したuploadを同じupload IDで再試行する", async () => {
    mocks.uploadFileWithProgress
      .mockRejectedValueOnce(new Error("injected failure"))
      .mockResolvedValueOnce(uploadedFile("file-1"))
    const { result } = renderHook(() =>
      useFilesController({
        organizationId: "org-1",
        ownerType: "issue",
        ownerId: "issue-1",
        onUploaded: vi.fn<() => Promise<void>>().mockResolvedValue(),
      })
    )

    act(() =>
      result.current.addFiles([
        new File(["test"], "file-1.txt", { type: "text/plain" }),
      ])
    )
    await waitFor(() =>
      expect(
        result.current.uploads.some((upload) => upload.status === "failed")
      ).toBe(true)
    )
    const failed = result.current.uploads.find(
      (upload) => upload.status === "failed"
    )
    if (!failed) throw new Error("Expected a failed upload")
    const firstUploadId =
      mocks.uploadFileWithProgress.mock.calls[0]?.[0].uploadId

    act(() => result.current.retryUpload(failed.id))
    await waitFor(() =>
      expect(mocks.uploadFileWithProgress).toHaveBeenCalledTimes(2)
    )
    expect(mocks.uploadFileWithProgress.mock.calls[1]?.[0].uploadId).toBe(
      firstUploadId
    )
  })

  it("要求元へ安全な4xx upload理由を表示し、元のエラーを報告する", async () => {
    const uploadError = new FileUploadError({
      code: "unsupported_media_type",
      message: "Choose a supported file type.",
      status: 415,
    })
    mocks.uploadFileWithProgress.mockRejectedValueOnce(uploadError)
    const { result } = renderHook(() =>
      useFilesController({
        organizationId: "org-1",
        ownerType: "issue",
        ownerId: "issue-1",
        onUploaded: vi.fn<() => void>(),
      })
    )

    act(() =>
      result.current.addFiles([
        new File(["test"], "unsupported.bin", {
          type: "application/octet-stream",
        }),
      ])
    )

    await waitFor(() =>
      expect(result.current.uploads[0]).toMatchObject({
        error: "Choose a supported file type.",
        status: "failed",
      })
    )
    expect(mocks.reportObservedError).toHaveBeenCalledWith(uploadError)
  })

  it("実行中のuploadを中止し、所有者の一覧を同期する", async () => {
    mocks.uploadFileWithProgress.mockImplementation(
      ({ signal }: { signal?: AbortSignal }) =>
        new Promise<FileDto>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => {
              const error = new Error("aborted")
              error.name = "AbortError"
              reject(error)
            },
            { once: true }
          )
        })
    )
    const onCanceled = vi.fn<() => Promise<void>>().mockResolvedValue()
    const { result } = renderHook(() =>
      useFilesController({
        organizationId: "org-1",
        ownerType: "issue",
        ownerId: "issue-1",
        onUploaded: vi.fn<() => void>(),
        onCanceled,
      })
    )

    act(() =>
      result.current.addFiles([
        new File(["test"], "cancel-me.txt", { type: "text/plain" }),
      ])
    )
    await waitFor(() =>
      expect(mocks.uploadFileWithProgress).toHaveBeenCalledOnce()
    )
    const upload = result.current.uploads[0]
    if (!upload) throw new Error("Expected an active upload")

    act(() => result.current.cancelUpload(upload.id))

    await waitFor(() => expect(onCanceled).toHaveBeenCalledOnce())
    expect(result.current.uploads).toEqual([])
    expect(
      mocks.uploadFileWithProgress.mock.calls[0]?.[0].signal?.aborted
    ).toBe(true)
  })

  it("テナント切替時に待機中の処理と実行中XHRを停止する", async () => {
    mocks.uploadFileWithProgress.mockImplementation(
      ({ signal }: { signal?: AbortSignal }) =>
        new Promise<FileDto>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => {
              const error = new Error("aborted")
              error.name = "AbortError"
              reject(error)
            },
            { once: true }
          )
        })
    )
    const { result } = renderHook(() =>
      useFilesController({
        organizationId: "org-1",
        ownerType: "issue",
        ownerId: "issue-1",
        onUploaded: vi.fn<() => void>(),
      })
    )

    act(() => {
      result.current.addFiles(
        Array.from(
          { length: 6 },
          (_, index) =>
            new File(["test"], `queued-${index.toString()}.txt`, {
              type: "text/plain",
            })
        )
      )
    })
    await waitFor(() =>
      expect(mocks.uploadFileWithProgress).toHaveBeenCalledTimes(
        MAX_CONCURRENT_FILE_UPLOADS
      )
    )

    act(() => cancelActiveFileUploads())

    await waitFor(() => expect(result.current.uploads).toEqual([]))
    expect(mocks.uploadFileWithProgress).toHaveBeenCalledTimes(
      MAX_CONCURRENT_FILE_UPLOADS
    )
    for (const [input] of mocks.uploadFileWithProgress.mock.calls) {
      expect(input.signal?.aborted).toBe(true)
    }
  })
})
