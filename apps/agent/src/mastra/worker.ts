import {
  getLogger,
  instrument,
  OTLPTransport,
  withNextSpan,
  type ResolveConfigFn,
} from "@inference-net/otel-cf-workers"
import {
  context as otelContext,
  SpanStatusCode,
  trace,
  type Context,
  type Span,
} from "@opentelemetry/api"
import {
  logs,
  type LoggerProvider as OtelLoggerProvider,
} from "@opentelemetry/api-logs"
import { WorkerEntrypoint } from "cloudflare:workers"

import {
  createAgentInternalGateway,
  toAgentControlFailure,
} from "./adapters/control-plane/client"
import { createAgentFailureCapture } from "./adapters/telemetry/capture"
import type { AgentRuntimeEnv } from "./composition/environment"
import { getAgentIsolateComposition } from "./composition/isolate-composition"
import { handleAgentRuntimeRequest } from "./runtime/run-agent"

export { IssueAssistant } from "./legacy/issue-assistant"

let mastraLoggerProviderConnected = false
const LOCAL_OTLP_HTTP_ENDPOINT = "http://127.0.0.1:4318"

const resolveLocalTelemetryResource = (environment: AgentRuntimeEnv) => {
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
    "service.name": "enterprise-agentic-saas-agent",
  }
}

const connectMastraLoggerProvider = (environment: AgentRuntimeEnv) => {
  if (mastraLoggerProviderConnected) return
  const provider: OtelLoggerProvider = {
    getLogger(name) {
      const logger = getLogger(name)
      const resource = resolveLocalTelemetryResource(environment)
      if (resource) logger.setProperties(resource)
      return {
        enabled: () => true,
        emit(record) {
          logger.emit({
            attributes: record.attributes ?? {},
            body:
              typeof record.body === "string" ||
              (record.body !== null && typeof record.body === "object")
                ? record.body
                : String(record.body ?? ""),
            severityText: record.severityText,
          })
        },
      }
    },
  }
  logs.setGlobalLoggerProvider(provider)
  mastraLoggerProviderConnected = true
}

type AgentHttpTelemetryAttributes = Record<
  string,
  boolean | number | string | undefined
>

const definedAgentHttpAttributes = (attributes: AgentHttpTelemetryAttributes) =>
  Object.fromEntries(
    Object.entries(attributes).filter(
      (entry): entry is [string, boolean | number | string] =>
        entry[1] !== undefined
    )
  )

const logAgentHttpEvent = (
  environment: AgentRuntimeEnv,
  message: string,
  attributes: AgentHttpTelemetryAttributes,
  level: "error" | "info" | "warn" = "info"
) => {
  const resource = resolveLocalTelemetryResource(environment)
  if (!resource) return
  const eventAttributes = definedAgentHttpAttributes({
    ...resource,
    ...attributes,
    "event.name": message,
  })
  trace.getActiveSpan()?.addEvent(message, eventAttributes)
  getLogger("enterprise-agentic-saas-agent")[level](message, eventAttributes)
}

const flushAgentTelemetry = async (input: {
  attributes: AgentHttpTelemetryAttributes
  composition: ReturnType<typeof getAgentIsolateComposition>
  environment: AgentRuntimeEnv
  pending: Set<Promise<unknown>>
  requestContext: Context
  startedAt: number
  streamStartedAt: number
  stream?: ReadableStream<Uint8Array>
  streamSpan?: Span
}) => {
  let byteCount = 0
  let chunkCount = 0
  let firstByteAt: number | undefined
  try {
    if (input.stream) {
      await input.stream.pipeTo(
        new WritableStream({
          write(chunk) {
            if (firstByteAt === undefined) {
              const observedAt = performance.now()
              firstByteAt = observedAt
              otelContext.with(input.requestContext, () => {
                logAgentHttpEvent(
                  input.environment,
                  "Agent response first byte",
                  {
                    ...input.attributes,
                    time_to_first_byte_ms: Number(
                      (observedAt - input.startedAt).toFixed(2)
                    ),
                  }
                )
              })
            }
            byteCount += chunk.byteLength
            chunkCount += 1
          },
        })
      )
    }
    const completedAt = performance.now()
    input.streamSpan?.setAttributes({
      "agent.stream.byte_count": byteCount,
      "agent.stream.chunk_count": chunkCount,
      "agent.stream.duration_ms": Number(
        (completedAt - input.streamStartedAt).toFixed(2)
      ),
    })
    otelContext.with(input.requestContext, () => {
      logAgentHttpEvent(input.environment, "Agent request completed", {
        ...input.attributes,
        byte_count: byteCount,
        chunk_count: chunkCount,
        duration_ms: Number((completedAt - input.startedAt).toFixed(2)),
      })
    })
  } catch {
    input.streamSpan?.setStatus({
      code: SpanStatusCode.ERROR,
      message: "Agent response stream failed",
    })
    otelContext.with(input.requestContext, () => {
      logAgentHttpEvent(
        input.environment,
        "Agent response stream failed",
        {
          ...input.attributes,
          byte_count: byteCount,
          chunk_count: chunkCount,
        },
        "error"
      )
    })
  } finally {
    input.streamSpan?.end()
  }
  await Promise.allSettled(input.pending)
  await Promise.race([
    input.composition.mastra.observability.flush().catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
  ])
}

