import * as schema from "@enterprise-agentic-saas/db/schema"
import { sql } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createApp } from "../../app"
import { createMigratedDb } from "../../app.test-support"
import { env } from "../../platform/env"
import {
  configureFileStorageRuntime,
  resetFileStorageRuntimeForTest,
  type FileR2Object,
  type FileR2PutValue,
  type FileStorageRuntime,
} from "../files/public"

const streamOf = (bytes: Uint8Array) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })

const readStream = async (stream: ReadableStream<Uint8Array>) => {
  const response = new Response(stream)
  return new Uint8Array(await response.arrayBuffer())
}

const readPutValue = async (value: FileR2PutValue) =>
  value instanceof Blob
    ? new Uint8Array(await value.arrayBuffer())
    : readStream(value)

const configureRuntime = () => {
  const objects = new Map<
    string,
    FileR2Object & { bytes: Uint8Array; contentType: string }
  >()
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
          const etag = `etag-${objects.size + 1}`
          const object = {
            key,
            size: bytes.byteLength,
            etag,
            httpEtag: `"${etag}"`,
            customMetadata: options.customMetadata,
            bytes,
            contentType: options.httpMetadata.contentType,
          }
          objects.set(key, object)
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
    images: {
      info: vi.fn<FileStorageRuntime["images"]["info"]>(async (source) => {
        const bytes = await readStream(source)
        return {
          format: "png",
          fileSize: bytes.byteLength,
          width: 512,
          height: 512,
        }
      }),
      input: vi.fn<FileStorageRuntime["images"]["input"]>((source) => ({
        transform: () => ({
          output: async () => {
            const bytes = await readStream(source)
            return {
              response: () =>
                new Response(streamOf(bytes), {
                  headers: { "Content-Type": "image/webp" },
                }),
            }
          },
        }),
      })),
    },
  }
  configureFileStorageRuntime(runtime)
}

const createDatabase = async () => {
  const database = await createMigratedDb()
  const now = new Date("2026-07-22T00:00:00.000Z")
  await database.insert(schema.user).values([
    {
      id: "user-1",
      name: "User One",
      email: "user-1@example.test",
      emailVerified: true,
      image: "https://images.example.test/user-1.png",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "user-2",
      name: "User Two",
      email: "user-2@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "user-3",
      name: "User Three",
      email: "user-3@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
  ])
  await database.insert(schema.organization).values([
    { id: "org-1", name: "Org One", slug: "org-one", createdAt: now },
    { id: "org-2", name: "Org Two", slug: "org-two", createdAt: now },
  ])
  await database.insert(schema.member).values([
    {
      id: "member-1",
      organizationId: "org-1",
      userId: "user-1",
      role: "owner",
      createdAt: now,
    },
    {
      id: "member-2",
      organizationId: "org-1",
      userId: "user-2",
      role: "member",
      createdAt: now,
    },
    {
      id: "member-3",
      organizationId: "org-1",
      userId: "user-3",
      role: "member",
      createdAt: now,
    },
    {
      id: "member-4",
      organizationId: "org-2",
      userId: "user-3",
      role: "owner",
      createdAt: now,
    },
  ])
  await database.insert(schema.session).values(
    (
      [
        ["user-1", "org-1"],
        ["user-2", "org-1"],
        ["user-3", "org-1"],
        ["user-3", "org-2"],
      ] as const
    ).map(([userId, activeOrganizationId]) => ({
      id: `${userId}:${activeOrganizationId}`,
      expiresAt: new Date("2100-01-01T00:00:00.000Z"),
      token: `token:${userId}:${activeOrganizationId}`,
      createdAt: now,
      updatedAt: now,
      userId,
      activeOrganizationId,
    }))
  )
  return database
}

const headers = (userId: string, activeOrganizationId: string) => ({
  "x-test-user-id": userId,
  "x-test-session-id": `${userId}:${activeOrganizationId}`,
  "x-test-active-organization-id": activeOrganizationId,
  "x-test-session-created-at": new Date().toISOString(),
  origin: env.CORS_ORIGIN[0] ?? env.API_PUBLIC_URL,
})

const pngFile = () =>
  new File(
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    "profile.png",
    { type: "image/png" }
  )

const uploadRequest = (
  path: string,
  input: { userId: string; activeOrganizationId: string; uploadId: string }
) => {
  const file = pngFile()
  const body = new FormData()
  body.set("uploadId", input.uploadId)
  body.set("fileSize", String(file.size))
  body.set("file", file)
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: headers(input.userId, input.activeOrganizationId),
    body,
  })
}

