import { trustedRequestId } from "../../platform/plugins/request-id"

const maintenanceHeaders = (request?: Request) => ({
  "cache-control": "private, no-store",
  "retry-after": "300",
  "x-request-id": trustedRequestId(
    request?.headers.get("x-request-id") ?? null
  ),
})

export const isAgentMaintenanceMode = (value: string | undefined): boolean =>
  value === "1"

export const agentMaintenanceResponse = (request?: Request): Response =>
  Response.json(
    {
      error: "service_unavailable",
      message: "Agent maintenance is in progress.",
    },
    { status: 503, headers: maintenanceHeaders(request) }
  )

const agentUnavailableResponse = (request: Request): Response =>
  Response.json(
    {
      error: "service_unavailable",
      message: "Agent is temporarily unavailable.",
    },
    { status: 503, headers: maintenanceHeaders(request) }
  )

const isPublicAgentCapabilityPath = (pathname: string): boolean =>
  pathname === "/agent" ||
  pathname.startsWith("/agent/") ||
  /^\/files\/organizations\/[^/]+\/agent-threads\/[^/]+\/assets$/.test(
    pathname
  ) ||
  /^\/files\/organizations\/[^/]+\/agent-assets\/[^/]+(?:\/preview\/[^/]+)?$/.test(
    pathname
  )

export const publicAgentRuntimeGateResponse = (
  request: Request,
  input: { maintenanceMode: string | undefined; runtimeAvailable: boolean }
): Response | null => {
  if (!isPublicAgentCapabilityPath(new URL(request.url).pathname)) return null
  if (isAgentMaintenanceMode(input.maintenanceMode)) {
    return agentMaintenanceResponse(request)
  }
  return input.runtimeAvailable ? null : agentUnavailableResponse(request)
}
