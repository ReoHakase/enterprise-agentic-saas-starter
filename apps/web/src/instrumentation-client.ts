import { trace, type Span } from "@opentelemetry/api"
import { logs } from "@opentelemetry/api-logs"
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { registerInstrumentations } from "@opentelemetry/instrumentation"
import {
  DocumentLoadInstrumentation,
  type DocumentLoadCustomAttributeFunction,
  type ResourceFetchCustomAttributeFunction,
} from "@opentelemetry/instrumentation-document-load"
import {
  FetchInstrumentation,
  type FetchCustomAttributeFunction,
  type FetchRequestHookFunction,
} from "@opentelemetry/instrumentation-fetch"
import { resourceFromAttributes } from "@opentelemetry/resources"
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from "@opentelemetry/sdk-logs"
import {
  BatchSpanProcessor,
  WebTracerProvider,
} from "@opentelemetry/sdk-trace-web"

import { clientEnv } from "@/lib/env"

const LOCAL_OTLP_ENDPOINT = "https://otel.enterprise-agentic-saas.localhost"
let registered = false

const toTraceSafeUrl = (rawUrl: string) => {
  try {
    const url = new URL(rawUrl, location.origin)
    return `${url.origin}${url.pathname}`
  } catch {
    return location.origin
  }
}

const setTraceSafeUrl = (span: Span, rawUrl: string) => {
  span.setAttribute("url.full", toTraceSafeUrl(rawUrl))
}

const sanitizeDocumentSpanUrl: DocumentLoadCustomAttributeFunction = (span) => {
  setTraceSafeUrl(span, location.href)
}

const sanitizeResourceSpanUrl: ResourceFetchCustomAttributeFunction = (
  span,
  resource
) => {
  setTraceSafeUrl(span, resource.name)
}

const sanitizeFetchRequestUrl: FetchRequestHookFunction = (span, request) => {
  setTraceSafeUrl(
    span,
    request instanceof Request ? request.url : location.origin
  )
}

const sanitizeFetchResultUrl: FetchCustomAttributeFunction = (
  span,
  request,
  result
) => {
  const rawUrl =
    result instanceof Response && result.url
      ? result.url
      : request instanceof Request
        ? request.url
        : location.origin
  setTraceSafeUrl(span, rawUrl)
}

export const registerClientObservability = (): boolean => {
  if (registered) return true
  const endpoint = clientEnv.VITE_OTEL_EXPORTER_OTLP_ENDPOINT
  const sessionId = clientEnv.VITE_DEV_SESSION_ID?.trim()
  const worktreeId = clientEnv.VITE_DEV_WORKTREE_ID?.trim()
  if (
    import.meta.env.MODE !== "development" ||
    endpoint !== LOCAL_OTLP_ENDPOINT ||
    !sessionId ||
    !worktreeId
  )
    return false
  const resource = resourceFromAttributes({
    "dev.session.id": sessionId,
    "dev.worktree.id": worktreeId,
    "service.name": "enterprise-agentic-saas-web-browser",
  })
  const tracerProvider = new WebTracerProvider({
    resource,
    spanProcessors: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({ url: `${endpoint}/v1/traces` })
      ),
    ],
  })
  tracerProvider.register()
  logs.setGlobalLoggerProvider(
    new LoggerProvider({
      processors: [
        new BatchLogRecordProcessor({
          exporter: new OTLPLogExporter({ url: `${endpoint}/v1/logs` }),
        }),
      ],
      resource,
    })
  )
  registerInstrumentations({
    instrumentations: [
      new DocumentLoadInstrumentation({
        applyCustomAttributesOnSpan: {
          documentFetch: sanitizeDocumentSpanUrl,
          documentLoad: sanitizeDocumentSpanUrl,
          resourceFetch: sanitizeResourceSpanUrl,
        },
      }),
      new FetchInstrumentation({
        applyCustomAttributesOnSpan: sanitizeFetchResultUrl,
        clearTimingResources: true,
        ignoreUrls: [/otel\.enterprise-agentic-saas\.localhost\/v1\//u],
        propagateTraceHeaderCorsUrls: [
          /^https:\/\/api(?:\.[a-z0-9-]+)*\.enterprise-agentic-saas\.localhost/iu,
        ],
        requestHook: sanitizeFetchRequestUrl,
      }),
    ],
    tracerProvider,
  })
  registered = true
  return true
}

export const onRouterTransitionStart = (
  href: string,
  navigationType: string
) => {
  let pathname = "/"
  try {
    pathname = new URL(href, "https://local.invalid").pathname
  } catch {
    // A malformed route must not break navigation or enter telemetry verbatim.
  }
  const span = trace
    .getTracer("enterprise-agentic-saas-web-browser")
    .startSpan("navigation", {
      attributes: {
        "navigation.type": navigationType,
        "url.path": pathname,
      },
    })
  span.end()
}
