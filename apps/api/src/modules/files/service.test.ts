import type { Db } from "@enterprise-agentic-saas/db"
import {
  auditLogs,
  fileCleanupJobs,
  files,
  issueActivityEvents,
  organizationFileUsage,
} from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import * as v from "valibot"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createApp } from "../../app"
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
  const client = createClient({ url: "file::memory:?cache=shared" })
  await client.executeMultiple(`
    pragma foreign_keys = off;
    drop table if exists file_cleanup_jobs;
    drop table if exists organization_file_usage;
    drop table if exists issue_file_owners;
    drop table if exists files;
    drop table if exists issue_activity_events;
    drop table if exists audit_logs;
    drop table if exists issues;
    drop table if exists member;
    drop table if exists user;
    create table user (
      id text primary key not null,
      name text not null,
      email text not null,
      email_verified integer not null default 1,
      image text,
      created_at integer not null,
      updated_at integer not null
    );
    create table member (
      id text primary key not null,
      organization_id text not null,
      user_id text not null,
      role text not null,
      created_at integer not null
    );
    create table issues (
      id text primary key not null,
      organization_id text not null,
      number integer not null,
      revision integer not null default 1,
      title text not null,
      description text not null default '',
      status text not null default 'open',
      priority text not null default 'no_priority',
      assignee_id text,
      creator_id text not null,
      labels text not null default '[]',
      due_date integer,
      created_at integer not null,
      updated_at integer not null
    );
    create unique index issues_id_organization_uidx
      on issues(id, organization_id);
    create table issue_activity_events (
      id text primary key not null,
      organization_id text not null,
      issue_id text not null,
      actor_user_id text,
      batch_id text not null,
      position integer not null default 0,
      kind text not null,
      field text,
      from_value text,
      to_value text,
      created_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer))
    );
    create table files (
      id text primary key not null,
      organization_id text not null,
      uploader_id text not null,
      upload_id text not null,
      owner_type text not null,
      object_key text not null,
      filename text not null,
      size_bytes integer not null,
      declared_content_type text not null,
      detected_image_format text,
      image_width integer,
      image_height integer,
      etag text,
      status text not null default 'pending',
      storage_object_id text,
      key_version integer,
      created_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      updated_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      constraint files_storage_v2_check check (
        (storage_object_id is null and key_version is null)
        or (
          storage_object_id is not null
          and key_version is not null
          and key_version in (1, 2)
        )
      )
    );
    create unique index files_organization_upload_uidx
      on files(organization_id, upload_id);
    create unique index files_object_key_uidx on files(object_key);
    create unique index files_storage_object_uidx
      on files(storage_object_id) where storage_object_id is not null;
    create table issue_file_owners (
      file_id text primary key not null,
      organization_id text not null,
      owner_type text not null,
      issue_id text not null
    );
    create table organization_file_usage (
      organization_id text primary key not null,
      used_bytes integer not null default 0,
      temporary_bytes integer not null default 0,
      updated_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      constraint organization_file_usage_temporary_bytes_check check (
        temporary_bytes between 0 and used_bytes
      )
    );
    create table file_cleanup_jobs (
      id text primary key not null,
      organization_id text not null,
      kind text not null,
      object_key text,
      prefix text,
      status text not null default 'pending',
      attempts integer not null default 0,
      last_error_code text,
      locked_at integer,
      next_attempt_at integer,
      created_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      completed_at integer
    );
    create unique index file_cleanup_jobs_object_key_uidx
      on file_cleanup_jobs(object_key) where kind = 'exact';
    create table audit_logs (
      id text primary key not null,
      organization_id text not null,
      actor_user_id text,
      action text not null,
      target_type text not null,
      target_id text,
      metadata text not null default '{}',
      created_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer))
    );
    pragma foreign_keys = on;
  `)
  const database: Db = drizzle({ client })
  await database.run(
    `insert into user (id, name, email, created_at, updated_at)
     values ('user-1', 'User One', 'user1@example.test', ${now.getTime()}, ${now.getTime()}),
            ('user-2', 'User Two', 'user2@example.test', ${now.getTime()}, ${now.getTime()})`
  )
  await database.run(
    `insert into member (id, organization_id, user_id, role, created_at)
     values ('member-1', 'org-1', 'user-1', 'member', ${now.getTime()})`
  )
  await database.run(
    `insert into issues (
       id, organization_id, number, title, creator_id, created_at, updated_at
     ) values ('issue-1', 'org-1', 1, 'Issue', 'user-1', ${now.getTime()}, ${now.getTime()})`
  )
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

