import {
  getLogger,
  instrument,
  OTLPTransport,
  withNextSpan,
  type ResolveConfigFn,
} from "@inference-net/otel-cf-workers"
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

const agentRuntimeHandler = {
  async fetch(
    request: Request,
    environment: AgentRuntimeEnv,
    context: ExecutionContext
  ): Promise<Response> {
    connectMastraLoggerProvider(environment)
    const composition = getAgentIsolateComposition(environment)
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
    const response = await handleAgentRuntimeRequest(
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
    const flushAfterStream = async (stream?: ReadableStream<Uint8Array>) => {
      if (stream) {
        await stream.pipeTo(new WritableStream())
      }
      await Promise.allSettled(pending)
      await Promise.race([
        composition.mastra.observability.flush().catch(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
      ])
    }
    if (!response.body) {
      context.waitUntil(flushAfterStream())
      return response
    }
    const [clientBody, telemetryBody] = response.body.tee()
    context.waitUntil(flushAfterStream(telemetryBody))
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
