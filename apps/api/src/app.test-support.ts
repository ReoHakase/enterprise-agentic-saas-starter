import { createServer } from "node:http"

import type { createApp } from "./app"
import { env } from "./env"

export { createSeededDb, testDb } from "./app.test-database-support"

export const authHeaders = (
  userId: string,
  options: {
    activeOrganizationId?: string
    fresh?: boolean
    json?: boolean
    sessionId?: string
  } = {}
) => ({
  ...(options.json === false ? {} : { "content-type": "application/json" }),
  "x-test-user-id": userId,
  "x-test-active-organization-id": options.activeOrganizationId ?? "org_1",
  ...(options.sessionId ? { "x-test-session-id": options.sessionId } : {}),
  "x-test-session-created-at": (options.fresh === false
    ? new Date(0)
    : new Date()
  ).toISOString(),
  origin: env.CORS_ORIGIN[0] ?? env.API_PUBLIC_URL,
})

export const jsonRequest = (
  path: string,
  input: {
    body?: unknown
    method?: string
    userId: string
    activeOrganizationId?: string
    fresh?: boolean
    sessionId?: string
  }
) =>
  new Request(`http://localhost${path}`, {
    method: input.method ?? "GET",
    headers: authHeaders(input.userId, {
      activeOrganizationId: input.activeOrganizationId,
      fresh: input.fresh,
      sessionId: input.sessionId,
    }),
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  })

export const startHttpServer = async (app: ReturnType<typeof createApp>) => {
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks: Uint8Array[] = []
      for await (const chunk of incoming) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
      }

      const headers = new Headers()
      for (const [name, value] of Object.entries(incoming.headers)) {
        for (const item of Array.isArray(value) ? value : [value]) {
          if (item !== undefined) {
            headers.append(name, item)
          }
        }
      }

      const body =
        chunks.length > 0
          ? new Uint8Array(
              Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
            )
          : undefined
      const response = await app.handle(
        new Request(
          `http://${incoming.headers.host ?? "127.0.0.1"}${incoming.url ?? "/"}`,
          {
            method: incoming.method,
            headers,
            body,
          }
        )
      )

      outgoing.statusCode = response.status
      response.headers.forEach((value, name) => {
        outgoing.setHeader(name, value)
      })
      outgoing.end(Buffer.from(await response.arrayBuffer()))
    } catch {
      outgoing.statusCode = 500
      outgoing.end()
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (!address || typeof address === "string") {
    throw new Error("Test HTTP server did not expose a TCP port")
  }

  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      }),
    origin: `http://127.0.0.1:${address.port}`,
  }
}
