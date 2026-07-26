import { Elysia } from "elysia"

import { publicErrors } from "../../errors/app-error"
import { env } from "../env"

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"])

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

    const origin = request.headers.get("origin")
    if (!origin) {
      throw publicErrors.csrfOriginForbidden("missing_origin")
    }
    const normalized = normalizeOrigin(origin)
    if (!normalized || !allowedOrigins.has(normalized)) {
      throw publicErrors.csrfOriginForbidden("untrusted_origin")
    }
  })
  .as("global")
