import { trace } from "@opentelemetry/api"
import { logs } from "@opentelemetry/api-logs"
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { registerInstrumentations } from "@opentelemetry/instrumentation"
import { DocumentLoadInstrumentation } from "@opentelemetry/instrumentation-document-load"
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch"
import { resourceFromAttributes } from "@opentelemetry/resources"
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from "@opentelemetry/sdk-logs"
import {
  BatchSpanProcessor,
  WebTracerProvider,
} from "@opentelemetry/sdk-trace-web"

import { clientEnv } from "@/lib/env.client"

const LOCAL_OTLP_ENDPOINT = "https://otel.enterprise-agentic-saas.localhost"
let registered = false

export const registerClientObservability = (): boolean => {
  if (registered) return true
  const endpoint = clientEnv.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT
  const sessionId = clientEnv.NEXT_PUBLIC_DEV_SESSION_ID?.trim()
  const worktreeId = clientEnv.NEXT_PUBLIC_DEV_WORKTREE_ID?.trim()
  if (
    process.env.NODE_ENV !== "development" ||
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
      new DocumentLoadInstrumentation(),
      new FetchInstrumentation({
        clearTimingResources: true,
        ignoreUrls: [/otel\.enterprise-agentic-saas\.localhost\/v1\//u],
        propagateTraceHeaderCorsUrls: [
          /^https:\/\/api(?:\.[a-z0-9-]+)*\.enterprise-agentic-saas\.localhost/iu,
        ],
      }),
    ],
    tracerProvider,
  })
  registered = true
  return true
}

registerClientObservability()

export const onRouterTransitionStart = (
  href: string,
  navigationType: string
) => {
  const span = trace
    .getTracer("enterprise-agentic-saas-web-browser")
    .startSpan("navigation", {
      attributes: {
        "navigation.type": navigationType,
        "url.path": href,
      },
    })
  span.end()
}
