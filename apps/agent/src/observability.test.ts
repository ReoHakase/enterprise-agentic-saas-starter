import { describe, expect, it } from "vitest"

import {
  createAgentSentryOptions,
  filterAgentSentryIntegrations,
  scrubAgentSentryEvent,
  scrubAgentSentryLog,
  scrubAgentSentrySpan,
} from "./observability"

describe("Agent Sentry privacy", () => {
  it("removes tickets, grants, prompts, tool payloads, request data, and identity", () => {
    const ticket = "ticket_0123456789abcdefghijklmnopqrstuvwxyz"
    const event = scrubAgentSentryEvent({
      breadcrumbs: [{ message: `prompt ${ticket}` }],
      contexts: { toolPayload: { title: "private issue" } },
      exception: {
        values: [{ type: "ProviderError", value: `grant ${ticket}` }],
      },
      extra: { prompt: "private prompt", resumeTicket: ticket },
      message: `provider failed for ${ticket}`,
      request: {
        cookies: { session: ticket },
        data: { prompt: "private prompt" },
        headers: { authorization: `Bearer ${ticket}` },
        method: "GET",
        query_string: `ticket=${ticket}`,
        url: `https://agent.example/agents/issue-assistant/thread_1?ticket=${ticket}`,
      },
      tags: {
        component: "agent-worker",
        errorCode: "model_failed",
        organizationId: "org_private",
      },
      transaction: `GET /agents/issue-assistant/thread_private?ticket=${ticket}`,
      user: { id: "user_private" },
    })

    expect(event).toMatchObject({
      breadcrumbs: [],
      exception: {
        values: [{ type: "AgentRuntimeError", value: "Agent runtime error" }],
      },
      message: "Agent runtime error",
      request: { method: "GET" },
      tags: { component: "agent-worker", errorCode: "model_failed" },
      transaction: "GET /agents/issue-assistant/:threadId",
    })
    const serialized = JSON.stringify(event)
    expect(serialized).not.toContain(ticket)
    expect(serialized).not.toContain("private prompt")
    expect(serialized).not.toContain("private issue")
    expect(serialized).not.toContain("org_private")
    expect(serialized).not.toContain("user_private")
  })

  it("drops unsafe log attributes and all span data", () => {
    const log = scrubAgentSentryLog({
      attributes: {
        component: "agent-worker",
        prompt: "secret",
        resumeTicket: "ticket_secret",
      },
      message: ["payload", { title: "secret" }],
    })
    const span = scrubAgentSentrySpan({
      data: { grant: "grant_secret", toolPayload: { title: "secret" } },
      description: "POST https://internal/action?ticket=secret",
      op: "http.client",
    })

    expect(log).toEqual({
      attributes: { component: "agent-worker" },
      message: "Agent runtime log",
    })
    expect(span).toEqual({
      data: {},
      description: "Agent operation",
      op: "http.client",
    })

    expect(
      scrubAgentSentryLog({ message: "secret without attributes" })
    ).toEqual({ attributes: undefined, message: "Agent runtime log" })
    expect(scrubAgentSentrySpan({ data: { prompt: "secret" } })).toEqual({
      data: {},
      description: undefined,
    })
  })

  it("handles sparse events without manufacturing private context", () => {
    expect(
      scrubAgentSentryEvent({
        exception: { values: [{ value: "private" }] },
        tags: { component: "bad value", errorCode: 42 },
        transaction: "",
      })
    ).toEqual({
      breadcrumbs: [],
      exception: {
        values: [{ type: "AgentRuntimeError", value: "Agent runtime error" }],
      },
      message: undefined,
      tags: {},
      transaction: "UNKNOWN /unmatched",
    })
  })

  it("keeps only opaque trace IDs and a normalized dynamic sampling route", () => {
    const ticket = "ticket_0123456789abcdefghijklmnopqrstuvwxyz"
    const event = scrubAgentSentryEvent({
      contexts: {
        trace: {
          data: { prompt: "secret" },
          op: "http.server",
          span_id: "0123456789abcdef",
          trace_id: "0123456789abcdef0123456789abcdef",
        },
      },
      sdkProcessingMetadata: {
        dynamicSamplingContext: {
          public_key: "0123456789abcdef0123456789abcdef",
          trace_id: "0123456789abcdef0123456789abcdef",
          transaction: `GET /agents/issue-assistant/thread_private?ticket=${ticket}`,
          user_segment: "organization_private",
        },
        ipAddress: "192.0.2.1",
        normalizedRequest: {
          headers: { authorization: `Bearer ${ticket}` },
          url: `https://agent.example/?ticket=${ticket}`,
        },
      },
    })

    expect(event).toEqual({
      breadcrumbs: [],
      contexts: {
        trace: {
          op: "http.server",
          span_id: "0123456789abcdef",
          trace_id: "0123456789abcdef0123456789abcdef",
        },
      },
      message: undefined,
      sdkProcessingMetadata: {
        dynamicSamplingContext: {
          public_key: "0123456789abcdef0123456789abcdef",
          trace_id: "0123456789abcdef0123456789abcdef",
          transaction: "GET /agents/issue-assistant/:threadId",
        },
      },
      tags: undefined,
    })
    const serialized = JSON.stringify(event)
    expect(serialized).not.toContain(ticket)
    expect(serialized).not.toContain("organization_private")
    expect(serialized).not.toContain("192.0.2.1")
    expect(serialized).not.toContain("secret")
  })

  it("uses an independent environment/release and conservative integrations", () => {
    const options = createAgentSentryOptions({
      SENTRY_DSN: "https://public@example.invalid/1",
      SENTRY_ENVIRONMENT: "agent-production",
      SENTRY_RELEASE: "agent@sha",
      SENTRY_TRACES_SAMPLE_RATE: "0.25",
    })

    expect(options).toMatchObject({
      dsn: "https://public@example.invalid/1",
      enableLogs: false,
      enableRpcTracePropagation: false,
      environment: "agent-production",
      release: "agent@sha",
      sendDefaultPii: false,
      tracesSampleRate: 0.25,
    })
    expect(
      filterAgentSentryIntegrations([
        { name: "Console" },
        { name: "LinkedErrors" },
        { name: "RequestData" },
        { name: "Fetch" },
      ])
    ).toEqual([{ name: "Fetch" }])
    expect(
      createAgentSentryOptions({ SENTRY_TRACES_SAMPLE_RATE: "private" })
        .tracesSampleRate
    ).toBe(0.1)
    expect(
      createAgentSentryOptions({
        NODE_ENV: "development",
        SENTRY_TRACES_SAMPLE_RATE: "-1",
      })
    ).toMatchObject({ environment: "development", tracesSampleRate: 0.1 })
    expect(
      createAgentSentryOptions({ SENTRY_TRACES_SAMPLE_RATE: "2" })
    ).toMatchObject({ environment: "production", tracesSampleRate: 0.1 })
    expect(options.beforeBreadcrumb()).toBeNull()
  })
})
