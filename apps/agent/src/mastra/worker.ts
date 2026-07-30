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
const AGENT_SERVICE_NAME = "enterprise-agentic-saas-agent"
const LOCAL_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/u

const localRequestIdentity = (request?: Request) => {
  const sessionId = request?.headers.get("x-dev-session-id")?.trim()
  const worktreeId = request?.headers.get("x-dev-worktree-id")?.trim()
  return sessionId &&
    worktreeId &&
    LOCAL_ID_PATTERN.test(sessionId) &&
    LOCAL_ID_PATTERN.test(worktreeId)
    ? { sessionId, worktreeId }
    : undefined
}

const resolveLocalTelemetryResource = (
  environment: AgentRuntimeEnv,
  request?: Request
) => {
  const requestIdentity = localRequestIdentity(request)
  const sessionId =
    requestIdentity?.sessionId ?? environment.DEV_SESSION_ID?.trim()
  const worktreeId =
    requestIdentity?.worktreeId ?? environment.DEV_WORKTREE_ID?.trim()
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
    "service.name": AGENT_SERVICE_NAME,
  }
}

const connectMastraLoggerProvider = (environment: AgentRuntimeEnv) => {
  if (mastraLoggerProviderConnected) return
  const provider: OtelLoggerProvider = {
    getLogger(name) {
      const scope = `mastra.${name}`
      const logger = getLogger(`${AGENT_SERVICE_NAME}.${scope}`)
      const resource = resolveLocalTelemetryResource(environment)
      if (resource) logger.setProperties(resource)
      return {
        enabled: () => true,
        emit(record) {
          logger.emit({
            attributes: {
              ...record.attributes,
              "logger.scope": scope,
            },
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
type AgentLogLevel = "debug" | "error" | "info" | "warn"
type AgentRuntimeOperation = {
  name: string
  operation: string
  scope: string
}
type AgentLogger = {
  child(segment: string, attributes?: AgentHttpTelemetryAttributes): AgentLogger
  log(
    level: AgentLogLevel,
    message: string,
    attributes?: AgentHttpTelemetryAttributes
  ): void
}

const resolveAgentRuntimeOperation = (
  method: string,
  path: string
): AgentRuntimeOperation => {
  if (method === "POST" && path === "/chat") {
    return {
      name: "Agent chat",
      operation: "streamAgentChat",
      scope: "chat",
    }
  }
  if (method === "POST" && path === "/actions/resume") {
    return {
      name: "Agent action resume",
      operation: "resumeAgentAction",
      scope: "action-resume",
    }
  }
  if (method === "POST" && path === "/memory/history") {
    return {
      name: "Agent memory history",
      operation: "listAgentThreadMessages",
      scope: "memory-history",
    }
  }
  if (method === "POST" && path === "/memory/threads") {
    return {
      name: "Agent memory thread list",
      operation: "listAgentThreads",
      scope: "memory-threads",
    }
  }
  if (
    method === "POST" &&
    /^\/runs\/[A-Za-z0-9_-]{1,128}\/cancel$/u.test(path)
  ) {
    return {
      name: "Agent run cancellation",
      operation: "cancelAgentRun",
      scope: "run-cancel",
    }
  }
  return {
    name: "Agent runtime request",
    operation: "handleAgentRuntimeRequest",
    scope: "request",
  }
}

const definedAgentHttpAttributes = (attributes: AgentHttpTelemetryAttributes) =>
  Object.fromEntries(
    Object.entries(attributes).filter(
      (entry): entry is [string, boolean | number | string] =>
        entry[1] !== undefined
    )
  )

const createAgentLogger = (
  resource: ReturnType<typeof resolveLocalTelemetryResource>,
  scope: string,
  baseAttributes: AgentHttpTelemetryAttributes = {}
): AgentLogger => ({
  child: (segment, attributes = {}) =>
    createAgentLogger(resource, `${scope}.${segment}`, {
      ...baseAttributes,
      ...attributes,
    }),
  log(level, message, attributes = {}) {
    if (!resource) return
    const eventAttributes = definedAgentHttpAttributes({
      ...resource,
      ...baseAttributes,
      ...attributes,
      "event.name": message,
      "logger.scope": scope,
    })
    trace.getActiveSpan()?.addEvent(message, eventAttributes)
    const logger = getLogger(`${AGENT_SERVICE_NAME}.${scope}`)
    logger.setProperties(resource)
    logger[level](message, eventAttributes)
  },
})

const flushAgentTelemetry = async (input: {
  attributes: AgentHttpTelemetryAttributes
  composition: ReturnType<typeof getAgentIsolateComposition>
  logger: AgentLogger
  operation: AgentRuntimeOperation
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
                input.logger.log(
                  "debug",
                  `${input.operation.name} first byte`,
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
      input.logger.log("info", `${input.operation.name} completed`, {
        ...input.attributes,
        "app.outcome": "success",
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
      input.logger.log("error", `${input.operation.name} stream failed`, {
        ...input.attributes,
        "app.outcome": "failure",
        byte_count: byteCount,
        chunk_count: chunkCount,
      })
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
    const operation = resolveAgentRuntimeOperation(request.method, requestPath)
    const activeContext = otelContext.active()
    const telemetryResource = resolveLocalTelemetryResource(
      environment,
      request
    )
    if (telemetryResource) {
      trace.getActiveSpan()?.setAttributes(telemetryResource)
    }
    const logger = createAgentLogger(telemetryResource, "http", {
      "http.request.method": request.method,
      "http.route": requestPath,
    })
    const runtimeLogger = createAgentLogger(telemetryResource, "runtime").child(
      operation.scope,
      {
        "app.operation": operation.operation,
      }
    )
    runtimeLogger.log("debug", `${operation.name} dispatched`, {
      "agent.runtime.route": requestPath,
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
      logger.log("error", "Agent request failed", {
        duration_ms: Number((performance.now() - requestStartedAt).toFixed(2)),
        "http.request.method": request.method,
        "http.route": requestPath,
      })
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
    runtimeLogger.log(
      response.status >= 500
        ? "error"
        : response.status >= 400
          ? "warn"
          : "debug",
      `${operation.name} response created`,
      responseAttributes
    )
    logger.log(
      response.status >= 500
        ? "error"
        : response.status >= 400
          ? "warn"
          : "debug",
      "Agent response headers returned",
      responseAttributes
    )
    if (!response.body) {
      context.waitUntil(
        flushAgentTelemetry({
          attributes: responseAttributes,
          composition,
          logger: runtimeLogger,
          operation,
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
            ...telemetryResource,
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
        logger: runtimeLogger,
        operation,
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
  environment,
  trigger
) => {
  const resource = resolveLocalTelemetryResource(
    environment,
    trigger instanceof Request ? trigger : undefined
  )
  if (!resource) {
    return { service: { name: AGENT_SERVICE_NAME } }
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
