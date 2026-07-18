import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { Db } from "@enterprise-agentic-saas/db"
import {
  developmentFileFixtures,
  getDevelopmentFileFixtureUrl,
} from "@enterprise-agentic-saas/db/development-seed"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  configureFileStorageRuntime,
  type FileImagesBinding,
  type FileR2Bucket,
  resetFileStorageRuntimeForTest,
} from "../modules/files/runtime"
import {
  DEVELOPMENT_FILE_SEED_PATH,
  handleDevelopmentFileSeedRequest,
  isLocalDatabaseUrl,
} from "./file-seed-handler"

const fixture = developmentFileFixtures[0]
if (!fixture) throw new Error("Development file fixture is required")
const boundaryDatabase: Db = drizzle(createClient({ url: ":memory:" }))
const migrationsFolder = new URL(
  "../../../../packages/db/drizzle",
  import.meta.url
).pathname
const token = "x".repeat(64)

class DevelopmentBucket implements FileR2Bucket {
  private object:
    | {
        bytes: Uint8Array
        customMetadata: Record<string, string>
        etag: string
        key: string
      }
    | undefined
  putCount = 0

  clear() {
    this.object = undefined
  }

  corruptMetadata() {
    if (this.object) {
      this.object.customMetadata = {
        ...this.object.customMetadata,
        unmanaged: "true",
      }
    }
  }

  async delete() {
    this.clear()
  }

  async get(key: string) {
    if (!this.object || this.object.key !== key) return null
    return {
      ...this.metadata(),
      body: new Blob([Uint8Array.from(this.object.bytes)]).stream(),
    }
  }

  async head(key: string) {
    return this.object?.key === key ? this.metadata() : null
  }

  async list() {
    return {
      objects: this.object ? [{ key: this.object.key }] : [],
      truncated: false,
    }
  }

  async put(
    key: string,
    value: ReadableStream<Uint8Array>,
    options: {
      onlyIf?: Headers
      httpMetadata: { contentType: string }
      customMetadata: Record<string, string>
    }
  ) {
    if (this.object && options.onlyIf?.get("if-none-match") === "*") {
      return null
    }
    const bytes = new Uint8Array(await new Response(value).arrayBuffer())
    this.object = {
      bytes,
      customMetadata: { ...options.customMetadata },
      etag: createHash("md5").update(bytes).digest("hex"),
      key,
    }
    this.putCount += 1
    return this.metadata()
  }

  private metadata() {
    if (!this.object) throw new Error("Development object is missing")
    return {
      key: this.object.key,
      size: this.object.bytes.byteLength,
      etag: this.object.etag,
      httpEtag: `"${this.object.etag}"`,
      customMetadata: { ...this.object.customMetadata },
    }
  }
}

const createImagesBinding = (
  selectedFixture: (typeof developmentFileFixtures)[number],
  failInfo = false
): FileImagesBinding => ({
  info: vi.fn<FileImagesBinding["info"]>(async () => {
    if (failInfo) throw new Error("images unavailable")
    return {
      format: selectedFixture.expectedImageFormat ?? "unknown",
      fileSize: selectedFixture.sizeBytes,
      width: selectedFixture.expectedImageWidth ?? undefined,
      height: selectedFixture.expectedImageHeight ?? undefined,
    }
  }),
  input: () => ({
    transform: () => ({
      output: async () => ({ response: () => new Response() }),
    }),
  }),
})

