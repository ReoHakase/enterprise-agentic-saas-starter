const maintenanceHeaders = {
  "cache-control": "private, no-store",
  "content-type": "text/plain; charset=utf-8",
  "retry-after": "300",
}

export const isAgentMaintenanceMode = (value: string | undefined): boolean =>
  value === "1"

export const agentMaintenanceResponse = (): Response =>
  new Response("Agent maintenance in progress", {
    status: 503,
    headers: maintenanceHeaders,
  })

const agentUnavailableResponse = (): Response =>
  new Response("Agent unavailable", {
    status: 503,
    headers: maintenanceHeaders,
  })

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
    return agentMaintenanceResponse()
  }
  return input.runtimeAvailable ? null : agentUnavailableResponse()
}
