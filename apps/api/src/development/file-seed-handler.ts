import type { Db } from "@enterprise-agentic-saas/db"
import {
  developmentFileFixtures,
  type DevelopmentFileFixture,
} from "@enterprise-agentic-saas/db/development-seed"
import { files } from "@enterprise-agentic-saas/db/schema"
import { and, eq } from "drizzle-orm"

import { createFileReconciliationApplication } from "../modules/files/module"
import { findFileByUploadId } from "../modules/files/repository"
import { getFileStorageRuntime } from "../modules/files/runtime"

export const DEVELOPMENT_FILE_SEED_PATH =
  "/__development/files/reconcile" as const

export type DevelopmentFileSeedEnvironment = {
  DEV_FILE_SEED_TOKEN?: string
  NODE_ENV?: string
  TURSO_DATABASE_URL?: string
}

const localHostnames = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

export const isLocalDatabaseUrl = (value: string | undefined) => {
  if (!value) return false

  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    if (
      url.protocol === "file:" &&
      (hostname === "" || localHostnames.has(hostname))
    ) {
      return true
    }
    if (url.protocol === "file:") return false
    return localHostnames.has(hostname) || hostname.endsWith(".localhost")
  } catch {
    return false
  }
}

const isLoopbackRequest = (request: Request) => {
  try {
    return localHostnames.has(new URL(request.url).hostname.toLowerCase())
  } catch {
    return false
  }
}

const response = (status: number) =>
  new Response(null, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })

const sha256 = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes))
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

const normalizeEtag = (etag: string) =>
  etag.replace(/^W\//u, "").replaceAll('"', "")

const exactSeedMetadata = (
  value: Record<string, string> | undefined,
  fixture: DevelopmentFileFixture
) => {
  if (!value) return false
  const keys = Object.keys(value).toSorted()
  return (
    keys.length === 3 &&
    keys[0] === "expectedSize" &&
    keys[1] === "fileId" &&
    keys[2] === "uploadId" &&
    value.expectedSize === String(fixture.sizeBytes) &&
    value.fileId === fixture.id &&
    value.uploadId === fixture.uploadId
  )
}

const seedObjectMatches = (
  object: {
    key: string
    size: number
    etag: string
    customMetadata?: Record<string, string>
  },
  fixture: DevelopmentFileFixture
) =>
  object.key === fixture.objectKey &&
  object.size === fixture.sizeBytes &&
  normalizeEtag(object.etag) === fixture.md5 &&
  exactSeedMetadata(object.customMetadata, fixture)

const findFixture = (request: Request) => {
  const pathname = new URL(request.url).pathname
  const prefix = `${DEVELOPMENT_FILE_SEED_PATH}/`
  if (!pathname.startsWith(prefix)) return null
  const encodedId = pathname.slice(prefix.length)
  if (!encodedId || encodedId.includes("/")) return null

  let id: string
  try {
    id = decodeURIComponent(encodedId)
  } catch {
    return null
  }
  return developmentFileFixtures.find((fixture) => fixture.id === id) ?? null
}

const isReadinessRequest = (request: Request) =>
  new URL(request.url).pathname === DEVELOPMENT_FILE_SEED_PATH

type SeedFile = NonNullable<Awaited<ReturnType<typeof findFileByUploadId>>>

const seedFileIdentityMatches = (
  stored: SeedFile,
  fixture: DevelopmentFileFixture
) =>
  [
    stored.id === fixture.id,
    stored.uploadId === fixture.uploadId,
    stored.objectKey === fixture.objectKey,
    stored.ownerType === fixture.ownerType,
    stored.ownerId === fixture.ownerId,
    stored.uploaderId === fixture.uploaderId,
    stored.filename === fixture.filename,
    stored.sizeBytes === fixture.sizeBytes,
    stored.declaredContentType === fixture.declaredContentType,
  ].every(Boolean)

const pendingSeedMetadataMatches = (
  stored: SeedFile,
  fixture: DevelopmentFileFixture
) =>
  stored.status !== "pending" ||
  [
    stored.etag === null,
    stored.imageWidth === null,
    stored.imageHeight === null,
    stored.detectedImageFormat === null ||
      stored.detectedImageFormat === fixture.expectedImageFormat,
  ].every(Boolean)

const readySeedFileMatches = (
  stored: SeedFile,
  fixture: DevelopmentFileFixture
) =>
  [
    stored.status === "ready",
    normalizeEtag(stored.etag ?? "") === fixture.md5,
    stored.detectedImageFormat === fixture.expectedImageFormat,
    stored.imageWidth === fixture.expectedImageWidth,
    stored.imageHeight === fixture.expectedImageHeight,
  ].every(Boolean)

const readSeedBytes = async (
  request: Request,
  fixture: DevelopmentFileFixture
) => {
  const contentLength = Number(request.headers.get("content-length"))
  if (contentLength !== fixture.sizeBytes) return null
  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.byteLength !== fixture.sizeBytes) return null
  return (await sha256(bytes)) === fixture.sha256 ? bytes : null
}

