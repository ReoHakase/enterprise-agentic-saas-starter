import { resolveExplicitlyEnabledFlag } from "../../runtime-flags"
import {
  configureFileStorageRuntime,
  type FileCache,
  type FileImagesBinding,
  type FileR2Bucket,
  type FileStorageRuntime,
} from "./runtime"

export type FileStorageWorkerEnvironment = {
  AGENT_ASSET_UPLOAD_ENABLED?: string
  FILES: FileR2Bucket
  IMAGES: FileImagesBinding
}

const isFileCache = (value: unknown): value is FileCache =>
  value !== null &&
  typeof value === "object" &&
  typeof Reflect.get(value, "match") === "function" &&
  typeof Reflect.get(value, "put") === "function"

export const cloudflareDefaultFileCache = (): FileCache | undefined => {
  const cacheStorage = Reflect.get(globalThis, "caches")
  if (!cacheStorage || typeof cacheStorage !== "object") return undefined
  const defaultCache: unknown = Reflect.get(cacheStorage, "default")
  return isFileCache(defaultCache) ? defaultCache : undefined
}

/** HTTP fetchとnamed RPCを同じcapability/flag設定へ収束させる。 */
export const configureFileStorageRuntimeFromWorkerEnvironment = (
  environment: FileStorageWorkerEnvironment,
  cache = cloudflareDefaultFileCache()
): FileStorageRuntime => {
  const runtime: FileStorageRuntime = {
    agentAssetUploadEnabled: resolveExplicitlyEnabledFlag(
      environment.AGENT_ASSET_UPLOAD_ENABLED
    ),
    bucket: environment.FILES,
    images: environment.IMAGES,
    ...(cache ? { cache } : {}),
  }
  configureFileStorageRuntime(runtime)
  return runtime
}
