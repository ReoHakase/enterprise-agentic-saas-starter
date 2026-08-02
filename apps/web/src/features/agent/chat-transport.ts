import { context, SpanStatusCode, trace, type Span } from "@opentelemetry/api"
import { logs, SeverityNumber } from "@opentelemetry/api-logs"
import { DefaultChatTransport } from "ai"

import { reportObservedError } from "@/lib/report-observed-error"

import { prepareAgentChatBody } from "./chat-request-body"
import type { AgentChatMessage } from "./schema"

const agentChatUrl = (baseUrl: string) => {
  const url = new URL(baseUrl)
  const basePath = url.pathname.replace(/\/$/u, "")
  url.pathname = `${basePath}/agent/chat`
  url.search = ""
  url.hash = ""
  return url.toString()
}

const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

type ChatTelemetryAttributes = Record<
  string,
  boolean | number | string | undefined
>

const definedAttributes = (attributes: ChatTelemetryAttributes) =>
  Object.fromEntries(
    Object.entries(attributes).filter(
      (entry): entry is [string, boolean | number | string] =>
        entry[1] !== undefined
    )
  )

const emitChatEvent = (
  span: Span,
  message: string,
  attributes: ChatTelemetryAttributes,
  severityNumber = SeverityNumber.INFO
) => {
  if (process.env.NODE_ENV !== "development") return
  const eventAttributes = definedAttributes({
    ...attributes,
    "event.name": message,
  })
  context.with(trace.setSpan(context.active(), span), () => {
    logs.getLogger("enterprise-agentic-saas-web-browser").emit({
      attributes: eventAttributes,
      body: message,
      severityNumber,
      severityText:
        severityNumber === SeverityNumber.ERROR
          ? "ERROR"
          : severityNumber === SeverityNumber.WARN
            ? "WARN"
            : "INFO",
    })
  })
}

const requestAttributes = (
  body: BodyInit | null | undefined,
  threadId: string
): ChatTelemetryAttributes => {
  if (typeof body !== "string") {
    return { "agent.thread.id": threadId }
  }
  try {
    const parsed: unknown = JSON.parse(body)
    if (typeof parsed !== "object" || parsed === null) {
      return { "agent.thread.id": threadId }
    }
    const input: Record<string, unknown> = Object.fromEntries(
      Object.entries(parsed)
    )
    return {
      "agent.chat.asset_count": Array.isArray(input.assetIds)
        ? input.assetIds.length
        : 0,
      "agent.chat.client_tool_result_count": Array.isArray(
        input.clientToolResults
      )
        ? input.clientToolResults.length
        : 0,
      "agent.chat.content_segment_count": Array.isArray(input.contentSegments)
        ? input.contentSegments.length
        : 0,
      "agent.chat.kind": Array.isArray(input.clientToolResults)
        ? "client-tool-continuation"
        : "user-message",
      "agent.thread.id":
        typeof input.threadId === "string" ? input.threadId : threadId,
    }
  } catch {
    return { "agent.thread.id": threadId }
  }
}

