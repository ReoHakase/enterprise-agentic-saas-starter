import { clientEnv } from "@/lib/env"

const safeOrigin = (value: string | undefined) => {
  if (!value) return undefined
  try {
    return new URL(value).origin
  } catch {
    return undefined
  }
}

const connectSources = [
  "'self'",
  safeOrigin(clientEnv.VITE_API_BASE_URL),
  safeOrigin(clientEnv.VITE_OTEL_EXPORTER_OTLP_ENDPOINT),
].filter((value): value is string => Boolean(value))

const GET_ONLY_ALLOWED_METHODS = "GET, HEAD, OPTIONS"

const applyWebResponseHeaders = (headers: Headers) => {
  headers.set(
    "Content-Security-Policy",
    `connect-src ${[...new Set(connectSources)].join(" ")}`
  )
  headers.set("Referrer-Policy", "same-origin")
  return headers
}

export const createWebResponseHeaders = (headers?: HeadersInit) =>
  Object.fromEntries(applyWebResponseHeaders(new Headers(headers)))

export const withWebResponseHeaders = (response: Response) =>
  new Response(response.body, {
    headers: applyWebResponseHeaders(new Headers(response.headers)),
    status: response.status,
    statusText: response.statusText,
  })

export const createGetOnlyOptionsResponse = () =>
  new Response(null, {
    headers: createWebResponseHeaders({ Allow: GET_ONLY_ALLOWED_METHODS }),
    status: 204,
  })

export const createMethodNotAllowedResponse = () =>
  new Response("Method Not Allowed", {
    headers: createWebResponseHeaders({ Allow: GET_ONLY_ALLOWED_METHODS }),
    status: 405,
  })