const createFixtureDatabase = async (
  selectedFixture: (typeof developmentFileFixtures)[number]
) => {
  const directory = await mkdtemp(join(tmpdir(), "file-seed-handler-"))
  const client = createClient({ url: `file:${join(directory, "seed.db")}` })
  await migrate(drizzle(client), { migrationsFolder })
  const now = Date.now()
  await client.batch([
    {
      sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
      args: [
        selectedFixture.uploaderId,
        "Seed Uploader",
        `${selectedFixture.id}@seed.local`,
        1,
        now,
        now,
      ],
    },
    {
      sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
      args: [
        selectedFixture.organizationId,
        "Seed Organization",
        `seed-${selectedFixture.id}`,
        now,
      ],
    },
    {
      sql: "insert into issues(id,organization_id,number,title,creator_id,created_at,updated_at) values(?,?,?,?,?,?,?)",
      args: [
        selectedFixture.ownerId,
        selectedFixture.organizationId,
        1,
        "Seed Issue",
        selectedFixture.uploaderId,
        now,
        now,
      ],
    },
    {
      sql: "insert into files(id,organization_id,uploader_id,upload_id,owner_type,object_key,filename,size_bytes,declared_content_type,status,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?)",
      args: [
        selectedFixture.id,
        selectedFixture.organizationId,
        selectedFixture.uploaderId,
        selectedFixture.uploadId,
        selectedFixture.ownerType,
        selectedFixture.objectKey,
        selectedFixture.filename,
        selectedFixture.sizeBytes,
        selectedFixture.declaredContentType,
        "pending",
        now,
        now,
      ],
    },
    {
      sql: "insert into issue_file_owners(file_id,organization_id,owner_type,issue_id) values(?,?,?,?)",
      args: [
        selectedFixture.id,
        selectedFixture.organizationId,
        selectedFixture.ownerType,
        selectedFixture.ownerId,
      ],
    },
    {
      sql: "insert into organization_file_usage(organization_id,used_bytes,updated_at) values(?,?,?)",
      args: [selectedFixture.organizationId, selectedFixture.sizeBytes, now],
    },
  ])
  const database: Db = drizzle(client)
  return {
    client,
    database,
    cleanup: async () => {
      client.close()
      await rm(directory, { force: true, recursive: true })
    },
  }
}

