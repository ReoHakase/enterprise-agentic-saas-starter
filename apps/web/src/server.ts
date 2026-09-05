import {
  getLogger,
  instrument,
  OTLPTransport,
  withNextSpan,
  type PostProcessorFn,
  type ResolveConfigFn,
} from "@inference-net/otel-cf-workers"
import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server"

import { configureServerDevelopmentCauseLogSink } from "@/lib/development-error"
import type { ServerEnvironment } from "@/lib/env.server"
import { withWebResponseHeaders } from "@/lib/web-response-headers"

const LOCAL_OTLP_HTTP_ENDPOINT = "http://127.0.0.1:4318"
const WEB_SERVER_SERVICE_NAME = "enterprise-agentic-saas-web-server"
const INTERNAL_REQUEST_PATH_PREFIXES = [
  "/_",
  "/@",
  "/assets/",
  "/node_modules/",
] as const

type WebWorkerEnvironment = CloudflareEnv &
  ServerEnvironment & {
    DEV_SESSION_ID?: string
    DEV_WORKTREE_ID?: string
    NODE_ENV?: string
    OTEL_EXPORTER_OTLP_ENDPOINT?: string
    PLAYWRIGHT_TEST?: string
    VITEST?: string
  }

type WorkerExecutionContext = {
  waitUntil(promise: Promise<unknown>): void
}

const sanitizeWebTraceUrls: PostProcessorFn = (spans) =>
  spans.map((span) => {
    const urlFull = span.attributes["url.full"]
    if (typeof urlFull === "string") {
      try {
        const url = new URL(urlFull)
        span.attributes["url.full"] = `${url.origin}${url.pathname}`
      } catch {
        delete span.attributes["url.full"]
      }
    } else {
      delete span.attributes["url.full"]
    }
    delete span.attributes["url.query"]
    return span
  })

const resolveLocalTelemetryResource = (environment: WebWorkerEnvironment) => {
  const sessionId = environment.DEV_SESSION_ID?.trim()
  const worktreeId = environment.DEV_WORKTREE_ID?.trim()
  if (
    environment.NODE_ENV !== "development" ||
    environment.OTEL_EXPORTER_OTLP_ENDPOINT !== LOCAL_OTLP_HTTP_ENDPOINT ||
    !sessionId ||
    !worktreeId
  )
    return undefined

  return {
    "dev.session.id": sessionId,
    "dev.worktree.id": worktreeId,
    "service.name": WEB_SERVER_SERVICE_NAME,
  }
}

export const resolveWebOtelConfig = (
  environment: WebWorkerEnvironment
): ReturnType<ResolveConfigFn<WebWorkerEnvironment>> => {
  const resource = resolveLocalTelemetryResource(environment)
  if (!resource) return { service: { name: WEB_SERVER_SERVICE_NAME } }

  withNextSpan(resource)
  return {
    service: { name: resource["service.name"] },
    trace: {
      exporter: { url: `${LOCAL_OTLP_HTTP_ENDPOINT}/v1/traces` },
      batching: { strategy: "immediate" },
      postProcessor: sanitizeWebTraceUrls,
    },
    logs: {
      batching: { strategy: "immediate" },
      instrumentation: { instrumentConsole: false },
      transports: [
        new OTLPTransport({ url: `${LOCAL_OTLP_HTTP_ENDPOINT}/v1/logs` }),
      ],
    },
  }
}

export const createWebOtelConfig: ResolveConfigFn<WebWorkerEnvironment> = (
  environment
) => resolveWebOtelConfig(environment)

configureServerDevelopmentCauseLogSink((record) => {
  getLogger(WEB_SERVER_SERVICE_NAME).error("Web development exception cause", {
    ...record,
  })
})

const startFetch = createStartHandler(defaultStreamHandler)

const createCanonicalPathRedirect = (request: Request) => {
  const url = new URL(request.url)
  if (
    url.pathname === "/" ||
    !url.pathname.endsWith("/") ||
    request.headers.get("x-tsr-serverFn") === "true" ||
    INTERNAL_REQUEST_PATH_PREFIXES.some((prefix) =>
      url.pathname.startsWith(prefix)
    )
  ) {
    return undefined
  }

  const pathname = url.pathname.replace(/\/+$/u, "") || "/"
  return new Response(null, {
    headers: { Location: `${pathname}${url.search}` },
    status: 308,
  })
}

const withHtmlDocumentAccept = (request: Request) => {
  const accept = request.headers.get("accept")
  if (
    (request.method !== "GET" && request.method !== "HEAD") ||
    !accept?.includes("text/markdown") ||
    accept.includes("text/html")
  ) {
    return request
  }

  const headers = new Headers(request.headers)
  headers.set("Accept", `${accept}, text/html`)
  return new Request(request, { headers })
}

const webWorker = {
  async fetch(
    request: Request,
    _environment: WebWorkerEnvironment,
    _context: WorkerExecutionContext
  ): Promise<Response> {
    const response = createCanonicalPathRedirect(request)
    return withWebResponseHeaders(
      response ?? (await startFetch(withHtmlDocumentAccept(request)))
    )
  },
}

export default instrument(webWorker, createWebOtelConfig)
