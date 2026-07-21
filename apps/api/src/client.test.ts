import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest"

import {
  buildFileDownloadUrl,
  buildFilePreviewUrl,
  buildOrganizationProfileImageUrl,
  buildUserProfileImageUrl,
  FileUploadError,
  uploadOrganizationProfileImageWithProgress,
  uploadFileWithProgress,
  uploadUserProfileImageWithProgress,
  type CreateApiClientOptions,
  type FileUploadProgress,
  type ProfileImageDto,
  type TextFilePreviewDto,
} from "./client"

class SuccessfulXMLHttpRequest {
  static instances: SuccessfulXMLHttpRequest[] = []

  readonly listeners = new Map<string, () => void>()
  readonly uploadListeners = new Map<
    string,
    (event: {
      lengthComputable: boolean
      loaded: number
      total: number
    }) => void
  >()
  readonly upload = {
    addEventListener: (
      name: string,
      listener: (event: {
        lengthComputable: boolean
        loaded: number
        total: number
      }) => void
    ) => this.uploadListeners.set(name, listener),
  }
  method = ""
  url = ""
  withCredentials = false
  responseType = ""
  status = 201
  response = {
    id: "profile-image-1",
    profileImage: "/files/profile-images/users/user-1?v=profile-image-1",
    width: 512,
    height: 512,
    updatedAt: "2026-07-22T00:00:00.000Z",
  }
  sentBody: unknown

  constructor() {
    SuccessfulXMLHttpRequest.instances.push(this)
  }

  open(method: string, url: string) {
    this.method = method
    this.url = url
  }

  addEventListener(name: string, listener: () => void) {
    this.listeners.set(name, listener)
  }

  send(body: unknown) {
    this.sentBody = body
    const file = body instanceof FormData ? body.get("file") : null
    const total = file instanceof File ? file.size : 0
    this.uploadListeners.get("progress")?.({
      lengthComputable: true,
      loaded: total,
      total,
    })
    this.listeners.get("load")?.()
  }

  abort() {
    this.listeners.get("abort")?.()
  }
}

afterEach(() => {
  SuccessfulXMLHttpRequest.instances = []
  vi.unstubAllGlobals()
})

it("does not expose Eden date parsing as a consumer option", () => {
  type HasParseDate = "parseDate" extends keyof CreateApiClientOptions
    ? true
    : false

  expectTypeOf<HasParseDate>().toEqualTypeOf<false>()
})

describe("file client helpers", () => {
  it("exports the text preview DTO through the client boundary", () => {
    expectTypeOf<TextFilePreviewDto>().toEqualTypeOf<{
      content: string
      truncated: boolean
    }>()
  })

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

  it("exports the profile image DTO and builds stable subject URLs", () => {
    expectTypeOf<ProfileImageDto>().toEqualTypeOf<{
      id: string
      profileImage: string
      width: 512
      height: 512
      updatedAt: string
    }>()
    expect(
      buildUserProfileImageUrl("https://api.example.test/root/", {
        revision: "revision/one",
        userId: "user/acme",
      })
    ).toBe(
      "https://api.example.test/root/files/profile-images/users/user%2Facme?v=revision%2Fone"
    )
    expect(
      buildOrganizationProfileImageUrl("https://api.example.test/root/", {
        organizationId: "org/acme",
        revision: "revision one",
      })
    ).toBe(
      "https://api.example.test/root/files/profile-images/organizations/org%2Facme?v=revision%20one"
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

  it("rejects already-aborted profile image uploads before XHR", async () => {
    const controller = new AbortController()
    controller.abort()
    const file = new File(["content"], "profile.png", { type: "image/png" })
    await expect(
      uploadUserProfileImageWithProgress({
        baseUrl: "https://api.example.test",
        uploadId: "upload-user-profile",
        file,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: "AbortError" })
    await expect(
      uploadOrganizationProfileImageWithProgress({
        baseUrl: "https://api.example.test",
        organizationId: "org-1",
        uploadId: "upload-organization-profile",
        file,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: "AbortError" })
  })

  it("encapsulates credentialed profile image XHR URLs, form fields, and progress", async () => {
    vi.stubGlobal("XMLHttpRequest", SuccessfulXMLHttpRequest)
    const file = new File(["png"], "profile.png", { type: "image/png" })
    const onProgress = vi.fn<(progress: FileUploadProgress) => void>()

    await expect(
      uploadUserProfileImageWithProgress({
        baseUrl: "https://api.example.test/root/",
        uploadId: "upload-user",
        file,
        onProgress,
      })
    ).resolves.toMatchObject({
      id: "profile-image-1",
      profileImage: "/files/profile-images/users/user-1?v=profile-image-1",
    })
    const userRequest = SuccessfulXMLHttpRequest.instances[0]
    expect(userRequest).toMatchObject({
      method: "POST",
      url: "https://api.example.test/root/files/profile-images/users/me",
      withCredentials: true,
      responseType: "json",
    })
    expect(userRequest?.sentBody).toBeInstanceOf(FormData)
    if (!(userRequest?.sentBody instanceof FormData)) {
      throw new Error("Expected profile image multipart form")
    }
    expect(userRequest.sentBody.get("uploadId")).toBe("upload-user")
    expect(userRequest.sentBody.get("fileSize")).toBe(String(file.size))
    expect(userRequest.sentBody.get("file")).toBe(file)
    expect(onProgress).toHaveBeenCalledWith({
      loaded: file.size,
      total: file.size,
      percent: 100,
    })

    await expect(
      uploadOrganizationProfileImageWithProgress({
        baseUrl: "https://api.example.test/root/",
        organizationId: "org/acme",
        uploadId: "upload-org",
        file,
      })
    ).resolves.toMatchObject({ id: "profile-image-1" })
    expect(SuccessfulXMLHttpRequest.instances[1]?.url).toBe(
      "https://api.example.test/root/files/profile-images/organizations/org%2Facme"
    )
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