describe("file service", () => {
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

  it("accepts 19,999,999 and 20,000,000 bytes but rejects 20,000,001", async () => {
    for (const size of [FILE_MAX_BYTES - 1, FILE_MAX_BYTES]) {
      const file = new File([new Uint8Array(size)], `boundary-${size}.bin`, {
        type: "application/octet-stream",
      })
      // oxlint-disable-next-line no-await-in-loop -- quota reservation results are asserted in order.
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

  it("converges identical retry and returns 409 for different bytes", async () => {
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

  it("records one file activity per committed add and delete", async () => {
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

    await removeFile(database, {
      actorRole: "member",
      actorUserId: "user-1",
      fileId: uploaded.dto.id,
      organizationId: "org-1",
    })

    const activities = await database.select().from(issueActivityEvents)
    expect(activities).toHaveLength(2)
    expect(activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `file:${uploaded.dto.id}:added`,
          kind: "file_added",
          toValue: "timeline-notes.txt",
        }),
        expect.objectContaining({
          id: `file:${uploaded.dto.id}:deleted`,
          kind: "file_deleted",
          fromValue: "timeline-notes.txt",
          toValue: null,
        }),
      ])
    )
    await expect(
      database.select().from(organizationFileUsage)
    ).resolves.toEqual([expect.objectContaining({ usedBytes: 0 })])
    await expect(database.select().from(fileCleanupJobs)).resolves.toHaveLength(
      1
    )
    const audits = await database.select().from(auditLogs)
    expect(audits.map(({ action }) => action)).toEqual([
      "file.uploaded",
      "file.deleted",
    ])
    expect(
      audits.every(({ metadata }) => Object.keys(metadata).length === 0)
    ).toBe(true)
  })

  it("rolls back file deletion when owner activity persistence fails", async () => {
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

  it("atomically converges concurrent reservations for one organization upload id", async () => {
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

  it("detects only the supported magic-byte image formats", async () => {
    const fixtures: Array<[string | null, number[]]> = [
      ["jpeg", [0xff, 0xd8, 0xff]],
      ["png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
      ["gif", [...new TextEncoder().encode("GIF89a")]],
      ["webp", [...new TextEncoder().encode("RIFF0000WEBP")]],
      ["avif", [0, 0, 0, 0, ...new TextEncoder().encode("ftypavif")]],
      [null, [...new TextEncoder().encode("<svg></svg>")]],
    ]
    for (const [format, bytes] of fixtures) {
      // oxlint-disable-next-line no-await-in-loop -- format table is intentionally sequential and tiny.
      await expect(
        detectImageFormat(new File([new Uint8Array(bytes)], "fixture"))
      ).resolves.toBe(format)
    }
  })

  it("keeps pending quota and preserves the provider cause", async () => {
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

  it("preserves Images failures and keeps the image upload pending", async () => {
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

  it("fails closed without deleting a pending object with unknown metadata", async () => {
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

  it("keeps AVIF download-only without requiring the Images binding", async () => {
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

  it("marks only safe MIME and closed source extensions as text previewable", () => {
    const fixtures: Array<
      [boolean, { declaredContentType: string; filename: string }]
    > = [
      [
        true,
        {
          declaredContentType: "text/plain; charset=utf-8",
          filename: "README",
        },
      ],
      [
        true,
        { declaredContentType: "application/problem+json", filename: "data" },
      ],
      [
        true,
        {
          declaredContentType: "application/octet-stream",
          filename: "source.ts",
        },
      ],
      [false, { declaredContentType: "text/html", filename: "notes.txt" }],
      [false, { declaredContentType: "text/plain", filename: "index.html" }],
      [false, { declaredContentType: "image/svg+xml", filename: "icon.txt" }],
      [
        false,
        {
          declaredContentType: "application/octet-stream",
          filename: "archive.bin",
        },
      ],
    ]
    for (const [expected, fixture] of fixtures) {
      expect(isTextPreviewableFile(fixture)).toBe(expected)
    }
  })
})

describe("file service", () => {
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

  it("serves authenticated UTF-8 text preview JSON with private headers", async () => {
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

  it("preserves a UTF-8 character crossing the text preview cap", async () => {
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

  it("returns 415 for ineligible, invalid UTF-8, and NUL text", async () => {
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

    for (const [uploadId, content] of [
      ["text-preview-invalid-utf8", new Uint8Array([0xc3, 0x28])],
      ["text-preview-nul", new TextEncoder().encode("before\0after")],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- 2 unsafe encodingsを同じcontractで確認する。
      const result = await upload(
        database,
        new File([content], `${uploadId}.txt`, { type: "text/plain" }),
        uploadId
      )
      // oxlint-disable-next-line no-await-in-loop -- fixtureごとのservice responseを確認する。
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
  })

  it("preserves R2 text preview failures", async () => {
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

  it("authorizes text preview before reading R2", async () => {
    const result = await upload(
      database,
      new File(["members only"], "notes.txt", { type: "text/plain" }),
      "text-preview-auth"
    )
    vi.mocked(storage.runtime.bucket.get).mockClear()
    const app = createApp(database)
    const path = `/files/organizations/org-1/${result.dto.id}/text-preview`

    const unauthorized = await app.handle(
      new Request(`http://localhost${path}`)
    )
    expect(unauthorized.status).toBe(401)
    const nonmember = await app.handle(
      new Request(`http://localhost${path}`, {
        headers: {
          "x-test-active-organization-id": "org-1",
          "x-test-session-created-at": now.toISOString(),
          "x-test-user-id": "user-2",
        },
      })
    )
    expect(nonmember.status).toBe(404)
    expect(storage.runtime.bucket.get).not.toHaveBeenCalled()
  })

  it("supports single Range, conditional download, and security headers", async () => {
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

    const notModified = await downloadFile(database, {
      actorRole: "member",
      actorUserId: "user-1",
      fileId: result.dto.id,
      organizationId: "org-1",
      request: new Request("https://api.example.test/file", {
        headers: { "if-none-match": partial.headers.get("etag") ?? "" },
      }),
    })
    expect(notModified.status).toBe(304)

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

  it("enforces route 401/404/409 before owner list access", async () => {
    const app = createApp(database)
    const path = "/files/organizations/org-1/owners/issue/issue-1"
    const unauthorized = await app.handle(
      new Request(`http://localhost${path}`)
    )
    expect(unauthorized.status).toBe(401)

    const nonmember = await app.handle(
      new Request(`http://localhost${path}`, {
        headers: {
          "x-test-active-organization-id": "org-1",
          "x-test-session-created-at": now.toISOString(),
          "x-test-user-id": "user-2",
        },
      })
    )
    expect(nonmember.status).toBe(404)

    const mismatch = await app.handle(
      new Request(`http://localhost${path}`, {
        headers: {
          "x-test-active-organization-id": "org-2",
          "x-test-session-created-at": now.toISOString(),
          "x-test-user-id": "user-1",
        },
      })
    )
    expect(mismatch.status).toBe(409)

    const missingOwner = await app.handle(
      new Request(
        "http://localhost/files/organizations/org-1/owners/issue/missing",
        {
          headers: {
            "x-test-active-organization-id": "org-1",
            "x-test-session-created-at": now.toISOString(),
            "x-test-user-id": "user-1",
          },
        }
      )
    )
    expect(missingOwner.status).toBe(404)
  })

  it("keeps multipart file-size validation aligned with the decimal maximum", () => {
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
