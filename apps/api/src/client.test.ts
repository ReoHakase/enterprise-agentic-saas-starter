import { describe, expect, expectTypeOf, it } from "vitest"

import {
  buildFileDownloadUrl,
  buildFilePreviewUrl,
  FileUploadError,
  uploadFileWithProgress,
  type CreateApiClientOptions,
} from "./client"

it("does not expose Eden date parsing as a consumer option", () => {
  type HasParseDate = "parseDate" extends keyof CreateApiClientOptions
    ? true
    : false

  expectTypeOf<HasParseDate>().toEqualTypeOf<false>()
})

describe("file client helpers", () => {
  it("builds encoded download and preview URLs without persisting them", () => {
    expect(
      buildFileDownloadUrl("https://api.example.test/root/", {
        organizationId: "org/acme",
        fileId: "file one",
      })
    ).toBe(
      "https://api.example.test/root/files/organizations/org%2Facme/file%20one/download"
    )
    expect(
      buildFilePreviewUrl("https://api.example.test/", {
        organizationId: "org/acme",
        fileId: "file one",
        width: 720,
      })
    ).toBe(
      "https://api.example.test/files/organizations/org%2Facme/file%20one/preview/720"
    )
  })

  it("rejects an already-aborted XHR upload before creating a request", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      uploadFileWithProgress({
        baseUrl: "https://api.example.test",
        organizationId: "org-1",
        ownerType: "issue",
        ownerId: "issue-1",
        uploadId: "upload-1",
        file: new File(["content"], "file.txt"),
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: "AbortError" })
  })

  it("keeps upload errors typed without exposing transport internals", () => {
    expect(
      new FileUploadError({
        message: "File upload failed",
        status: 503,
        code: "service_unavailable",
        requestId: "request-1",
      })
    ).toMatchObject({
      name: "FileUploadError",
      status: 503,
      code: "service_unavailable",
      requestId: "request-1",
    })
  })
})
