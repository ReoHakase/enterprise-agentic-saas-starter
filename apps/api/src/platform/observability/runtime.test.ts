import { afterEach, describe, expect, it, vi } from "vitest"

import {
  captureObservedException,
  configureObservability,
  createObservedLogger,
  injectObservedRequestHeaders,
  logObservedResponse,
  type ObservabilityRuntime,
  recordObservedHttpStatus,
  setObservedRequestContext,
  withObservedSpan,
} from "./runtime"

const spanLifecycle = { endWhen: () => undefined }

const noopRuntime = (): ObservabilityRuntime => ({
  captureException: () => undefined,
  injectRequestHeaders: () => undefined,
  logEvent: () => undefined,
  logResponse: () => undefined,
  recordHttpStatus: () => undefined,
  setRequestContext: () => undefined,
  startSpan: (_options, callback) => callback(spanLifecycle),
})

afterEach(() => {
  configureObservability(noopRuntime())
})

describe("observability runtime failure containment", () => {
  it("does not let telemetry side effects change application control flow", () => {
    const telemetryFailure = new Error("synthetic telemetry failure")
    configureObservability({
      captureException: () => {
        throw telemetryFailure
      },
      injectRequestHeaders: () => {
        throw telemetryFailure
      },
      logEvent: () => {
        throw telemetryFailure
      },
      logResponse: () => {
        throw telemetryFailure
      },
      recordHttpStatus: () => {
        throw telemetryFailure
      },
      setRequestContext: () => {
        throw telemetryFailure
      },
      startSpan: (_options, callback) => callback(spanLifecycle),
    })

    expect(() =>
      captureObservedException(new Error("application failure"), {
        errorCode: "internal_error",
        method: "GET",
        requestId: "request_1",
        route: "/synthetic",
        statusCode: 500,
      })
    ).not.toThrow()
    expect(() =>
      createObservedLogger("test").info("Synthetic event", {
        requestId: "request_1",
      })
    ).not.toThrow()
    expect(() =>
      logObservedResponse("error", {
        requestId: "request_1",
        statusCode: 500,
      })
    ).not.toThrow()
    expect(() => recordObservedHttpStatus(500, "internal_error")).not.toThrow()
    expect(() =>
      setObservedRequestContext({
        method: "GET",
        requestId: "request_1",
        route: "/synthetic",
      })
    ).not.toThrow()
    expect(() => injectObservedRequestHeaders(new Headers())).not.toThrow()
  })

  it("adds hierarchical logger scope and inherited attributes", () => {
    const logEvent = vi.fn<ObservabilityRuntime["logEvent"]>()
    configureObservability({ ...noopRuntime(), logEvent })

    createObservedLogger("agent", { component: "runtime" })
      .child("chat", { operation: "forward" })
      .debug("Agent request dispatched", { attempt: 1 })

    expect(logEvent).toHaveBeenCalledWith("debug", "Agent request dispatched", {
      attempt: 1,
      component: "runtime",
      "event.name": "Agent request dispatched",
      "logger.scope": "agent.chat",
      operation: "forward",
    })
  })

  it("executes the application callback once inside a span", () => {
    const callback = vi.fn<() => string>(() => "application result")
    configureObservability(noopRuntime())

    expect(
      withObservedSpan(
        {
          name: "synthetic span",
          op: "test",
        },
        callback
      )
    ).toBe("application result")
    expect(callback).toHaveBeenCalledOnce()
  })

  it.each(["before", "after"] as const)(
    "contains a span adapter that throws %s the application callback",
    (timing) => {
      const callback = vi.fn<() => string>(() => "application result")
      configureObservability({
        ...noopRuntime(),
        startSpan: (_options, run) => {
          if (timing === "before") {
            throw new Error("synthetic span setup failure")
          }
          run(spanLifecycle)
          throw new Error("synthetic span completion failure")
        },
      })

      expect(
        withObservedSpan(
          {
            name: "synthetic span",
            op: "test",
          },
          callback
        )
      ).toBe("application result")
      expect(callback).toHaveBeenCalledOnce()
    }
  )

  it("preserves an application error thrown inside a span", () => {
    const applicationFailure = new Error("synthetic application failure")
    configureObservability({
      ...noopRuntime(),
      startSpan: (_options, run) => run(spanLifecycle),
    })

    expect(() =>
      withObservedSpan(
        {
          name: "synthetic span",
          op: "test",
        },
        () => {
          throw applicationFailure
        }
      )
    ).toThrow(applicationFailure)
  })
})
