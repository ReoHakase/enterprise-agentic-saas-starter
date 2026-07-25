import { AppError } from "../../errors/app-error"
import {
  getFileStorageRuntime,
  type FileR2Object,
  type FileR2ObjectBody,
  type FileStorageRuntime,
} from "./runtime"

export const agentAssetProviderUnavailable = (
  provider: "images" | "r2" | "runtime",
  operation: string
) =>
  new AppError({
    code: "service_unavailable",
    publicMessage: "Service temporarily unavailable",
    publicContext: { retryAfter: 30 },
    privateContext: { module: "agent-assets", operation, provider },
  })

export const getAgentAssetRuntime = (): FileStorageRuntime => {
  try {
    return getFileStorageRuntime()
  } catch {
    throw agentAssetProviderUnavailable("runtime", "getFileStorageRuntime")
  }
}

export const agentAssetBodyObject = (
  object: FileR2Object | FileR2ObjectBody | null
): FileR2ObjectBody | null =>
  object && "body" in object && object.body instanceof ReadableStream
    ? object
    : null
