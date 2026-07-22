import { afterEach, describe, expect, it, vi } from "vitest"

import {
  getFileStorageRuntime,
  resetFileStorageRuntimeForTest,
  type FileCache,
  type FileImagesBinding,
  type FileR2Bucket,
} from "./runtime"
import { configureFileStorageRuntimeFromWorkerEnvironment } from "./worker-runtime"

const bucket = {
  head: vi.fn<FileR2Bucket["head"]>(async () => null),
  get: vi.fn<FileR2Bucket["get"]>(async () => null),
  put: vi.fn<FileR2Bucket["put"]>(async () => null),
  delete: vi.fn<FileR2Bucket["delete"]>(async () => undefined),
  list: vi.fn<FileR2Bucket["list"]>(async () => ({
    objects: [],
    truncated: false,
  })),
} satisfies FileR2Bucket

const images = {
  info: vi.fn<FileImagesBinding["info"]>(async () => ({ format: "png" })),
  input: vi.fn<FileImagesBinding["input"]>(() => ({
    transform: () => ({
      output: async () => ({ response: () => new Response() }),
    }),
  })),
} satisfies FileImagesBinding

const cache = {
  match: vi.fn<FileCache["match"]>(async () => undefined),
  put: vi.fn<FileCache["put"]>(async () => undefined),
} satisfies FileCache

afterEach(() => {
  resetFileStorageRuntimeForTest()
  vi.unstubAllGlobals()
})

describe("Cloudflare file runtime wiring", () => {
  it("configures a fresh named RPC isolate with R2, Images, Cache, and an explicit upload flag", () => {
    vi.stubGlobal("caches", { default: cache })
    const configured = configureFileStorageRuntimeFromWorkerEnvironment({
      AGENT_ASSET_UPLOAD_ENABLED: " 1 ",
      FILES: bucket,
      IMAGES: images,
    })

    expect(getFileStorageRuntime()).toBe(configured)
    expect(configured).toMatchObject({
      agentAssetUploadEnabled: true,
      bucket,
      cache,
      images,
    })
  })

  it.each([undefined, "", "0", "true", "yes"])(
    "keeps upload fail-closed for %s",
    (value) => {
      const configured = configureFileStorageRuntimeFromWorkerEnvironment({
        AGENT_ASSET_UPLOAD_ENABLED: value,
        FILES: bucket,
        IMAGES: images,
      })

      expect(configured.agentAssetUploadEnabled).toBe(false)
    }
  )
})