describe("プロフィール画像route", () => {
  beforeEach(() => configureRuntime())
  afterEach(() => resetFileStorageRuntimeForTest())

  it("専用routeと統一DTOを記載する", async () => {
    const app = createApp(await createDatabase())
    const response = await app.handle(
      new Request("http://localhost/openapi/json")
    )
    const document: {
      paths: Record<string, Record<string, { operationId: string }>>
      components: { schemas: Record<string, unknown> }
    } = await response.json()

    expect(response.status).toBe(200)
    expect(
      document.paths["/files/profile-images/users/me"]?.post?.operationId
    ).toBe("uploadCurrentUserProfileImage")
    expect(
      document.paths["/files/profile-images/users/{userId}"]?.get?.operationId
    ).toBe("getUserProfileImage")
    expect(
      document.paths["/files/profile-images/organizations/{organizationId}"]
        ?.post?.operationId
    ).toBe("uploadOrganizationProfileImage")
    const appContract = JSON.stringify(document.paths)
    expect(appContract).toContain("profileImage")
    expect(appContract).toContain("memberProfileImages")
    expect(appContract).not.toContain('"memberAvatars":')
    expect(appContract).not.toContain('"logo":')
    expect(appContract).not.toContain('"image":')
  })

  it("現在userの画像をuploadして統一DTOを返す", async () => {
    const app = createApp(await createDatabase())
    const upload = await app.handle(
      uploadRequest("/files/profile-images/users/me", {
        userId: "user-1",
        activeOrganizationId: "org-1",
        uploadId: "upload-user",
      })
    )
    expect(upload.status).toBe(201)
    await expect(upload.json()).resolves.toMatchObject({
      profileImage: expect.stringMatching(
        /^\/files\/profile-images\/users\/user-1\?v=/u
      ),
      width: 512,
      height: 512,
    })
  })

  it("user画像へETagが一致する場合は304を返す", async () => {
    const app = createApp(await createDatabase())
    const upload = await app.handle(
      uploadRequest("/files/profile-images/users/me", {
        userId: "user-1",
        activeOrganizationId: "org-1",
        uploadId: "upload-user-conditional",
      })
    )
    expect(upload.status).toBe(201)
    const get = await app.handle(
      new Request("http://localhost/files/profile-images/users/user-1", {
        headers: headers("user-1", "org-1"),
      })
    )
    expect(get.status).toBe(200)
    expect(get.headers.get("cache-control")).toBe("private, no-cache")
    const etag = get.headers.get("etag")
    const conditional = await app.handle(
      new Request("http://localhost/files/profile-images/users/user-1", {
        headers: {
          ...headers("user-1", "org-1"),
          "If-None-Match": etag ?? "",
        },
      })
    )
    expect(conditional.status).toBe(304)
  })

  it.each([
    {
      activeOrganizationId: "org-1",
      label: "同じorganizationのuser",
      userId: "user-2",
    },
    {
      activeOrganizationId: "org-2",
      label: "別organizationのuser",
      userId: "user-3",
    },
  ] as const)(
    "$labelへuser画像を配信する",
    async ({ activeOrganizationId, userId }) => {
      const app = createApp(await createDatabase())
      const upload = await app.handle(
        uploadRequest("/files/profile-images/users/me", {
          userId: "user-1",
          activeOrganizationId: "org-1",
          uploadId: `upload-user-read-${userId}`,
        })
      )
      expect(upload.status).toBe(201)

      const response = await app.handle(
        new Request("http://localhost/files/profile-images/users/user-1", {
          headers: headers(userId, activeOrganizationId),
        })
      )

      expect(response.status).toBe(200)
    }
  )

  it("現在userの画像を削除してfallback URLを復元する", async () => {
    const database = await createDatabase()
    const app = createApp(database)
    const upload = await app.handle(
      uploadRequest("/files/profile-images/users/me", {
        userId: "user-1",
        activeOrganizationId: "org-1",
        uploadId: "upload-user-delete",
      })
    )
    expect(upload.status).toBe(201)
    const removed = await app.handle(
      new Request("http://localhost/files/profile-images/users/me", {
        method: "DELETE",
        headers: headers("user-1", "org-1"),
      })
    )
    const storedUsers = await database
      .select({ image: schema.user.image })
      .from(schema.user)
      .where(sql`${schema.user.id} = 'user-1'`)
    expect({
      status: removed.status,
      body: await removed.clone().text(),
      storedUsers,
    }).toEqual({
      status: 204,
      body: "",
      storedUsers: [{ image: "https://images.example.test/user-1.png" }],
    })
  })

  it("ownerでないmemberのorganization画像mutationを拒否する", async () => {
    const app = createApp(await createDatabase())
    const forbidden = await app.handle(
      uploadRequest("/files/profile-images/organizations/org-1", {
        userId: "user-2",
        activeOrganizationId: "org-1",
        uploadId: "upload-forbidden",
      })
    )
    expect(forbidden.status).toBe(403)
  })

  it("active ownerのorganization画像mutationを受理する", async () => {
    const app = createApp(await createDatabase())
    const uploaded = await app.handle(
      uploadRequest("/files/profile-images/organizations/org-2", {
        userId: "user-3",
        activeOrganizationId: "org-2",
        uploadId: "upload-org-2",
      })
    )
    expect(uploaded.status).toBe(201)
  })

  it("active organizationが一致しないorganization画像mutationを拒否する", async () => {
    const app = createApp(await createDatabase())
    const activeMismatch = await app.handle(
      uploadRequest("/files/profile-images/organizations/org-2", {
        userId: "user-3",
        activeOrganizationId: "org-1",
        uploadId: "upload-active-mismatch",
      })
    )
    expect(activeMismatch.status).toBe(409)
  })

  it.each([
    {
      activeOrganizationId: "org-1",
      expectedStatus: 200,
      label: "activeでないowner",
      userId: "user-3",
    },
    {
      activeOrganizationId: "org-1",
      expectedStatus: 404,
      label: "memberでない利用者",
      userId: "user-2",
    },
  ] as const)(
    "$labelによるorganization画像readへmembership境界を適用する",
    async ({ activeOrganizationId, expectedStatus, userId }) => {
      const app = createApp(await createDatabase())
      const uploaded = await app.handle(
        uploadRequest("/files/profile-images/organizations/org-2", {
          userId: "user-3",
          activeOrganizationId: "org-2",
          uploadId: `upload-org-read-${userId}`,
        })
      )
      expect(uploaded.status).toBe(201)

      const response = await app.handle(
        new Request(
          "http://localhost/files/profile-images/organizations/org-2",
          { headers: headers(userId, activeOrganizationId) }
        )
      )

      expect(response.status).toBe(expectedStatus)
    }
  )
})
