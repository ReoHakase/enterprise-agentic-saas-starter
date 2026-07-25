export type FileR2Object = {
  key: string
  size: number
  etag: string
  httpEtag: string
  customMetadata?: Record<string, string>
}

export type FileR2ObjectBody = FileR2Object & {
  body: ReadableStream<Uint8Array>
  range?: { offset: number; length: number }
}

/** @internal */
export type FileR2PutValue = Blob | ReadableStream<Uint8Array>

export type FileR2Bucket = {
  head(key: string): Promise<FileR2Object | null>
  get(
    key: string,
    options?: {
      onlyIf?: Headers
      range?: { offset?: number; length?: number; suffix?: number }
    }
  ): Promise<FileR2ObjectBody | FileR2Object | null>
  put(
    key: string,
    value: FileR2PutValue,
    options: {
      onlyIf?: Headers
      httpMetadata: { contentType: string }
      customMetadata: Record<string, string>
      storageClass?: "Standard"
    }
  ): Promise<FileR2Object | null>
  delete(keys: string | string[]): Promise<void>
  list(options: { prefix: string; cursor?: string; limit?: number }): Promise<{
    objects: { key: string }[]
    truncated: boolean
    cursor?: string
  }>
}

export type FileImagesBinding = {
  info(stream: ReadableStream<Uint8Array>): Promise<{
    format: string
    fileSize?: number
    width?: number
    height?: number
  }>
  input(stream: ReadableStream<Uint8Array>): {
    transform(options: {
      width: number
      height?: number
      fit: "cover" | "scale-down"
    }): {
      output(options: {
        format: "image/webp"
        quality: number
        anim: boolean
      }): Promise<{ response(): Response }>
    }
  }
}

export type FileCache = {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
}

export type FileStorageRuntime = {
  /** 明示的に有効化されたときだけ新規Agent asset uploadを許可する。 */
  agentAssetUploadEnabled?: boolean
  bucket: FileR2Bucket
  images: FileImagesBinding
  cache?: FileCache
  defer?: (promise: Promise<unknown>) => void
}

let runtime: FileStorageRuntime | undefined

/**
 * createApp(db)をCloudflare bindingから独立させたまま、Worker entrypointだけが
 * R2 / Images / Cache capabilityを登録する。request固有の値は保持しない。
 */
export const configureFileStorageRuntime = (next: FileStorageRuntime) => {
  runtime = next
}

/** @internal */
export const resetFileStorageRuntimeForTest = () => {
  runtime = undefined
}

export const getFileStorageRuntime = (): FileStorageRuntime => {
  if (!runtime) {
    throw new Error("File storage runtime is not configured")
  }
  return runtime
}
