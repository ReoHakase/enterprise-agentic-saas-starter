import { HttpError } from "../../errors/http-error"
import {
  getFileStorageRuntime,
  type FileR2Object,
  type FileR2ObjectBody,
  type FileStorageRuntime,
} from "./runtime"

export const providerUnavailable = (
  _provider: "images" | "r2" | "runtime",
  _operation: string,
  cause?: unknown
) =>
  new HttpError({
    cause,
    code: "service_unavailable",
    retryAfter: 30,
  })

export const getRuntime = (): FileStorageRuntime => {
  try {
    return getFileStorageRuntime()
  } catch (cause) {
    throw providerUnavailable("runtime", "getFileStorageRuntime", cause)
  }
}

export const bodyObject = (
  object: FileR2Object | FileR2ObjectBody | null
): FileR2ObjectBody | null =>
  object && "body" in object && object.body instanceof ReadableStream
    ? object
    : null
