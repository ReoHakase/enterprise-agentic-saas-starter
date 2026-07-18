import { treaty, type Treaty } from "@elysia/eden"
import * as v from "valibot"

import type { App } from "./app"
import {
  FILE_PREVIEW_WIDTHS,
  type FileOwnerType,
  type FilePreviewWidth,
} from "./modules/files/constants"
import {
  fileDtoModel,
  type FileDto,
  type FileListDto,
} from "./modules/files/model"

export { FILE_PREVIEW_WIDTHS }
export type { FileDto, FileListDto, FileOwnerType, FilePreviewWidth }

type TreatyOptions = NonNullable<Parameters<typeof treaty<App>>[1]>

export type CreateApiClientOptions = Omit<TreatyOptions, "parseDate">

export const createApiClient = (
  baseUrl: string,
  options?: CreateApiClientOptions
): Treaty.Create<App> =>
  treaty<App>(baseUrl, {
    ...options,
    parseDate: false,
  })

export type ApiClient = ReturnType<typeof createApiClient>

const fileUrl = (baseUrl: string, segments: string[]) => {
  const url = new URL(baseUrl)
  const basePath = url.pathname.replace(/\/$/, "")
  url.pathname = `${basePath}/${segments.map(encodeURIComponent).join("/")}`
  url.search = ""
  url.hash = ""
  return url.toString()
}

export const buildFileDownloadUrl = (
  baseUrl: string,
  input: { organizationId: string; fileId: string }
) =>
  fileUrl(baseUrl, [
    "files",
    "organizations",
    input.organizationId,
    input.fileId,
    "download",
  ])

export const buildFilePreviewUrl = (
  baseUrl: string,
  input: {
    organizationId: string
    fileId: string
    width: FilePreviewWidth
  }
) =>
  fileUrl(baseUrl, [
    "files",
    "organizations",
    input.organizationId,
    input.fileId,
    "preview",
    String(input.width),
  ])

export type FileUploadProgress = {
  loaded: number
  total: number
  percent: number
}

export class FileUploadError extends Error {
  readonly status: number
  readonly code?: string
  readonly requestId?: string

  constructor(input: {
    message: string
    status: number
    code?: string
    requestId?: string
  }) {
    super(input.message)
    this.name = "FileUploadError"
    this.status = input.status
    this.code = input.code
    this.requestId = input.requestId
  }
}

const uploadErrorDetails = (value: unknown) => {
  if (!value || typeof value !== "object") return {}
  const error = Reflect.get(value, "error")
  if (!error || typeof error !== "object") return {}
  const message = Reflect.get(error, "message")
  const code = Reflect.get(error, "code")
  const requestId = Reflect.get(error, "requestId")
  return {
    message: typeof message === "string" ? message : undefined,
    code: typeof code === "string" ? code : undefined,
    requestId: typeof requestId === "string" ? requestId : undefined,
  }
}

const abortError = () => {
  const error = new Error("File upload was aborted")
  error.name = "AbortError"
  return error
}

export const uploadFileWithProgress = ({
  baseUrl,
  organizationId,
  ownerType,
  ownerId,
  uploadId,
  file,
  signal,
  onProgress,
}: {
  baseUrl: string
  organizationId: string
  ownerType: FileOwnerType
  ownerId: string
  uploadId: string
  file: File
  signal?: AbortSignal
  onProgress?: (progress: FileUploadProgress) => void
}): Promise<FileDto> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }

    const xhr = new XMLHttpRequest()
    const url = fileUrl(baseUrl, [
      "files",
      "organizations",
      organizationId,
      "owners",
      ownerType,
      ownerId,
    ])
    const form = new FormData()
    form.set("uploadId", uploadId)
    form.set("fileSize", String(file.size))
    form.set("file", file)

    const onAbortSignal = () => xhr.abort()
    const cleanup = () => signal?.removeEventListener("abort", onAbortSignal)

    xhr.open("POST", url)
    xhr.withCredentials = true
    xhr.responseType = "json"
    xhr.upload.addEventListener("progress", (event) => {
      const total =
        event.lengthComputable && event.total > 0 ? event.total : file.size
      const percent =
        total > 0 ? Math.min(100, (event.loaded / total) * 100) : 0
      onProgress?.({ loaded: event.loaded, total, percent })
    })
    xhr.addEventListener("load", () => {
      cleanup()
      if (xhr.status >= 200 && xhr.status < 300) {
        const result = v.safeParse(fileDtoModel, xhr.response)
        if (result.success) {
          resolve(result.output)
          return
        }
        reject(
          new FileUploadError({
            message: "File upload returned an invalid response",
            status: xhr.status,
          })
        )
        return
      }

      const details = uploadErrorDetails(xhr.response)
      reject(
        new FileUploadError({
          message: details.message ?? "File upload failed",
          status: xhr.status,
          code: details.code,
          requestId: details.requestId,
        })
      )
    })
    xhr.addEventListener("error", () => {
      cleanup()
      reject(new FileUploadError({ message: "File upload failed", status: 0 }))
    })
    xhr.addEventListener("abort", () => {
      cleanup()
      reject(abortError())
    })
    signal?.addEventListener("abort", onAbortSignal, { once: true })
    xhr.send(form)
  })
