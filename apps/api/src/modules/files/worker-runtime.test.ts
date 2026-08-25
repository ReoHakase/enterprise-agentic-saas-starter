import { afterEach, describe, expect, it, vi } from "vitest"

import {
  getFileStorageRuntime,
  resetFileStorageRuntimeForTest,
  type FileImagesBinding,
  type FilePreviewBinding,
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

const previews = {
  fetch: vi.fn<FilePreviewBinding["fetch"]>(async () => new Response()),
} satisfies FilePreviewBinding

afterEach(() => {
  resetFileStorageRuntimeForTest()
})

describe("Cloudflare file runtimeの配線", () => {
  it("新しいnamed RPC isolateへR2とImagesとpreview Service Bindingと明示upload flagを設定する", () => {
    const configured = configureFileStorageRuntimeFromWorkerEnvironment({
      AGENT_ASSET_UPLOAD_ENABLED: " 1 ",
      FILES: bucket,
      IMAGE_PREVIEWS: previews,
      IMAGES: images,
    })

    expect(getFileStorageRuntime()).toBe(configured)
    expect(configured).toMatchObject({
      agentAssetUploadEnabled: true,
      bucket,
      images,
      previews,
    })
  })

  it.each([
    { label: "設定値未定義", value: undefined },
    { label: "空文字", value: "" },
    { label: "文字列0", value: "0" },
    { label: "文字列true", value: "true" },
    { label: "文字列yes", value: "yes" },
  ])("$labelではuploadをfail closedに保つ", ({ value }) => {
    const configured = configureFileStorageRuntimeFromWorkerEnvironment({
      AGENT_ASSET_UPLOAD_ENABLED: value,
      FILES: bucket,
      IMAGE_PREVIEWS: previews,
      IMAGES: images,
    })

    expect(configured.agentAssetUploadEnabled).toBe(false)
  })
})