const agentRuntimeHandler = {
  async fetch(
    request: Request,
    environment: AgentRuntimeEnv,
    context: ExecutionContext
  ): Promise<Response> {
    connectMastraLoggerProvider(environment)
    const composition = getAgentIsolateComposition(environment)
    const requestStartedAt = performance.now()
    const requestPath = new URL(request.url).pathname
    const activeContext = otelContext.active()
    logAgentHttpEvent(environment, "Agent request started", {
      "http.request.method": request.method,
      "http.route": requestPath,
    })
    const pending = new Set<Promise<unknown>>()
    const observedContext = {
      waitUntil(promise: Promise<unknown>) {
        pending.add(promise)
        void promise.then(
          () => pending.delete(promise),
          () => pending.delete(promise)
        )
        context.waitUntil(promise)
      },
    }
    let response: Response
    try {
      response = await handleAgentRuntimeRequest(
        request,
        environment,
        observedContext,
        {
          captureFailure: createAgentFailureCapture(environment),
          createControlPlane: createAgentInternalGateway,
          executionRegistry: composition.executionRegistry,
          createApprovalResumeRuntime: composition.createApprovalResumeRuntime,
          mastra: composition.mastra,
          requireModelCredential: true,
          threadTitleAgent: composition.threadTitleAgent,
          toControlFailure: toAgentControlFailure,
        }
      )
    } catch (error) {
      trace
        .getActiveSpan()
        ?.recordException(new Error("Agent request handler failed"))
      logAgentHttpEvent(
        environment,
        "Agent request failed",
        {
          duration_ms: Number(
            (performance.now() - requestStartedAt).toFixed(2)
          ),
          "http.request.method": request.method,
          "http.route": requestPath,
        },
        "error"
      )
      throw error
    }
    const responseAttributes = {
      "http.request.method": request.method,
      "http.response.status_code": response.status,
      "http.route": requestPath,
      response_header_duration_ms: Number(
        (performance.now() - requestStartedAt).toFixed(2)
      ),
    }
    logAgentHttpEvent(
      environment,
      "Agent response headers returned",
      responseAttributes,
      response.status >= 500
        ? "error"
        : response.status >= 400
          ? "warn"
          : "info"
    )
    if (!response.body) {
      context.waitUntil(
        flushAgentTelemetry({
          attributes: responseAttributes,
          composition,
          environment,
          pending,
          requestContext: activeContext,
          startedAt: requestStartedAt,
          streamStartedAt: requestStartedAt,
        })
      )
      return response
    }
    const [clientBody, telemetryBody] = response.body.tee()
    const streamStartedAt = performance.now()
    const streamSpan = trace
      .getTracer("enterprise-agentic-saas-agent")
      .startSpan(
        "Agent response stream",
        {
          attributes: definedAgentHttpAttributes({
            ...resolveLocalTelemetryResource(environment),
            ...responseAttributes,
          }),
        },
        activeContext
      )
    const streamContext = trace.setSpan(activeContext, streamSpan)
    context.waitUntil(
      flushAgentTelemetry({
        attributes: responseAttributes,
        composition,
        environment,
        pending,
        requestContext: streamContext,
        startedAt: requestStartedAt,
        streamStartedAt,
        stream: telemetryBody,
        streamSpan,
      })
    )
    return new Response(clientBody, response)
  },
}

export const createAgentOtelConfig: ResolveConfigFn<AgentRuntimeEnv> = (
  environment
) => {
  const resource = resolveLocalTelemetryResource(environment)
  if (!resource) {
    return { service: { name: "enterprise-agentic-saas-agent" } }
  }
  withNextSpan(resource)
  return {
    service: { name: resource["service.name"] },
    trace: {
      exporter: { url: `${LOCAL_OTLP_HTTP_ENDPOINT}/v1/traces` },
      batching: { strategy: "immediate" },
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

const instrumentedAgentRuntime = instrument(
  agentRuntimeHandler,
  createAgentOtelConfig
)
const fetchInstrumentedAgent = async (
  request: Request<unknown, IncomingRequestCfProperties<unknown>>,
  environment: AgentRuntimeEnv,
  context: ExecutionContext
): Promise<Response> => {
  const fetchHandler = instrumentedAgentRuntime.fetch
  if (!fetchHandler) {
    throw new Error("Instrumented Agent runtime is missing its fetch handler")
  }
  return await fetchHandler(request, environment, context)
}

export class AgentRuntime extends WorkerEntrypoint<AgentRuntimeEnv> {
  fetch(
    request: Request<unknown, IncomingRequestCfProperties<unknown>>
  ): Promise<Response> {
    return fetchInstrumentedAgent(request, this.env, this.ctx)
  }
}

export default instrument(
  {
    fetch: () =>
      new Response("Not found", {
        status: 404,
        headers: {
          "cache-control": "private, no-store",
          "content-type": "text/plain; charset=utf-8",
        },
      }),
  } satisfies ExportedHandler<AgentRuntimeEnv>,
  createAgentOtelConfig
)