const reconcileRequest = async (
  selectedFixture: (typeof developmentFileFixtures)[number],
  bytes: Uint8Array
) =>
  new Request(
    `http://127.0.0.1:8787${DEVELOPMENT_FILE_SEED_PATH}/${encodeURIComponent(selectedFixture.id)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Length": String(bytes.byteLength),
      },
      body: Uint8Array.from(bytes),
    }
  )

const localEnvironment = {
  DEV_FILE_SEED_TOKEN: token,
  NODE_ENV: "development",
  TURSO_DATABASE_URL: "file:/tmp/development.db",
} as const

const request = (origin = "http://127.0.0.1:8787") =>
  new Request(
    `${origin}${DEVELOPMENT_FILE_SEED_PATH}/${encodeURIComponent(fixture.id)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${"x".repeat(64)}` },
    }
  )

describe("development file seed boundary", () => {
  it("accepts only local database URL shapes", () => {
    expect(isLocalDatabaseUrl("file:/tmp/development.db")).toBe(true)
    expect(isLocalDatabaseUrl("file://storage.example.com/shared.db")).toBe(
      false
    )
    expect(isLocalDatabaseUrl("http://127.0.0.1:8080")).toBe(true)
    expect(isLocalDatabaseUrl("https://db.example.localhost")).toBe(true)
    expect(isLocalDatabaseUrl("libsql://production.turso.io")).toBe(false)
    expect(isLocalDatabaseUrl(undefined)).toBe(false)
  })

  it("stays unavailable outside development, loopback, and local Turso", async () => {
    const boundaryToken = "x".repeat(64)

    const responses = await Promise.all([
      handleDevelopmentFileSeedRequest(boundaryDatabase, request(), {
        DEV_FILE_SEED_TOKEN: boundaryToken,
        NODE_ENV: "production",
        TURSO_DATABASE_URL: "file:/tmp/development.db",
      }),
      handleDevelopmentFileSeedRequest(
        boundaryDatabase,
        request("https://api.example.com"),
        {
          DEV_FILE_SEED_TOKEN: boundaryToken,
          NODE_ENV: "development",
          TURSO_DATABASE_URL: "file:/tmp/development.db",
        }
      ),
      handleDevelopmentFileSeedRequest(boundaryDatabase, request(), {
        DEV_FILE_SEED_TOKEN: boundaryToken,
        NODE_ENV: "development",
        TURSO_DATABASE_URL: "libsql://production.turso.io",
      }),
    ])

    expect(responses.map((item) => item?.status)).toEqual([404, 404, 404])
  })

  it("requires the per-process token before touching storage", async () => {
    const result = await handleDevelopmentFileSeedRequest(
      boundaryDatabase,
      request(),
      {
        DEV_FILE_SEED_TOKEN: "different-token".repeat(4),
        NODE_ENV: "development",
        TURSO_DATABASE_URL: "file:/tmp/development.db",
      }
    )

    expect(result?.status).toBe(401)
    expect(await result?.text()).toBe("")
    expect(result?.headers.get("cache-control")).toBe("no-store")
  })

  it("ignores unrelated paths so the regular app owns its 404", async () => {
    const result = await handleDevelopmentFileSeedRequest(
      boundaryDatabase,
      new Request("http://127.0.0.1:8787/health"),
      {}
    )

    expect(result).toBeNull()
  })
})

describe("development file seed reconcile", () => {
  afterEach(() => resetFileStorageRuntimeForTest())

  it("converges pending, ready, missing, and deleted fixture states", async () => {
    const selectedFixture = developmentFileFixtures.find(
      (candidate) => candidate.key === "text"
    )
    if (!selectedFixture) throw new Error("Text fixture is required")
    const bytes = new Uint8Array(
      await readFile(getDevelopmentFileFixtureUrl(selectedFixture))
    )
    const {
      client,
      database: fixtureDatabase,
      cleanup,
    } = await createFixtureDatabase(selectedFixture)
    const bucket = new DevelopmentBucket()
    configureFileStorageRuntime({
      bucket,
      images: createImagesBinding(selectedFixture),
    })

    try {
      const first = await handleDevelopmentFileSeedRequest(
        fixtureDatabase,
        await reconcileRequest(selectedFixture, bytes),
        localEnvironment
      )
      expect(first?.status).toBe(204)
      expect(bucket.putCount).toBe(1)
      const ready = await client.execute({
        sql: "select status,etag,image_width as imageWidth,image_height as imageHeight from files where id = ?",
        args: [selectedFixture.id],
      })
      expect(ready.rows).toMatchObject([
        {
          status: "ready",
          etag: selectedFixture.md5,
          imageWidth: null,
          imageHeight: null,
        },
      ])

      const noOp = await handleDevelopmentFileSeedRequest(
        fixtureDatabase,
        await reconcileRequest(selectedFixture, bytes),
        localEnvironment
      )
      expect(noOp?.status).toBe(204)
      expect(bucket.putCount).toBe(1)

      bucket.clear()
      const wrongBytes = Uint8Array.from(bytes)
      wrongBytes[0] = (wrongBytes[0] ?? 0) ^ 0xff
      const rejectedRepair = await handleDevelopmentFileSeedRequest(
        fixtureDatabase,
        await reconcileRequest(selectedFixture, wrongBytes),
        localEnvironment
      )
      expect(rejectedRepair?.status).toBe(400)
      expect(bucket.putCount).toBe(1)

      const repaired = await handleDevelopmentFileSeedRequest(
        fixtureDatabase,
        await reconcileRequest(selectedFixture, bytes),
        localEnvironment
      )
      expect(repaired?.status).toBe(204)
      expect(bucket.putCount).toBe(2)

      bucket.corruptMetadata()
      const unmanaged = await handleDevelopmentFileSeedRequest(
        fixtureDatabase,
        await reconcileRequest(selectedFixture, bytes),
        localEnvironment
      )
      expect(unmanaged?.status).toBe(409)
      expect(bucket.putCount).toBe(2)

      await client.execute({
        sql: "delete from files where id = ?",
        args: [selectedFixture.id],
      })
      bucket.clear()
      const deleted = await handleDevelopmentFileSeedRequest(
        fixtureDatabase,
        await reconcileRequest(selectedFixture, bytes),
        localEnvironment
      )
      expect(deleted?.status).toBe(204)
      expect(bucket.putCount).toBe(2)
    } finally {
      await cleanup()
    }
  })

  it("keeps an uploaded object and pending row when DB finalization fails", async () => {
    const selectedFixture = developmentFileFixtures.find(
      (candidate) => candidate.key === "wideJpeg"
    )
    if (!selectedFixture) throw new Error("JPEG fixture is required")
    const bytes = new Uint8Array(
      await readFile(getDevelopmentFileFixtureUrl(selectedFixture))
    )
    const {
      client,
      database: fixtureDatabase,
      cleanup,
    } = await createFixtureDatabase(selectedFixture)
    const bucket = new DevelopmentBucket()
    configureFileStorageRuntime({
      bucket,
      images: createImagesBinding(selectedFixture, true),
    })

    try {
      const failed = await handleDevelopmentFileSeedRequest(
        fixtureDatabase,
        await reconcileRequest(selectedFixture, bytes),
        localEnvironment
      )
      expect(failed?.status).toBe(503)
      expect(bucket.putCount).toBe(1)
      const pending = await client.execute({
        sql: "select status,detected_image_format as detectedImageFormat,etag from files where id = ?",
        args: [selectedFixture.id],
      })
      expect(pending.rows).toMatchObject([
        { status: "pending", detectedImageFormat: "jpeg", etag: null },
      ])

      configureFileStorageRuntime({
        bucket,
        images: createImagesBinding(selectedFixture),
      })
      const resumed = await handleDevelopmentFileSeedRequest(
        fixtureDatabase,
        await reconcileRequest(selectedFixture, bytes),
        localEnvironment
      )
      expect(resumed?.status).toBe(204)
      expect(bucket.putCount).toBe(1)
      const ready = await client.execute({
        sql: "select status,detected_image_format as detectedImageFormat,image_width as imageWidth,image_height as imageHeight,etag from files where id = ?",
        args: [selectedFixture.id],
      })
      expect(ready.rows).toMatchObject([
        {
          status: "ready",
          detectedImageFormat: "jpeg",
          imageWidth: selectedFixture.expectedImageWidth,
          imageHeight: selectedFixture.expectedImageHeight,
          etag: selectedFixture.md5,
        },
      ])
    } finally {
      await cleanup()
    }
  })

  it("reconciles the download-only AVIF fixture without Images.info", async () => {
    const selectedFixture = developmentFileFixtures.find(
      (candidate) => candidate.key === "avif"
    )
    if (!selectedFixture) throw new Error("AVIF fixture is required")
    const bytes = new Uint8Array(
      await readFile(getDevelopmentFileFixtureUrl(selectedFixture))
    )
    const {
      client,
      database: fixtureDatabase,
      cleanup,
    } = await createFixtureDatabase(selectedFixture)
    const bucket = new DevelopmentBucket()
    const images = createImagesBinding(selectedFixture, true)
    configureFileStorageRuntime({ bucket, images })

    try {
      const result = await handleDevelopmentFileSeedRequest(
        fixtureDatabase,
        await reconcileRequest(selectedFixture, bytes),
        localEnvironment
      )
      expect(result?.status).toBe(204)
      expect(images.info).not.toHaveBeenCalled()
      await expect(
        client.execute({
          sql: "select status,detected_image_format as detectedImageFormat,image_width as imageWidth,image_height as imageHeight,etag from files where id = ?",
          args: [selectedFixture.id],
        })
      ).resolves.toMatchObject({
        rows: [
          {
            status: "ready",
            detectedImageFormat: "avif",
            imageWidth: null,
            imageHeight: null,
            etag: selectedFixture.md5,
          },
        ],
      })
    } finally {
      await cleanup()
    }
  })
})
