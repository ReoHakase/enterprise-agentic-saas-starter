import { AppError } from "../../errors/app-error"
import {
  getFileStorageRuntime,
  type FileR2Object,
  type FileR2ObjectBody,
  type FileStorageRuntime,
} from "./runtime"

export const providerUnavailable = (
  provider: "images" | "r2" | "runtime",
  operation: string
) =>
  new AppError({
    code: "service_unavailable",
    publicMessage: "Service temporarily unavailable",
    publicContext: { retryAfter: 30 },
    privateContext: { module: "files", operation, provider },
  })

export const getRuntime = (): FileStorageRuntime => {
  try {
    return getFileStorageRuntime()
  } catch {
    throw providerUnavailable("runtime", "getFileStorageRuntime")
  }
}

export const bodyObject = (
  object: FileR2Object | FileR2ObjectBody | null
): FileR2ObjectBody | null =>
  object && "body" in object && object.body instanceof ReadableStream
    ? object
    : null
