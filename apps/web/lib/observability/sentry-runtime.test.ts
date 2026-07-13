import { describe, expect, it } from "vitest"

import {
  resolveSampleRate,
  resolveSentryDsn,
  resolveSpotlightConfig,
} from "./sentry-runtime"

describe("Sentry runtime configuration", () => {
  it("only enables Spotlight for a local development endpoint", () => {
    expect(resolveSpotlightConfig("1", "development")).toBe(true)
    expect(
      resolveSpotlightConfig("http://localhost:8969/stream", "development")
    ).toBe("http://localhost:8969/stream")
    expect(
      resolveSpotlightConfig(
        "https://telemetry.example.com/stream",
        "development"
      )
    ).toBe(false)
    expect(
      resolveSpotlightConfig(
        "http://user:password@localhost:8969/stream",
        "development"
      )
    ).toBe(false)
    expect(resolveSpotlightConfig("1", "production")).toBe(false)
  })

  it("uses a production DSN only when Spotlight is disabled", () => {
    expect(
      resolveSentryDsn(
        " https://key@o0.ingest.sentry.io/1 ",
        "production",
        false
      )
    ).toBe("https://key@o0.ingest.sentry.io/1")
    expect(
      resolveSentryDsn(
        "https://key@o0.ingest.sentry.io/1",
        "development",
        false
      )
    ).toBeUndefined()
    expect(
      resolveSentryDsn("https://key@o0.ingest.sentry.io/1", "development", true)
    ).toBeUndefined()
  })

  it("bounds sample rates and falls back for invalid input", () => {
    expect(resolveSampleRate("0.25", 0.1)).toBe(0.25)
    expect(resolveSampleRate("2", 0.1)).toBe(0.1)
    expect(resolveSampleRate("not-a-number", 0.1)).toBe(0.1)
  })
})
