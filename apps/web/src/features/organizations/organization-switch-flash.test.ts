import { describe, expect, it } from "vitest"

import {
  consumeOrganizationSwitchFlash,
  queueOrganizationSwitchFlash,
} from "./organization-switch-flash"

const createStorage = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

describe("organization switch flash", () => {
  it("consumes a queued tenant-switch notification exactly once", () => {
    const storage = createStorage()

    queueOrganizationSwitchFlash(storage)

    expect(consumeOrganizationSwitchFlash(storage)).toBe(true)
    expect(consumeOrganizationSwitchFlash(storage)).toBe(false)
  })

  it("does not block tenant navigation when storage is unavailable", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked")
      },
      removeItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
    }

    expect(() => queueOrganizationSwitchFlash(storage)).not.toThrow()
    expect(consumeOrganizationSwitchFlash(storage)).toBe(false)
  })
})
