import type { Db } from "@enterprise-agentic-saas/db"
import {
  auditLogs,
  member,
  organization,
  profileImageCleanupJobs,
  profileImages,
  session,
  user,
} from "@enterprise-agentic-saas/db/schema"
import * as dbSchema from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  configureFileStorageRuntime,
  resetFileStorageRuntimeForTest,
  type FileR2Object,
  type FileR2PutValue,
  type FileStorageRuntime,
} from "../files/public"
import {
  PROFILE_IMAGE_OUTPUT_MAX_BYTES,
  profileImageObjectKey,
} from "./constants"
import { createProfileImagesApplication } from "./module"
import {
  finalizePendingProfileImage,
  reservePendingProfileImage,
} from "./repository"

type ProfileImagesTestApplication = ReturnType<
  typeof createProfileImagesApplication
>

const profileImagesApplication = (db: Db) => createProfileImagesApplication(db)

const readProfileImage = (
  db: Db,
  input: Parameters<ProfileImagesTestApplication["readProfileImage"]>[0]
) => profileImagesApplication(db).readProfileImage(input)

const removeProfileImage = (
  db: Db,
  input: Parameters<ProfileImagesTestApplication["removeProfileImage"]>[0]
) => profileImagesApplication(db).removeProfileImage(input)

const uploadProfileImage = (
  db: Db,
  input: Parameters<ProfileImagesTestApplication["uploadProfileImage"]>[0]
) => profileImagesApplication(db).uploadProfileImage(input)

const pngHeader = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const readStream = async (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- test R2 streamを最後まで読む。
      const result = await reader.read()
      if (result.done) break
      chunks.push(result.value)
      size += result.value.byteLength
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

const readPutValue = async (value: FileR2PutValue) =>
  value instanceof Blob
    ? new Uint8Array(await value.arrayBuffer())
    : readStream(value)

const streamOf = (bytes: Uint8Array) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })

type StoredObject = FileR2Object & {
  bytes: Uint8Array
  httpMetadata: { contentType: string }
}

const createRuntime = (onPut?: () => Promise<void>) => {
  const objects = new Map<string, StoredObject>()
  const info = vi.fn<FileStorageRuntime["images"]["info"]>(async (stream) => {
    const bytes = await readStream(stream)
    return {
      format: "png",
      fileSize: bytes.byteLength,
      width: 512,
      height: 512,
    }
  })
  const input = vi.fn<FileStorageRuntime["images"]["input"]>((stream) => ({
    transform: () => ({
      output: async () => {
        const source = await readStream(stream)
        const encoded = new Uint8Array([0x57, 0x45, 0x42, 0x50, ...source])
        return {
          response: () =>
            new Response(streamOf(encoded), {
              headers: { "Content-Type": "image/webp" },
            }),
        }
      },
    }),
  }))
  const runtime: FileStorageRuntime = {
    bucket: {
      head: vi.fn<FileStorageRuntime["bucket"]["head"]>(
        async (key) => objects.get(key) ?? null
      ),
      get: vi.fn<FileStorageRuntime["bucket"]["get"]>(async (key) => {
        const object = objects.get(key)
        return object ? { ...object, body: streamOf(object.bytes) } : null
      }),
      put: vi.fn<FileStorageRuntime["bucket"]["put"]>(
        async (key, value, options) => {
          if (objects.has(key)) return null
          const bytes = await readPutValue(value)
          const object: StoredObject = {
            key,
            size: bytes.byteLength,
            etag: `etag-${objects.size + 1}`,
            httpEtag: `"etag-${objects.size + 1}"`,
            customMetadata: options.customMetadata,
            httpMetadata: options.httpMetadata,
            bytes,
          }
          objects.set(key, object)
          await onPut?.()
          return object
        }
      ),
      delete: vi.fn<FileStorageRuntime["bucket"]["delete"]>(async (keys) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          objects.delete(key)
        }
      }),
      list: vi.fn<FileStorageRuntime["bucket"]["list"]>(async ({ prefix }) => ({
        objects: [...objects.keys()]
          .filter((key) => key.startsWith(prefix))
          .map((key) => ({ key })),
        truncated: false,
      })),
    },
    images: { info, input },
  }
  return { info, input, objects, runtime }
}

