import type {
  FileDto,
  uploadFileWithProgress,
} from "@enterprise-agentic-saas/api/client"
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  reportObservedError: vi.fn<(error: unknown) => void>(),
  uploadFileWithProgress: vi.fn<typeof uploadFileWithProgress>(),
}))

vi.mock("@enterprise-agentic-saas/api/client", () => ({
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

describe("file upload queue", () => {
  afterEach(() => {
    mocks.reportObservedError.mockClear()
    mocks.uploadFileWithProgress.mockReset()
  })

  it("runs no more than three uploads and keeps the upload id for retry", async () => {
    const pending: Array<{
      resolve: (file: FileDto) => void
      reject: (error: Error) => void
    }> = []
    mocks.uploadFileWithProgress.mockImplementation(
      () =>
        new Promise<FileDto>((resolve, reject) => {
          pending.push({ resolve, reject })
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
      { length: 5 },
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

    const secondCall = mocks.uploadFileWithProgress.mock.calls[1]?.[0]
    const secondUploadId = secondCall?.uploadId
    const uploadError = new Error("injected failure")
    await act(async () => pending[1]?.reject(uploadError))
    await waitFor(() =>
      expect(
        result.current.uploads.some((upload) => upload.status === "failed")
      ).toBe(true)
    )
    const failed = result.current.uploads.find(
      (upload) => upload.status === "failed"
    )
    if (!failed) throw new Error("Expected a failed upload")

    act(() => result.current.retryUpload(failed.id))
    await act(async () => pending[2]?.resolve(uploadedFile("file-2")))
    await waitFor(() =>
      expect(mocks.uploadFileWithProgress).toHaveBeenCalledTimes(6)
    )
    const retryCall = mocks.uploadFileWithProgress.mock.calls.find(
      ([input], index) => index > 1 && input.uploadId === secondUploadId
    )
    expect(retryCall?.[0].uploadId).toBe(secondUploadId)
    expect(mocks.reportObservedError).toHaveBeenCalledWith(uploadError)
  })

  it("aborts an active upload and reconciles the owner list", async () => {
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

  it("stops queued work as well as active XHRs during a tenant switch", async () => {
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
