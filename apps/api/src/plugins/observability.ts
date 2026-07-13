import { Elysia, StatusMap } from "elysia"

import {
  logObservedResponse,
  setObservedRequestContext,
} from "../observability/runtime"

const startedAt = new WeakMap<Request, number>()

const requestIdFor = (responseRequestId: number | string | undefined): string =>
  String(responseRequestId ?? "request-id-unavailable")

const statusCodeFor = (
  status: keyof typeof StatusMap | number | undefined,
  responseValue: unknown
): number => {
  if (typeof status === "number") {
    return status
  }

  if (typeof status === "string") {
    return StatusMap[status] ?? 500
  }

  return responseValue instanceof Response ? responseValue.status : 200
}

export const observabilityPlugin = new Elysia({
  name: "observability-context",
})
  .onRequest(({ request, set }) => {
    startedAt.set(request, performance.now())
    setObservedRequestContext({
      method: request.method,
      requestId: requestIdFor(set.headers["x-request-id"]),
      route: "unmatched",
    })
  })
  .onBeforeHandle(({ request, route, set }) => {
    const requestId = requestIdFor(set.headers["x-request-id"])
    setObservedRequestContext({
      method: request.method,
      requestId,
      route: route || "unmatched",
    })
  })
  .onAfterResponse(({ request, responseValue, route, set }) => {
    const started = startedAt.get(request)
    startedAt.delete(request)

    const statusCode = statusCodeFor(set.status, responseValue)
    const requestId = requestIdFor(set.headers["x-request-id"])
    const level =
      statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info"

    logObservedResponse(level, {
      duration_ms:
        started === undefined
          ? undefined
          : Number((performance.now() - started).toFixed(2)),
      http_method: request.method,
      http_route: route || "unmatched",
      http_status_code: statusCode,
      request_id: requestId,
    })
  })
  .as("global")