const createDatabase = async (): Promise<Db> => {
  // libSQL transactionは別connectionを使うため、shared in-memory DBにする。
  const client = createClient({ url: "file::memory:?cache=shared" })
  await client.executeMultiple(`
    pragma foreign_keys = on;
    drop table if exists profile_image_cleanup_jobs;
    drop table if exists profile_images;
    drop table if exists audit_logs;
    drop table if exists session;
    drop table if exists member;
    drop table if exists organization;
    drop table if exists user;
    create table user (
      id text primary key,
      name text not null,
      email text not null unique,
      email_verified integer not null,
      image text,
      created_at integer not null,
      updated_at integer not null
    );
    create table organization (
      id text primary key,
      name text not null,
      slug text not null unique,
      logo text,
      created_at integer not null,
      metadata text
    );
    create table member (
      id text primary key,
      organization_id text not null,
      user_id text not null,
      role text not null,
      created_at integer not null
    );
    create table session (
      id text primary key,
      expires_at integer not null,
      token text not null unique,
      created_at integer not null,
      updated_at integer not null,
      ip_address text,
      user_agent text,
      user_id text not null,
      active_organization_id text
    );
    create table audit_logs (
      id text primary key,
      organization_id text not null,
      actor_user_id text,
      action text not null,
      target_type text not null,
      target_id text,
      metadata text not null default '{}',
      created_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer))
    );
    create table profile_images (
      id text primary key,
      subject_type text not null,
      subject_id text not null,
      user_id text references user(id) on delete cascade,
      organization_id text references organization(id) on delete cascade,
      upload_id text not null,
      source_hash text not null,
      version integer not null,
      object_key text not null unique,
      fallback_url text,
      etag text,
      status text not null default 'pending',
      created_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      updated_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer))
    );
    create unique index profile_images_subject_upload_uidx
      on profile_images(subject_type, subject_id, upload_id);
    create unique index profile_images_subject_version_uidx
      on profile_images(subject_type, subject_id, version);
    create unique index profile_images_subject_ready_uidx
      on profile_images(subject_type, subject_id) where status = 'ready';
    create table profile_image_cleanup_jobs (
      id text primary key,
      subject_type text not null,
      subject_id text not null,
      object_key text not null unique,
      status text not null default 'pending',
      attempts integer not null default 0,
      last_error_code text,
      locked_at integer,
      next_attempt_at integer,
      created_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      completed_at integer
    );
  `)
  const db = drizzle(client, { schema: dbSchema })
  const now = new Date("2026-07-22T00:00:00.000Z")
  await db.insert(user).values({
    id: "user-1",
    name: "User One",
    email: "user-1@example.test",
    emailVerified: true,
    image: "https://images.example.test/user-1.png",
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(organization).values({
    id: "org-1",
    name: "Organization One",
    slug: "organization-one",
    logo: "https://images.example.test/org-1.png",
    createdAt: now,
  })
  await db.insert(member).values({
    id: "member-1",
    organizationId: "org-1",
    userId: "user-1",
    role: "owner",
    createdAt: now,
  })
  await db.insert(session).values({
    id: "profile-session",
    expiresAt: new Date("2100-01-01T00:00:00.000Z"),
    token: "profile-session-token",
    createdAt: now,
    updatedAt: now,
    userId: "user-1",
    activeOrganizationId: "org-1",
  })
  return db
}

const pngFile = (marker = 1) =>
  new File([new Uint8Array([...pngHeader, marker])], "profile.png", {
    type: "image/png",
  })

describe("profile image service", () => {
  let database: Db

  beforeEach(async () => {
    database = await createDatabase()
  })

  afterEach(() => {
    resetFileStorageRuntimeForTest()
  })

  it("normalizes, stores, and idempotently retries a user profile image", async () => {
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)
    const file = pngFile()

    const first = await uploadProfileImage(database, {
      actorUserId: "user-1",
      file,
      fileSize: file.size,
      subject: { type: "user", id: "user-1" },
      uploadId: "upload-1",
    })
    expect(first).toMatchObject({
      created: true,
      dto: {
        profileImage: expect.stringMatching(
          /^\/files\/profile-images\/users\/user-1\?v=/u
        ),
        width: 512,
        height: 512,
      },
    })
    await expect(database.select().from(profileImages)).resolves.toMatchObject([
      {
        status: "ready",
        fallbackUrl: "https://images.example.test/user-1.png",
        sourceHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      },
    ])
    await expect(
      database.select({ image: user.image }).from(user)
    ).resolves.toEqual([{ image: first.dto.profileImage }])
    expect([...storage.objects.values()][0]).toMatchObject({
      httpMetadata: { contentType: "image/webp" },
    })

    await expect(
      uploadProfileImage(database, {
        actorUserId: "user-1",
        file,
        fileSize: file.size,
        subject: { type: "user", id: "user-1" },
        uploadId: "upload-1",
      })
    ).resolves.toMatchObject({ created: false, dto: first.dto })
    await expect(database.select().from(profileImages)).resolves.toHaveLength(1)

    const conflicting = pngFile(2)
    await expect(
      uploadProfileImage(database, {
        actorUserId: "user-1",
        file: conflicting,
        fileSize: conflicting.size,
        subject: { type: "user", id: "user-1" },
        uploadId: "upload-1",
      })
    ).rejects.toMatchObject({ code: "conflict" })
  })

  it("materializes the Images response as a bounded Blob before R2 PUT", async () => {
    const storage = createRuntime()
    const providerResponse = new Response(
      streamOf(new Uint8Array([0x57, 0x45, 0x42, 0x50])),
      { headers: { "Content-Type": "image/webp" } }
    )
    storage.input.mockImplementation(() => ({
      transform: () => ({
        output: async () => ({ response: () => providerResponse }),
      }),
    }))
    const originalPut = storage.runtime.bucket.put
    storage.runtime.bucket.put = vi.fn<FileStorageRuntime["bucket"]["put"]>(
      async (key, value, options) => {
        expect(value).toBeInstanceOf(Blob)
        expect(value).not.toBe(providerResponse.body)
        if (!(value instanceof Blob)) throw new Error("Expected Blob")
        expect(value.type).toBe("image/webp")
        return originalPut(key, value, options)
      }
    )
    configureFileStorageRuntime(storage.runtime)
    const file = pngFile()

    await expect(
      uploadProfileImage(database, {
        actorUserId: "user-1",
        file,
        fileSize: file.size,
        subject: { type: "user", id: "user-1" },
        uploadId: "upload-known-length",
      })
    ).resolves.toMatchObject({ created: true })
    expect(storage.runtime.bucket.put).toHaveBeenCalledOnce()
  })

  it("preserves the original fallback across replacements and restores it", async () => {
    configureFileStorageRuntime(createRuntime().runtime)
    for (const [uploadId, marker] of [
      ["upload-1", 1],
      ["upload-2", 2],
    ] as const) {
      const file = pngFile(marker)
      // oxlint-disable-next-line no-await-in-loop -- replacement順序をtestする。
      await uploadProfileImage(database, {
        actorUserId: "user-1",
        file,
        fileSize: file.size,
        subject: { type: "user", id: "user-1" },
        uploadId,
      })
    }

    await expect(
      database.select().from(profileImages).orderBy(profileImages.version)
    ).resolves.toMatchObject([
      {
        uploadId: "upload-1",
        fallbackUrl: "https://images.example.test/user-1.png",
        status: "superseded",
      },
      {
        uploadId: "upload-2",
        fallbackUrl: "https://images.example.test/user-1.png",
        status: "ready",
      },
    ])
    await expect(
      database.select().from(profileImageCleanupJobs)
    ).resolves.toHaveLength(1)

    await removeProfileImage(database, {
      actorUserId: "user-1",
      subject: { type: "user", id: "user-1" },
    })
    await expect(
      database.select().from(profileImages).orderBy(profileImages.version)
    ).resolves.toMatchObject([
      { status: "superseded", uploadId: "upload-1", version: 1 },
      { status: "superseded", uploadId: "upload-2", version: 2 },
    ])
    await expect(
      database.select({ image: user.image }).from(user)
    ).resolves.toEqual([{ image: "https://images.example.test/user-1.png" }])
    await expect(
      database.select().from(profileImageCleanupJobs)
    ).resolves.toHaveLength(2)

    await expect(
      removeProfileImage(database, {
        actorUserId: "user-1",
        subject: { type: "user", id: "user-1" },
      })
    ).rejects.toMatchObject({ code: "not_found" })

    const replayedFile = pngFile(2)
    await expect(
      uploadProfileImage(database, {
        actorUserId: "user-1",
        file: replayedFile,
        fileSize: replayedFile.size,
        subject: { type: "user", id: "user-1" },
        uploadId: "upload-2",
      })
    ).rejects.toMatchObject({
      code: "conflict",
    })
    await expect(
      database.select({ image: user.image }).from(user)
    ).resolves.toEqual([{ image: "https://images.example.test/user-1.png" }])

    const newFile = pngFile(3)
    await expect(
      uploadProfileImage(database, {
        actorUserId: "user-1",
        file: newFile,
        fileSize: newFile.size,
        subject: { type: "user", id: "user-1" },
        uploadId: "upload-3",
      })
    ).resolves.toMatchObject({
      created: true,
      dto: {
        profileImage: expect.stringMatching(
          /^\/files\/profile-images\/users\/user-1\?v=/u
        ),
      },
    })
    await expect(
      database.select().from(profileImages).orderBy(profileImages.version)
    ).resolves.toMatchObject([
      { status: "superseded", version: 1 },
      { status: "superseded", version: 2 },
      { status: "ready", version: 3 },
    ])
  })

  it("normalizes a legacy blank auth image fallback to null", async () => {
    await database
      .update(user)
      .set({ image: "   " })
      .where(eq(user.id, "user-1"))
    configureFileStorageRuntime(createRuntime().runtime)
    const file = pngFile()

    await uploadProfileImage(database, {
      actorUserId: "user-1",
      file,
      fileSize: file.size,
      subject: { type: "user", id: "user-1" },
      uploadId: "upload-blank-fallback",
    })
    await expect(database.select().from(profileImages)).resolves.toMatchObject([
      { fallbackUrl: null, status: "ready" },
    ])

    await removeProfileImage(database, {
      actorUserId: "user-1",
      subject: { type: "user", id: "user-1" },
    })
    await expect(
      database.select({ image: user.image }).from(user)
    ).resolves.toEqual([{ image: null }])
    await expect(database.select().from(profileImages)).resolves.toMatchObject([
      { status: "superseded" },
    ])
  })

  it("uses monotonic versions so the latest organization upload wins", async () => {
    const subject = { type: "organization" as const, id: "org-1" }
    const firstId = "profile-1"
    const secondId = "profile-2"
    const first = await reservePendingProfileImage(database, {
      id: firstId,
      objectKey: profileImageObjectKey({ id: firstId, subject }),
      sourceHash: "a".repeat(64),
      subject,
      uploadId: "upload-1",
    })
    const second = await reservePendingProfileImage(database, {
      id: secondId,
      objectKey: profileImageObjectKey({ id: secondId, subject }),
      sourceHash: "b".repeat(64),
      subject,
      uploadId: "upload-2",
    })
    expect([first.image.version, second.image.version]).toEqual([1, 2])

    await expect(
      finalizePendingProfileImage(database, {
        actorUserId: "user-1",
        etag: "etag-2",
        id: secondId,
        profileImagePath:
          "/files/profile-images/organizations/org-1?v=profile-2",
        sessionId: "profile-session",
        subject,
      })
    ).resolves.toMatchObject({ kind: "ready", image: { id: secondId } })
    await expect(
      finalizePendingProfileImage(database, {
        actorUserId: "user-1",
        etag: "etag-1",
        id: firstId,
        profileImagePath: "/files/profile-images/organizations/org-1",
        sessionId: "profile-session",
        subject,
      })
    ).resolves.toEqual({ kind: "superseded" })
    await expect(
      reservePendingProfileImage(database, {
        id: "profile-3-must-not-be-created",
        objectKey: profileImageObjectKey({
          id: "profile-3-must-not-be-created",
          subject,
        }),
        sourceHash: "a".repeat(64),
        subject,
        uploadId: "upload-1",
      })
    ).resolves.toMatchObject({
      created: false,
      image: { id: firstId, status: "superseded", version: 1 },
    })
    await expect(database.select().from(profileImages)).resolves.toHaveLength(2)
    await expect(
      database.select({ logo: organization.logo }).from(organization)
    ).resolves.toEqual([
      { logo: "/files/profile-images/organizations/org-1?v=profile-2" },
    ])
    await expect(
      database
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(eq(auditLogs.organizationId, "org-1"))
    ).resolves.toEqual([{ action: "organization.profile_image.updated" }])
  })

  it("reserves distinct monotonic versions for concurrent uploads", async () => {
    const subject = { type: "user" as const, id: "user-1" }
    const reservations = await Promise.all(
      [
        { id: "profile-concurrent-a", uploadId: "upload-concurrent-a" },
        { id: "profile-concurrent-b", uploadId: "upload-concurrent-b" },
      ].map(({ id, uploadId }, index) =>
        reservePendingProfileImage(database, {
          id,
          objectKey: profileImageObjectKey({ id, subject }),
          sourceHash: String(index + 1).repeat(64),
          subject,
          uploadId,
        })
      )
    )

    expect(
      reservations.map(({ image }) => image.version).toSorted((a, b) => a - b)
    ).toEqual([1, 2])
    await expect(database.select().from(profileImages)).resolves.toHaveLength(2)
  })

  it("revalidates organization role after R2 processing and cleans a rejected object", async () => {
    const storage = createRuntime(async () => {
      await database
        .update(member)
        .set({ role: "member" })
        .where(eq(member.id, "member-1"))
    })
    configureFileStorageRuntime(storage.runtime)
    const file = pngFile()

    await expect(
      uploadProfileImage(database, {
        actorUserId: "user-1",
        file,
        fileSize: file.size,
        sessionId: "profile-session",
        subject: { type: "organization", id: "org-1" },
        uploadId: "upload-role-race",
      })
    ).rejects.toMatchObject({ code: "forbidden" })
    await expect(database.select().from(profileImages)).resolves.toMatchObject([
      { status: "superseded", uploadId: "upload-role-race" },
    ])
    await expect(
      database.select().from(profileImageCleanupJobs)
    ).resolves.toHaveLength(1)
    await expect(
      database.select({ logo: organization.logo }).from(organization)
    ).resolves.toEqual([{ logo: "https://images.example.test/org-1.png" }])
  })

  it("revalidates the active session inside organization deletion", async () => {
    configureFileStorageRuntime(createRuntime().runtime)
    const file = pngFile()
    const uploaded = await uploadProfileImage(database, {
      actorUserId: "user-1",
      file,
      fileSize: file.size,
      sessionId: "profile-session",
      subject: { type: "organization", id: "org-1" },
      uploadId: "upload-before-session-change",
    })
    await database
      .update(session)
      .set({ activeOrganizationId: null })
      .where(eq(session.id, "profile-session"))

    await expect(
      removeProfileImage(database, {
        actorUserId: "user-1",
        sessionId: "profile-session",
        subject: { type: "organization", id: "org-1" },
      })
    ).rejects.toMatchObject({ code: "active_organization_mismatch" })
    await expect(database.select().from(profileImages)).resolves.toMatchObject([
      { status: "ready", uploadId: "upload-before-session-change" },
    ])
    await expect(
      database.select({ logo: organization.logo }).from(organization)
    ).resolves.toEqual([{ logo: uploaded.dto.profileImage }])
  })
})

describe("profile image service", () => {
  let database: Db

  beforeEach(async () => {
    database = await createDatabase()
  })

  afterEach(() => {
    resetFileStorageRuntimeForTest()
  })

  it("serves the private canonical WebP with ETag and 304", async () => {
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)
    const file = pngFile()
    await uploadProfileImage(database, {
      actorUserId: "user-1",
      file,
      fileSize: file.size,
      subject: { type: "user", id: "user-1" },
      uploadId: "upload-1",
    })

    const response = await readProfileImage(database, {
      request: new Request("https://api.example.test/profile"),
      subject: { type: "user", id: "user-1" },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("image/webp")
    expect(response.headers.get("cache-control")).toBe("private, no-cache")
    expect(response.headers.get("cross-origin-resource-policy")).toBe(
      "same-site"
    )
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    const etag = response.headers.get("etag")
    expect(etag).toBe('"etag-1"')

    const notModified = await readProfileImage(database, {
      request: new Request("https://api.example.test/profile", {
        headers: { "If-None-Match": `"unrelated", W/${etag}` },
      }),
      subject: { type: "user", id: "user-1" },
    })
    expect(notModified.status).toBe(304)
  })

  it("rejects wrong dimensions before reserving metadata", async () => {
    const storage = createRuntime()
    storage.info.mockResolvedValue({
      format: "png",
      fileSize: pngFile().size,
      width: 511,
      height: 512,
    })
    configureFileStorageRuntime(storage.runtime)
    const file = pngFile()

    await expect(
      uploadProfileImage(database, {
        actorUserId: "user-1",
        file,
        fileSize: file.size,
        subject: { type: "user", id: "user-1" },
        uploadId: "upload-invalid",
      })
    ).rejects.toMatchObject({ code: "validation_error" })
    await expect(database.select().from(profileImages)).resolves.toHaveLength(0)
  })

  it("rejects a declared PNG whose magic bytes do not match", async () => {
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)
    const file = new File(
      [new Uint8Array([0x47, 0x49, 0x46, 0x38])],
      "profile.png",
      {
        type: "image/png",
      }
    )

    await expect(
      uploadProfileImage(database, {
        actorUserId: "user-1",
        file,
        fileSize: file.size,
        subject: { type: "user", id: "user-1" },
        uploadId: "upload-invalid-magic",
      })
    ).rejects.toMatchObject({ code: "validation_error" })
    expect(storage.info).not.toHaveBeenCalled()
    await expect(database.select().from(profileImages)).resolves.toHaveLength(0)
  })

  it("rejects a transformed response without an explicit WebP content type", async () => {
    const storage = createRuntime()
    storage.input.mockImplementation(() => ({
      transform: () => ({
        output: async () => ({
          response: () =>
            new Response(streamOf(new Uint8Array([0x57, 0x45, 0x42, 0x50]))),
        }),
      }),
    }))
    configureFileStorageRuntime(storage.runtime)
    const file = pngFile()

    await expect(
      uploadProfileImage(database, {
        actorUserId: "user-1",
        file,
        fileSize: file.size,
        subject: { type: "user", id: "user-1" },
        uploadId: "upload-missing-content-type",
      })
    ).rejects.toMatchObject({ code: "service_unavailable" })
    expect(storage.runtime.bucket.put).not.toHaveBeenCalled()
    await expect(database.select().from(profileImages)).resolves.toMatchObject([
      { status: "pending", uploadId: "upload-missing-content-type" },
    ])
  })

  it("rejects an oversized transformed response before R2 PUT", async () => {
    const storage = createRuntime()
    storage.input.mockImplementation(() => ({
      transform: () => ({
        output: async () => ({
          response: () =>
            new Response(
              streamOf(
                new Uint8Array(PROFILE_IMAGE_OUTPUT_MAX_BYTES + 1).fill(1)
              ),
              { headers: { "Content-Type": "image/webp" } }
            ),
        }),
      }),
    }))
    configureFileStorageRuntime(storage.runtime)
    const file = pngFile()

    await expect(
      uploadProfileImage(database, {
        actorUserId: "user-1",
        file,
        fileSize: file.size,
        subject: { type: "user", id: "user-1" },
        uploadId: "upload-oversized-output",
      })
    ).rejects.toMatchObject({
      code: "service_unavailable",
    })
    expect(storage.runtime.bucket.put).not.toHaveBeenCalled()
  })

  it("preserves provider errors and leaves no metadata before reservation", async () => {
    const storage = createRuntime()
    const raw = new Error("provider token and private image details")
    storage.info.mockRejectedValue(raw)
    configureFileStorageRuntime(storage.runtime)
    const file = pngFile()

    const error = await uploadProfileImage(database, {
      actorUserId: "user-1",
      file,
      fileSize: file.size,
      subject: { type: "user", id: "user-1" },
      uploadId: "upload-provider-failure",
    }).catch((cause: unknown) => cause)
    expect(error).toMatchObject({
      code: "service_unavailable",
    })
    expect(error).toHaveProperty("cause", raw)
    expect(JSON.stringify(error)).not.toContain("provider token")
    await expect(database.select().from(profileImages)).resolves.toHaveLength(0)
  })
})