const observeChatResponse = async (
  body: ReadableStream<Uint8Array>,
  span: Span,
  startedAt: number,
  attributes: ChatTelemetryAttributes
): Promise<void> => {
  let byteCount = 0
  let chunkCount = 0
  let firstByteAt: number | undefined
  try {
    await body.pipeTo(
      new WritableStream({
        write(chunk) {
          const now = performance.now()
          if (firstByteAt === undefined) {
            firstByteAt = now
            emitChatEvent(span, "agent.chat.response.first_byte", {
              ...attributes,
              time_to_first_byte_ms: Number((now - startedAt).toFixed(2)),
            })
          }
          byteCount += chunk.byteLength
          chunkCount += 1
        },
      })
    )
    const completedAt = performance.now()
    span.setAttributes(
      definedAttributes({
        "agent.stream.byte_count": byteCount,
        "agent.stream.chunk_count": chunkCount,
        "agent.stream.duration_ms": Number(
          (completedAt - (firstByteAt ?? completedAt)).toFixed(2)
        ),
      })
    )
    emitChatEvent(span, "agent.chat.response.stream_completed", {
      ...attributes,
      byte_count: byteCount,
      chunk_count: chunkCount,
      duration_ms: Number((completedAt - startedAt).toFixed(2)),
      stream_duration_ms: Number(
        (completedAt - (firstByteAt ?? completedAt)).toFixed(2)
      ),
    })
  } catch (error) {
    context.with(trace.setSpan(context.active(), span), () => {
      reportObservedError(error, {
        httpMethod: "POST",
        httpRoute: "/agent/chat",
        httpStatus:
          typeof attributes["http.response.status_code"] === "number"
            ? attributes["http.response.status_code"]
            : undefined,
        operation: "agent.chat.stream",
        requestId:
          typeof attributes.request_id === "string"
            ? attributes.request_id
            : undefined,
      })
    })
    emitChatEvent(
      span,
      "agent.chat.response.stream_failed",
      {
        ...attributes,
        byte_count: byteCount,
        chunk_count: chunkCount,
      },
      SeverityNumber.ERROR
    )
  } finally {
    span.end()
  }
}

const createObservedChatFetch = (threadId: string): typeof globalThis.fetch => {
  const observedFetch = async (
    ...[request, init]: Parameters<typeof globalThis.fetch>
  ): Promise<Response> => {
    const attributes = requestAttributes(init?.body, threadId)
    const startedAt = performance.now()
    const span = trace
      .getTracer("enterprise-agentic-saas-web-browser")
      .startSpan("Web Agent chat", {
        attributes: definedAttributes({
          ...attributes,
          "http.request.method": "POST",
          "http.route": "/agent/chat",
        }),
      })
    emitChatEvent(span, "agent.chat.request.started", attributes)
    try {
      const response = await context.with(
        trace.setSpan(context.active(), span),
        () => globalThis.fetch(request, init)
      )
      const responseAttributes = {
        ...attributes,
        "http.response.status_code": response.status,
        request_id: response.headers.get("x-request-id") ?? undefined,
      }
      span.setAttribute("http.response.status_code", response.status)
      if (!response.ok) {
        span.setAttribute("app.error.code", "http_error")
        span.setStatus({ code: SpanStatusCode.ERROR })
      }
      emitChatEvent(
        span,
        "agent.chat.response.headers_received",
        responseAttributes,
        response.ok ? SeverityNumber.INFO : SeverityNumber.WARN
      )
      if (!response.body) {
        span.end()
        return response
      }
      const [clientBody, telemetryBody] = response.body.tee()
      void observeChatResponse(
        telemetryBody,
        span,
        startedAt,
        responseAttributes
      )
      return new Response(clientBody, response)
    } catch (error) {
      context.with(trace.setSpan(context.active(), span), () => {
        reportObservedError(error, {
          httpMethod: "POST",
          httpRoute: "/agent/chat",
          operation: "agent.chat.request",
        })
      })
      emitChatEvent(
        span,
        "agent.chat.request.failed",
        {
          ...attributes,
        },
        SeverityNumber.ERROR
      )
      span.end()
      throw error
    }
  }
  return Object.assign(observedFetch, {
    preconnect() {
      // AI SDK only calls this value as fetch; Bun adds the static type member.
    },
  })
}

export const createAgentChatTransport = (input: {
  apiBaseUrl: string
  threadId: string
  getTimezone?: () => string
}) =>
  new DefaultChatTransport<AgentChatMessage>({
    api: agentChatUrl(input.apiBaseUrl),
    credentials: "include",
    ...(process.env.NODE_ENV === "development"
      ? { fetch: createObservedChatFetch(input.threadId) }
      : {}),
    prepareSendMessagesRequest: ({ messages }) => ({
      credentials: "include",
      body: prepareAgentChatBody({
        threadId: input.threadId,
        messages,
        timezone: (input.getTimezone ?? browserTimezone)(),
      }),
    }),
  })