const reconcileFixture = async (
  db: Db,
  request: Request,
  fixture: DevelopmentFileFixture
) => {
  const stored = await findFileByUploadId(db, {
    organizationId: fixture.organizationId,
    uploadId: fixture.uploadId,
  })
  // 通常のseed再実行で利用者が削除したmanifest rowを復活させない。
  if (!stored) return response(204)
  if (!seedFileIdentityMatches(stored, fixture)) {
    return response(409)
  }

  if (!pendingSeedMetadataMatches(stored, fixture)) {
    return response(409)
  }

  const runtime = getFileStorageRuntime()
  let object = await runtime.bucket.head(fixture.objectKey)
  if (object && !seedObjectMatches(object, fixture)) {
    // 未知metadataのobjectを上書きもcleanupもしない。
    return response(409)
  }

  if (stored.status === "ready") {
    if (!readySeedFileMatches(stored, fixture)) {
      return response(409)
    }
    if (object) return response(204)
  }

  if (!object) {
    const bytes = await readSeedBytes(request, fixture)
    if (!bytes) return response(400)

    await runtime.bucket.put(fixture.objectKey, new Blob([bytes]).stream(), {
      onlyIf: new Headers({ "if-none-match": "*" }),
      httpMetadata: { contentType: "application/octet-stream" },
      customMetadata: {
        fileId: fixture.id,
        uploadId: fixture.uploadId,
        expectedSize: String(fixture.sizeBytes),
      },
    })
    object = await runtime.bucket.head(fixture.objectKey)
    if (!object || !seedObjectMatches(object, fixture)) {
      return response(409)
    }
  }

  if (stored.status === "ready") return response(204)

  if (stored.detectedImageFormat !== fixture.expectedImageFormat) {
    await db
      .update(files)
      .set({
        detectedImageFormat: fixture.expectedImageFormat,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(files.id, fixture.id),
          eq(files.organizationId, fixture.organizationId),
          eq(files.status, "pending")
        )
      )
  }

  const pending = await findFileByUploadId(db, {
    organizationId: fixture.organizationId,
    uploadId: fixture.uploadId,
  })
  if (!pending || pending.status !== "pending") return response(409)

  await createFileReconciliationApplication(db).reconcilePendingUpload({
    actorUserId: fixture.uploaderId,
    file: pending,
    runtime,
  })

  const ready = await findFileByUploadId(db, {
    organizationId: fixture.organizationId,
    uploadId: fixture.uploadId,
  })
  if (!ready || !readySeedFileMatches(ready, fixture)) {
    return response(409)
  }
  return response(204)
}

/**
 * Elysia/OpenAPIより前で処理するlocal-only endpoint。
 * 対象pathでなければnullを返し、通常appへ委譲する。
 */
export const handleDevelopmentFileSeedRequest = async (
  db: Db,
  request: Request,
  environment: DevelopmentFileSeedEnvironment
): Promise<Response | null> => {
  const readinessRequest = isReadinessRequest(request)
  const fixture = findFixture(request)
  if (!readinessRequest && !fixture) return null
  if (
    (readinessRequest ? request.method !== "GET" : request.method !== "POST") ||
    environment.NODE_ENV !== "development" ||
    !isLoopbackRequest(request) ||
    !isLocalDatabaseUrl(environment.TURSO_DATABASE_URL)
  ) {
    return response(404)
  }

  const token = environment.DEV_FILE_SEED_TOKEN
  if (
    !token ||
    token.length < 32 ||
    request.headers.get("authorization") !== `Bearer ${token}`
  ) {
    return response(401)
  }

  try {
    if (readinessRequest) {
      // session tokenだけでなく、seed対象schemaへ接続できることも確認する。
      await db.select({ id: files.id }).from(files).limit(1)
      return response(204)
    }
    if (!fixture) return response(404)
    return await reconcileFixture(db, request, fixture)
  } catch {
    // provider/DB raw error、object key、fixture名をresponse/logへ出さない。
    return response(503)
  }
}
