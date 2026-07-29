import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto"
import { resourceFromAttributes } from "@opentelemetry/resources"
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs"
import { NodeSDK } from "@opentelemetry/sdk-node"

import { reportObservedError } from "@/lib/report-observed-error"

const LOCAL_OTLP_ENDPOINT = "http://127.0.0.1:4318"
let serverObservability: NodeSDK | undefined

export const registerServerObservability = (): boolean => {
  if (serverObservability) return true
  const sessionId = process.env.DEV_SESSION_ID?.trim()
  const worktreeId = process.env.DEV_WORKTREE_ID?.trim()
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT !== LOCAL_OTLP_ENDPOINT ||
    !sessionId ||
    !worktreeId
  )
    return false
  const resource = resourceFromAttributes({
    "dev.session.id": sessionId,
    "dev.worktree.id": worktreeId,
    "service.name": "enterprise-agentic-saas-web-server",
  })
  const sdk = new NodeSDK({
    logRecordProcessors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({
          url: `${LOCAL_OTLP_ENDPOINT}/v1/logs`,
        }),
      }),
    ],
    resource,
    traceExporter: new OTLPTraceExporter({
      url: `${LOCAL_OTLP_ENDPOINT}/v1/traces`,
    }),
  })
  sdk.start()
  serverObservability = sdk
  return true
}

export const register = async () => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    registerServerObservability()
  }
}

export const onRequestError = (error: unknown) => reportObservedError(error)
