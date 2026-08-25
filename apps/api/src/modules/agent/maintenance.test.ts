import { describe, expect, it } from "vitest"

import {
  agentMaintenanceResponse,
  isAgentMaintenanceMode,
  publicAgentRuntimeGateResponse,
} from "./maintenance"

describe("Agent maintenance境界", () => {
  it("すべての公開Agent routeへ安定したunavailable responseを返す", async () => {
    await Promise.all(
      [
        "/agent",
        "/agent/threads",
        "/agent/chat",
        "/files/organizations/org_1/agent-threads/thread_1/assets",
        "/files/organizations/org_1/agent-assets/asset_1",
        "/files/organizations/org_1/agent-assets/asset_1/preview/720",
      ].map(async (pathname) => {
        const response = publicAgentRuntimeGateResponse(
          new Request(`https://api.example.test${pathname}`),
          { maintenanceMode: "1", runtimeAvailable: false }
        )
        expect(response?.status).toBe(503)
        expect(response?.headers.get("retry-after")).toBe("300")
        expect(response?.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/)
        expect(await response?.json()).toEqual({
          error: "service_unavailable",
          message: "Agent maintenance is in progress.",
        })
      })
    )
    expect(
      publicAgentRuntimeGateResponse(
        new Request("https://api.example.test/health"),
        { maintenanceMode: "1", runtimeAvailable: false }
      )
    ).toBeNull()
    for (const pathname of [
      "/files/organizations/org_1/threads/thread_1/assets",
      "/files/organizations/org_1/agent-assets",
      "/files/organizations/org_1/agent-assets/asset_1/other/720",
      "/files/agent-assets/asset_1",
    ]) {
      expect(
        publicAgentRuntimeGateResponse(
          new Request(`https://api.example.test${pathname}`),
          { maintenanceMode: "1", runtimeAvailable: false }
        )
      ).toBeNull()
    }
  })

  it("正確なenabled値を要求してnamed entrypointを保護する", async () => {
    expect(isAgentMaintenanceMode("1")).toBe(true)
    expect(isAgentMaintenanceMode("0")).toBe(false)
    expect(isAgentMaintenanceMode(undefined)).toBe(false)
    const response = agentMaintenanceResponse(
      new Request("https://api.example.test/agent", {
        headers: { "x-request-id": "request-maintenance" },
      })
    )
    expect(response.status).toBe(503)
    expect(response.headers.get("x-request-id")).toBe("request-maintenance")
    expect(await response.json()).toEqual({
      error: "service_unavailable",
      message: "Agent maintenance is in progress.",
    })
    const unavailable = publicAgentRuntimeGateResponse(
      new Request("https://api.example.test/agent/threads"),
      { maintenanceMode: "0", runtimeAvailable: false }
    )
    expect(unavailable?.status).toBe(503)
    expect(await unavailable?.json()).toEqual({
      error: "service_unavailable",
      message: "Agent is temporarily unavailable.",
    })
    expect(
      publicAgentRuntimeGateResponse(
        new Request("https://api.example.test/agent/threads"),
        { maintenanceMode: "0", runtimeAvailable: true }
      )
    ).toBeNull()
  })
})
