import type { Db } from "@enterprise-agentic-saas/db"
import {
  auditLogs,
  fileCleanupJobs,
  files,
  issueActivityEvents,
  issues,
  member,
  organization,
  organizationFileUsage,
  user,
} from "@enterprise-agentic-saas/db/schema"
import { eq } from "drizzle-orm"
import * as v from "valibot"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createApp } from "../../app"
import { createMigratedDb } from "../../app.test-support"
import { HttpError } from "../../errors/http-error"
import {
  FILE_MAX_BYTES,
  FILE_TEXT_PREVIEW_MAX_BYTES,
  isTextPreviewableFile,
} from "./constants"
import { detectImageFormat } from "./file-domain"
import { fileUploadBodyModel } from "./model"
import { reservePendingFile } from "./repository"
import {
  configureFileStorageRuntime,
  resetFileStorageRuntimeForTest,
  type FileImagesBinding,
  type FilePreviewBinding,
  type FileR2Bucket,
  type FileR2Object,
  type FileR2PutValue,
  type FileStorageRuntime,
} from "./runtime"
import {
  downloadFile,
  previewTextFile,
  removeFile,
  uploadFile,
} from "./service.test-support"

const now = new Date("2026-07-18T00:00:00.000Z")

const createDatabase = async (): Promise<Db> => {
  const database = await createMigratedDb()
  await database.insert(user).values([
    {
      id: "user-1",
      name: "User One",
      email: "user1@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "user-2",
      name: "User Two",
      email: "user2@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
  ])
  await database.insert(organization).values({
    id: "org-1",
    name: "Organization One",
    slug: "organization-one",
    createdAt: now,
  })
  await database.insert(member).values({
    id: "member-1",
    organizationId: "org-1",
    userId: "user-1",
    role: "member",
    createdAt: now,
  })
  await database.insert(issues).values({
    id: "issue-1",
    organizationId: "org-1",
    number: 1,
    title: "Issue",
    creatorId: "user-1",
    createdAt: now,
    updatedAt: now,
  })
  return database
}

type StoredObject = {
  bytes: Uint8Array
  metadata: Record<string, string>
  object: FileR2Object
}

const readBytes = async (value: FileR2PutValue) =>
  new Uint8Array(
    await (value instanceof Blob
      ? value.arrayBuffer()
      : new Response(value).arrayBuffer())
  )

const imageFormat = async (stream: ReadableStream<Uint8Array>) => {
  const file = new File([await readBytes(stream)], "image")
  return (await detectImageFormat(file)) ?? "unknown"
}

const createRuntime = () => {
  const objects = new Map<string, StoredObject>()
  let etagSequence = 0
  const bucket: FileR2Bucket = {
    head: vi.fn<FileR2Bucket["head"]>(
      async (key) => objects.get(key)?.object ?? null
    ),
    get: vi.fn<FileR2Bucket["get"]>(async (key, options) => {
      const stored = objects.get(key)
      if (!stored) return null
      const offset = options?.range?.offset ?? 0
      const length = options?.range?.length ?? stored.object.size - offset
      const bytes = stored.bytes.slice(offset, offset + length)
      return {
        ...stored.object,
        body: new Blob([bytes]).stream(),
        ...(options?.range ? { range: { offset, length: bytes.length } } : {}),
      }
    }),
    put: vi.fn<FileR2Bucket["put"]>(async (key, stream, options) => {
      if (objects.has(key) && options.onlyIf?.get("if-none-match") === "*") {
        return null
      }
      const source = await readBytes(stream)
      const retained =
        source.byteLength <= 1_000_000 ? source : new Uint8Array(0)
      etagSequence += 1
      const object: FileR2Object = {
        key,
        size: source.byteLength,
        etag: `etag-${etagSequence}`,
        httpEtag: `"etag-${etagSequence}"`,
        customMetadata: { ...options.customMetadata },
      }
      objects.set(key, {
        bytes: retained,
        metadata: { ...options.customMetadata },
        object,
      })
      return object
    }),
    delete: vi.fn<FileR2Bucket["delete"]>(async (keys) => {
      for (const key of typeof keys === "string" ? [keys] : keys) {
        objects.delete(key)
      }
    }),
    list: vi.fn<FileR2Bucket["list"]>(async ({ prefix }) => ({
      objects: [...objects.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((key) => ({ key })),
      truncated: false,
    })),
  }
  type ImagesInput = ReturnType<FileImagesBinding["input"]>
  type ImagesTransform = ReturnType<ImagesInput["transform"]>
  const images: FileImagesBinding = {
    info: vi.fn<FileImagesBinding["info"]>(async (stream) => {
      const bytes = await readBytes(stream)
      return {
        fileSize: bytes.byteLength,
        format: await imageFormat(new Blob([bytes]).stream()),
        height: 300,
        width: 500,
      }
    }),
    input: vi.fn<FileImagesBinding["input"]>(() => ({
      transform: vi.fn<ImagesInput["transform"]>(() => ({
        output: vi.fn<ImagesTransform["output"]>(async () => ({
          response: () =>
            new Response(new Uint8Array([0x57, 0x45, 0x42, 0x50]), {
              headers: { "Content-Type": "image/webp" },
            }),
        })),
      })),
    })),
  }
  const previewFetch = vi.fn<FilePreviewBinding["fetch"]>(
    async () =>
      new Response(new Uint8Array([0x57, 0x45, 0x42, 0x50]), {
        headers: {
          "Cache-Control": "public, max-age=2592000, must-revalidate",
          "Content-Length": "4",
          "Content-Type": "image/webp",
          ETag: `"${"a".repeat(64)}"`,
          "Set-Cookie": "internal=secret",
          "X-Internal-Cache": "hit",
        },
      })
  )
  const runtime: FileStorageRuntime = {
    bucket,
    images,
    previews: { fetch: previewFetch },
  }
  return { objects, previewFetch, runtime }
}

const upload = (
  database: Db,
  file: File,
  uploadId: string,
  actorRole: "admin" | "member" | "owner" = "member"
) =>
  uploadFile(database, {
    actorRole,
    actorUserId: "user-1",
    file,
    fileSize: file.size,
    organizationId: "org-1",
    ownerId: "issue-1",
    ownerType: "issue",
    uploadId,
  })

describe("file serviceの契約", () => {
  let database: Db
  let storage: ReturnType<typeof createRuntime>

  beforeEach(async () => {
    database = await createDatabase()
    storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)
  })

  afterEach(() => {
    resetFileStorageRuntimeForTest()
  })

  it("19,999,999 byteと20,000,000 byteを受理して20,000,001 byteを拒否する", async () => {
    for (const size of [FILE_MAX_BYTES - 1, FILE_MAX_BYTES]) {
      const file = new File([new Uint8Array(size)], `boundary-${size}.bin`, {
        type: "application/octet-stream",
      })
      // oxlint-disable-next-line no-await-in-loop -- quota予約結果を順番に検査する
      await expect(
        upload(database, file, `upload-${size}`)
      ).resolves.toMatchObject({ created: true, dto: { sizeBytes: size } })
    }

    const tooLarge = new File(
      [new Uint8Array(FILE_MAX_BYTES + 1)],
      "too-large.bin"
    )
    await expect(
      upload(database, tooLarge, "upload-too-large")
    ).rejects.toMatchObject({ code: "validation_error" })
  })

  it("同一再試行を収束して異なるbyteへ409を返す", async () => {
    const original = new File(["hello"], "same.txt", { type: "text/plain" })
    await expect(upload(database, original, "retry-1")).resolves.toMatchObject({
      created: true,
    })
    await expect(
      upload(
        database,
        new File(["hello"], "same.txt", { type: "text/plain" }),
        "retry-1"
      )
    ).resolves.toMatchObject({ created: false })
    await expect(
      upload(
        database,
        new File(["jello"], "same.txt", { type: "text/plain" }),
        "retry-1"
      )
    ).rejects.toMatchObject({
      code: "conflict",
    })
  })

  it("コミット済みアップロードと冪等な再試行でファイル追加履歴を1件記録する", async () => {
    const source = new File(["timeline"], "timeline-notes.txt", {
      type: "text/plain",
    })
    const uploaded = await upload(database, source, "activity-upload")
    await expect(
      upload(
        database,
        new File(["timeline"], "timeline-notes.txt", {
          type: "text/plain",
        }),
        "activity-upload"
      )
    ).resolves.toMatchObject({ created: false })

    await expect(
      database.select().from(issueActivityEvents)
    ).resolves.toMatchObject([
      {
        id: `file:${uploaded.dto.id}:added`,
        issueId: "issue-1",
        actorUserId: "user-1",
        batchId: `file:${uploaded.dto.id}:added`,
        kind: "file_added",
        field: null,
        fromValue: null,
        toValue: "timeline-notes.txt",
      },
    ])
  })

  it("ファイル削除で履歴を記録して使用量解放とオブジェクト後処理を予約する", async () => {
    const uploaded = await upload(
      database,
      new File(["timeline"], "timeline-notes.txt", { type: "text/plain" }),
      "delete-activity-upload"
    )
    await removeFile(database, {
      actorRole: "member",
      actorUserId: "user-1",
      fileId: uploaded.dto.id,
      organizationId: "org-1",
    })

    await expect(
      database
        .select()
        .from(issueActivityEvents)
        .where(eq(issueActivityEvents.kind, "file_deleted"))
    ).resolves.toEqual([
      expect.objectContaining({
        id: `file:${uploaded.dto.id}:deleted`,
        fromValue: "timeline-notes.txt",
        toValue: null,
      }),
    ])
    await expect(
      database.select().from(organizationFileUsage)
    ).resolves.toEqual([expect.objectContaining({ usedBytes: 0 })])
    await expect(database.select().from(fileCleanupJobs)).resolves.toHaveLength(
      1
    )
    await expect(
      database
        .select({ metadata: auditLogs.metadata })
        .from(auditLogs)
        .where(eq(auditLogs.action, "file.deleted"))
    ).resolves.toEqual([{ metadata: {} }])
  })

  it("owner activity永続化失敗時にfile削除をrollbackする", async () => {
    const uploaded = await upload(
      database,
      new File(["retain"], "retain-on-failure.txt", { type: "text/plain" }),
      "activity-rollback"
    )
    const deletionActivityId = `file:${uploaded.dto.id}:deleted`
    await database.insert(issueActivityEvents).values({
      id: deletionActivityId,
      organizationId: "org-1",
      issueId: "issue-1",
      actorUserId: "user-1",
      batchId: deletionActivityId,
      kind: "file_deleted",
      fromValue: "collision.txt",
    })

    const removalError = await removeFile(database, {
      actorRole: "member",
      actorUserId: "user-1",
      fileId: uploaded.dto.id,
      organizationId: "org-1",
    }).then(
      () => undefined,
      (cause: unknown) => cause
    )
    expect(removalError).toBeInstanceOf(Error)
    expect(removalError).not.toBeInstanceOf(HttpError)

    await expect(database.select().from(files)).resolves.toMatchObject([
      { id: uploaded.dto.id, status: "ready" },
    ])
    await expect(
      database.select().from(organizationFileUsage)
    ).resolves.toEqual([
      expect.objectContaining({ usedBytes: uploaded.dto.sizeBytes }),
    ])
    await expect(database.select().from(fileCleanupJobs)).resolves.toEqual([])
    await expect(database.select().from(auditLogs)).resolves.toMatchObject([
      { action: "file.uploaded", metadata: {} },
    ])
  })

  it("1つのorganization upload idへの同時予約を原子的に収束する", async () => {
    const common = {
      declaredContentType: "text/plain",
      detectedImageFormat: null,
      filename: "concurrent.txt",
      organizationId: "org-1",
      ownerId: "issue-1",
      ownerType: "issue" as const,
      sizeBytes: 10,
      uploaderId: "user-1",
      uploadId: "concurrent-1",
    }
    const reservations = await Promise.all([
      reservePendingFile(database, {
        ...common,
        fileId: "concurrent-file-1",
        objectKey: "organizations/org-1/files/issue/issue-1/concurrent-file-1",
      }),
      reservePendingFile(database, {
        ...common,
        fileId: "concurrent-file-2",
        objectKey: "organizations/org-1/files/issue/issue-1/concurrent-file-2",
      }),
    ])
    expect(reservations.map(({ created }) => created).toSorted()).toEqual([
      false,
      true,
    ])
    expect(new Set(reservations.map(({ file }) => file.id)).size).toBe(1)
    await expect(
      database.select().from(organizationFileUsage)
    ).resolves.toMatchObject([{ usedBytes: 10 }])
  })

  it("対応済みmagic-byte画像形式だけを検出する", async () => {
    const fixtures: Array<[string | null, number[]]> = [
      ["jpeg", [0xff, 0xd8, 0xff]],
      ["png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
      ["gif", [...new TextEncoder().encode("GIF89a")]],
      ["webp", [...new TextEncoder().encode("RIFF0000WEBP")]],
      ["avif", [0, 0, 0, 0, ...new TextEncoder().encode("ftypavif")]],
      [null, [...new TextEncoder().encode("<svg></svg>")]],
    ]
    for (const [format, bytes] of fixtures) {
      // oxlint-disable-next-line no-await-in-loop -- 小さいformat表を意図的に直列実行する
      await expect(
        detectImageFormat(new File([new Uint8Array(bytes)], "fixture"))
      ).resolves.toBe(format)
    }
  })

  it("pending quotaとprovider causeを維持する", async () => {
    const raw = new Error("secret bucket object and provider token")
    vi.mocked(storage.runtime.bucket.put).mockRejectedValueOnce(raw)

    let caught: unknown
    try {
      await upload(database, new File(["failure"], "failure.txt"), "failure-1")
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(HttpError)
    expect(caught).toMatchObject({
      code: "service_unavailable",
    })
    expect(caught).toHaveProperty("cause", raw)
    expect(JSON.stringify(caught)).not.toContain("secret bucket")
    await expect(database.select().from(files)).resolves.toMatchObject([
      { status: "pending" },
    ])
    await expect(
      database.select().from(organizationFileUsage)
    ).resolves.toMatchObject([{ usedBytes: 7 }])
  })

  it("Images失敗を維持して画像uploadをpendingに保つ", async () => {
    const raw = new Error("provider token and private image detail")
    vi.mocked(storage.runtime.images.info).mockRejectedValueOnce(raw)
    const png = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      "broken.png",
      { type: "image/png" }
    )

    let caught: unknown
    try {
      await upload(database, png, "images-failure")
    } catch (error) {
      caught = error
    }
    expect(caught).toMatchObject({
      code: "service_unavailable",
    })
    expect(caught).toHaveProperty("cause", raw)
    expect(JSON.stringify(caught)).not.toContain("provider token")
    await expect(database.select().from(files)).resolves.toMatchObject([
      { detectedImageFormat: "png", status: "pending" },
    ])
    await expect(
      upload(database, png, "images-failure")
    ).resolves.toMatchObject({
      created: false,
      dto: { imageHeight: 300, imageWidth: 500, previewable: true },
    })
  })

  it("未知metadataのpending objectを削除せずfail closedにする", async () => {
    vi.mocked(storage.runtime.bucket.put).mockImplementationOnce(
      async (key, stream, options) => {
        const bytes = await readBytes(stream)
        const object: FileR2Object = {
          key,
          size: bytes.byteLength,
          etag: "etag-unknown-metadata",
          httpEtag: '"etag-unknown-metadata"',
          customMetadata: {
            ...options.customMetadata,
            unknown: "must-not-be-accepted",
          },
        }
        storage.objects.set(key, {
          bytes,
          metadata: object.customMetadata ?? {},
          object,
        })
        return object
      }
    )

    await expect(
      upload(database, new File(["content"], "unknown.txt"), "unknown-metadata")
    ).rejects.toMatchObject({
      cause: undefined,
      code: "service_unavailable",
    })
    expect(storage.runtime.bucket.delete).not.toHaveBeenCalled()
    expect(storage.objects.size).toBe(1)
    await expect(database.select().from(files)).resolves.toMatchObject([
      { status: "pending" },
    ])
  })

  it("Images bindingを要求せずAVIFをdownload限定に保つ", async () => {
    const avif = new File(
      [new Uint8Array([0, 0, 0, 0, ...new TextEncoder().encode("ftypavif")])],
      "image.avif",
      { type: "image/avif" }
    )
    await expect(upload(database, avif, "avif-1")).resolves.toMatchObject({
      dto: {
        imageHeight: null,
        imageWidth: null,
        previewable: false,
        textPreviewable: false,
      },
    })
    expect(storage.runtime.images.info).not.toHaveBeenCalled()
  })

  it.each([
    {
      declaredContentType: "text/plain; charset=utf-8",
      expected: true,
      filename: "README",
      label: "text MIMEと拡張子なし",
    },
    {
      declaredContentType: "application/problem+json",
      expected: true,
      filename: "data",
      label: "JSON系MIMEと拡張子なし",
    },
    {
      declaredContentType: "application/octet-stream",
      expected: true,
      filename: "source.ts",
      label: "binary MIMEとsource拡張子",
    },
    {
      declaredContentType: "text/html",
      expected: false,
      filename: "notes.txt",
      label: "HTMLのMIME",
    },
    {
      declaredContentType: "text/plain",
      expected: false,
      filename: "index.html",
      label: "HTML拡張子",
    },
    {
      declaredContentType: "image/svg+xml",
      expected: false,
      filename: "icon.txt",
      label: "SVGのMIME",
    },
    {
      declaredContentType: "application/octet-stream",
      expected: false,
      filename: "archive.bin",
      label: "許可外binary拡張子",
    },
  ] as const)(
    "$labelのtext preview可否を判定する",
    ({ declaredContentType, expected, filename }) => {
      expect(isTextPreviewableFile({ declaredContentType, filename })).toBe(
        expected
      )
    }
  )
})

describe("file serviceの契約", () => {
  let database: Db
  let storage: ReturnType<typeof createRuntime>

  beforeEach(async () => {
    database = await createDatabase()
    storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)
  })

  afterEach(() => {
    resetFileStorageRuntimeForTest()
  })

  it("認証済みUTF-8 text preview JSONをprivate header付きで返す", async () => {
    const result = await upload(
      database,
      new File(["hello\nworld"], "notes.txt", {
        type: "text/plain; charset=utf-8",
      }),
      "text-preview-1"
    )
    expect(result.dto).toMatchObject({
      previewable: false,
      textPreviewable: true,
    })

    const app = createApp(database)
    const response = await app.handle(
      new Request(
        `http://localhost/files/organizations/org-1/${result.dto.id}/text-preview`,
        {
          headers: {
            "x-test-active-organization-id": "org-1",
            "x-test-session-created-at": now.toISOString(),
            "x-test-user-id": "user-1",
          },
        }
      )
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      content: "hello\nworld",
      truncated: false,
    })
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    expect(response.headers.get("cross-origin-resource-policy")).toBe(
      "same-site"
    )
  })

  it("text preview上限をまたぐUTF-8文字を維持する", async () => {
    const prefix = new Uint8Array(FILE_TEXT_PREVIEW_MAX_BYTES - 1).fill(0x61)
    const emoji = new TextEncoder().encode("😀")
    const bytes = new Uint8Array(prefix.byteLength + emoji.byteLength + 1)
    bytes.set(prefix)
    bytes.set(emoji, prefix.byteLength)
    bytes[bytes.byteLength - 1] = 0x7a
    const result = await upload(
      database,
      new File([bytes], "large.txt", { type: "text/plain" }),
      "text-preview-boundary"
    )
    const stored = [...storage.objects.values()].find(
      ({ metadata }) => metadata.fileId === result.dto.id
    )
    if (!stored) throw new Error("Stored test object is required")
    stored.bytes = bytes
    vi.mocked(storage.runtime.bucket.get).mockClear()

    const preview = await previewTextFile(database, {
      actorRole: "member",
      actorUserId: "user-1",
      fileId: result.dto.id,
      organizationId: "org-1",
    })
    expect(preview.content.endsWith("😀")).toBe(true)
    expect(new TextEncoder().encode(preview.content)).toHaveLength(
      FILE_TEXT_PREVIEW_MAX_BYTES + 3
    )
    expect(preview.truncated).toBe(true)
    expect(storage.runtime.bucket.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        range: { offset: 0, length: FILE_TEXT_PREVIEW_MAX_BYTES + 3 },
      })
    )
  })

  it("対象外MIMEのテキストプレビューをR2読取前に415で拒否する", async () => {
    const ineligible = await upload(
      database,
      new File(["<p>html</p>"], "page.html", { type: "text/html" }),
      "text-preview-html"
    )
    vi.mocked(storage.runtime.bucket.get).mockClear()
    await expect(
      previewTextFile(database, {
        actorRole: "member",
        actorUserId: "user-1",
        fileId: ineligible.dto.id,
        organizationId: "org-1",
      })
    ).rejects.toMatchObject({
      code: "unsupported_media_type",
    })
    expect(storage.runtime.bucket.get).not.toHaveBeenCalled()
  })

  it.each([
    {
      content: new Uint8Array([0xc3, 0x28]),
      label: "不正UTF-8",
      uploadId: "text-preview-invalid-utf8",
    },
    {
      content: new TextEncoder().encode("before\0after"),
      label: "NUL文字",
      uploadId: "text-preview-nul",
    },
  ])(
    "$labelを含むテキストプレビューへ415を返す",
    async ({ content, uploadId }) => {
      const result = await upload(
        database,
        new File([content], `${uploadId}.txt`, { type: "text/plain" }),
        uploadId
      )
      await expect(
        previewTextFile(database, {
          actorRole: "member",
          actorUserId: "user-1",
          fileId: result.dto.id,
          organizationId: "org-1",
        })
      ).rejects.toMatchObject({
        code: "unsupported_media_type",
      })
    }
  )

  it("R2 text preview失敗を維持する", async () => {
    const result = await upload(
      database,
      new File(["secret-free content"], "notes.txt", { type: "text/plain" }),
      "text-preview-r2-failure"
    )
    const raw = new Error("private object key and provider token")
    vi.mocked(storage.runtime.bucket.get).mockRejectedValueOnce(raw)

    let caught: unknown
    try {
      await previewTextFile(database, {
        actorRole: "member",
        actorUserId: "user-1",
        fileId: result.dto.id,
        organizationId: "org-1",
      })
    } catch (error) {
      caught = error
    }
    expect(caught).toMatchObject({
      code: "service_unavailable",
    })
    expect(caught).toHaveProperty("cause", raw)
    expect(JSON.stringify(caught)).not.toContain("provider token")
  })

  it.each([
    {
      headers: undefined,
      label: "未認証request",
      status: 401,
      uploadId: "text-preview-unauthenticated",
    },
    {
      headers: {
        "x-test-active-organization-id": "org-1",
        "x-test-session-created-at": now.toISOString(),
        "x-test-user-id": "user-2",
      },
      label: "非memberのrequest",
      status: 404,
      uploadId: "text-preview-nonmember",
    },
  ] as const)(
    "$labelをR2読取前に拒否する",
    async ({ headers, status, uploadId }) => {
      const result = await upload(
        database,
        new File(["members only"], "notes.txt", { type: "text/plain" }),
        uploadId
      )
      vi.mocked(storage.runtime.bucket.get).mockClear()
      const app = createApp(database)
      const path = `/files/organizations/org-1/${result.dto.id}/text-preview`

      const response = await app.handle(
        new Request(`http://localhost${path}`, { headers })
      )

      expect(response.status).toBe(status)
      expect(storage.runtime.bucket.get).not.toHaveBeenCalled()
    }
  )

  it("単一Rangeへpartial responseとsecurity headerを返す", async () => {
    const result = await upload(
      database,
      new File(["0123456789"], "report.txt", { type: "text/plain" }),
      "download-1"
    )
    const partial = await downloadFile(database, {
      actorRole: "member",
      actorUserId: "user-1",
      fileId: result.dto.id,
      organizationId: "org-1",
      request: new Request("https://api.example.test/file", {
        headers: { range: "bytes=2-5" },
      }),
    })
    expect(partial.status).toBe(206)
    expect(await partial.text()).toBe("2345")
    expect(partial.headers.get("content-range")).toBe("bytes 2-5/10")
    expect(partial.headers.get("content-type")).toBe("application/octet-stream")
    expect(partial.headers.get("x-content-type-options")).toBe("nosniff")
    expect(partial.headers.get("cross-origin-resource-policy")).toBe(
      "same-site"
    )
    expect(partial.headers.get("content-disposition")).toContain("attachment")
  })

  it("一致するIf-None-Matchへ304を返す", async () => {
    const result = await upload(
      database,
      new File(["0123456789"], "report.txt", { type: "text/plain" }),
      "download-conditional"
    )
    const current = await downloadFile(database, {
      actorRole: "member",
      actorUserId: "user-1",
      fileId: result.dto.id,
      organizationId: "org-1",
      request: new Request("https://api.example.test/file"),
    })
    const notModified = await downloadFile(database, {
      actorRole: "member",
      actorUserId: "user-1",
      fileId: result.dto.id,
      organizationId: "org-1",
      request: new Request("https://api.example.test/file", {
        headers: { "if-none-match": current.headers.get("etag") ?? "" },
      }),
    })
    expect(notModified.status).toBe(304)
  })

  it("複数Rangeを416で拒否する", async () => {
    const result = await upload(
      database,
      new File(["0123456789"], "report.txt", { type: "text/plain" }),
      "download-multiple-ranges"
    )
    const unsatisfiable = await downloadFile(database, {
      actorRole: "member",
      actorUserId: "user-1",
      fileId: result.dto.id,
      organizationId: "org-1",
      request: new Request("https://api.example.test/file", {
        headers: { range: "bytes=0-1,4-5" },
      }),
    })
    expect(unsatisfiable.status).toBe(416)
  })

  it.each([
    {
      headers: undefined,
      label: "未認証request",
      ownerId: "issue-1",
      status: 401,
    },
    {
      headers: {
        "x-test-active-organization-id": "org-1",
        "x-test-session-created-at": now.toISOString(),
        "x-test-user-id": "user-2",
      },
      label: "memberでない利用者",
      ownerId: "issue-1",
      status: 404,
    },
    {
      headers: {
        "x-test-active-organization-id": "org-2",
        "x-test-session-created-at": now.toISOString(),
        "x-test-user-id": "user-1",
      },
      label: "active organizationが一致しない利用者",
      ownerId: "issue-1",
      status: 409,
    },
    {
      headers: {
        "x-test-active-organization-id": "org-1",
        "x-test-session-created-at": now.toISOString(),
        "x-test-user-id": "user-1",
      },
      label: "存在しないowner",
      ownerId: "missing",
      status: 404,
    },
  ] as const)(
    "$labelのowner一覧取得を$statusで拒否する",
    async ({ headers, ownerId, status }) => {
      const app = createApp(database)
      const response = await app.handle(
        new Request(
          `http://localhost/files/organizations/org-1/owners/issue/${ownerId}`,
          headers ? { headers } : undefined
        )
      )

      expect(response.status).toBe(status)
    }
  )

  it("multipart file size validationを10進最大値と一致させる", () => {
    const file = new File(["x"], "x.txt")
    expect(
      v.safeParse(fileUploadBodyModel, {
        file,
        fileSize: FILE_MAX_BYTES,
        uploadId: "upload-model",
      }).success
    ).toBe(true)
    expect(
      v.safeParse(fileUploadBodyModel, {
        file,
        fileSize: FILE_MAX_BYTES + 1,
        uploadId: "upload-model",
      }).success
    ).toBe(false)
  })
})
