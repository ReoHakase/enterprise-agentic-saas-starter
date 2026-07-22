import { Elysia } from "elysia"
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker"

import { agentAssetUploadBodyModel } from "../../modules/files/model"
import type { FileR2Bucket } from "../../modules/files/runtime"

type UploadMemorySmokeEnvironment = {
  FILES: FileR2Bucket
}

let bucket: FileR2Bucket | undefined

const app = new Elysia({ adapter: CloudflareAdapter })
  .get("/health", () => new Response(null, { status: 204 }))
  .post(
    "/upload",
    async ({ body }) => {
      const requestBucket = bucket
      if (!requestBucket) return new Response(null, { status: 503 })
      if (body.file.size !== body.fileSize) {
        return new Response(null, { status: 400 })
      }

      const key = `upload-memory-smoke/${crypto.randomUUID()}`
      let stored = false
      try {
        const object = await requestBucket.put(key, body.file.stream(), {
          onlyIf: new Headers({ "if-none-match": "*" }),
          httpMetadata: { contentType: "application/octet-stream" },
          customMetadata: {
            expectedSize: String(body.fileSize),
            uploadId: body.uploadId,
          },
          storageClass: "Standard",
        })
        stored = object !== null
        if (!object || object.size !== body.fileSize) {
          return new Response(null, { status: 409 })
        }
        return new Response(null, { status: 204 })
      } catch {
        return new Response(null, { status: 503 })
      } finally {
        if (stored) {
          try {
            await requestBucket.delete(key)
          } catch {
            // 一時local bucketはprocess終了時にも削除する。provider詳細は出さない。
          }
        }
      }
    },
    {
      parse: "multipart/form-data",
      body: agentAssetUploadBodyModel,
    }
  )
  .compile()

const appFetch = app.fetch.bind(app)

export default {
  fetch(request: Request, environment: UploadMemorySmokeEnvironment) {
    bucket = environment.FILES
    return appFetch(request)
  },
}
