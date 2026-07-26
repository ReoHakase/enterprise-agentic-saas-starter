import { describe, expect, it } from "vitest"

import { resolveSpotlightTarget } from "./spotlight"

describe("resolveSpotlightTarget", () => {
  it("developmentのboolean flagを有効にする", () => {
    expect(resolveSpotlightTarget("1", "development")).toBe(true)
    expect(resolveSpotlightTarget("true", "development")).toBe(true)
  })

  it("local sidecar URLだけを受理する", () => {
    expect(
      resolveSpotlightTarget("http://localhost:8969/stream", "development")
    ).toBe("http://localhost:8969/stream")
    expect(
      resolveSpotlightTarget(
        "http://host.docker.internal:8969/stream",
        "development"
      )
    ).toBe("http://host.docker.internal:8969/stream")
    expect(
      resolveSpotlightTarget("http://[::1]:8969/stream", "development")
    ).toBe("http://[::1]:8969/stream")
    expect(
      resolveSpotlightTarget(
        "https://spotlight.enterprise-agentic-saas.localhost/stream",
        "development"
      )
    ).toBe("https://spotlight.enterprise-agentic-saas.localhost/stream")
  })

  it("remote URLとcredential付きURLを拒否する", () => {
    expect(
      resolveSpotlightTarget("https://telemetry.example.com", "development")
    ).toBe(false)
    expect(
      resolveSpotlightTarget(
        "http://user:password@localhost:8969/stream",
        "development"
      )
    ).toBe(false)
  })

  it("productionでは常に無効にする", () => {
    expect(resolveSpotlightTarget("true", "production")).toBe(false)
    expect(
      resolveSpotlightTarget("http://localhost:8969/stream", "production")
    ).toBe(false)
    expect(resolveSpotlightTarget("true", "test")).toBe(false)
  })
})
