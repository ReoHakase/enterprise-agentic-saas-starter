import { describe, expect, it } from "vitest"

import { parseDevelopmentSeedSession } from "./session"

describe("development seed session", () => {
  it("accepts only an explicit local supervisor session", () => {
    const valid = {
      endpoint: "http://127.0.0.1:8787",
      mode: "local",
      token: "x".repeat(64),
    } as const

    expect(parseDevelopmentSeedSession(valid)).toEqual(valid)
    expect(() =>
      parseDevelopmentSeedSession({ ...valid, mode: "remote" })
    ).toThrow(/invalid/i)
    expect(() =>
      parseDevelopmentSeedSession({
        ...valid,
        endpoint: "https://api.example.com",
      })
    ).toThrow(/invalid/i)
    expect(() =>
      parseDevelopmentSeedSession({ ...valid, token: "short" })
    ).toThrow(/invalid/i)
  })
})
