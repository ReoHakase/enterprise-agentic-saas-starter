import { Elysia } from "elysia"

import { HttpError } from "../../errors/http-error"
import { env } from "../env"

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"])
const csrfExemptProtocolPaths = new Set([
  "/auth/oauth2/introspect",
  "/auth/oauth2/register",
  "/auth/oauth2/revoke",
  "/auth/oauth2/token",
  "/mcp",
])

const isCsrfExemptProtocolPath = (pathname: string) =>
  csrfExemptProtocolPaths.has(pathname) || pathname.startsWith("/mcp/uploads/")

const normalizeOrigin = (value: string) => {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

const allowedOrigins = new Set(
  [...env.CORS_ORIGIN, env.API_PUBLIC_URL]
    .map(normalizeOrigin)
    .filter((origin): origin is string => origin !== null)
)

export const csrfPlugin = new Elysia({ name: "csrf" })
  .onBeforeHandle({ as: "global" }, ({ request }) => {
    if (!unsafeMethods.has(request.method)) {
      return
    }

    if (isCsrfExemptProtocolPath(new URL(request.url).pathname)) {
      return
    }

    const origin = request.headers.get("origin")
    if (!origin) {
      throw new HttpError({ code: "csrf_origin_forbidden" })
    }
    const normalized = normalizeOrigin(origin)
    if (!normalized || !allowedOrigins.has(normalized)) {
      throw new HttpError({ code: "csrf_origin_forbidden" })
    }
  })
  .as("global")
