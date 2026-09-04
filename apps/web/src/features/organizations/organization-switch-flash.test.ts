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

describe("組織切替通知", () => {
  it("待機中のテナント切替通知を1回だけ消費する", () => {
    const storage = createStorage()

    queueOrganizationSwitchFlash(storage)

    expect(consumeOrganizationSwitchFlash(storage)).toBe(true)
    expect(consumeOrganizationSwitchFlash(storage)).toBe(false)
  })

  it("storage利用不能時もテナントへの遷移を妨げない", () => {
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
