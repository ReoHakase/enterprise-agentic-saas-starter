import { afterEach, describe, expect, it } from "vitest"

import { isAgentHotkeyAllowed } from "./hotkey-scope"

afterEach(() => document.body.replaceChildren())

describe("isAgentHotkeyAllowed", () => {
  it("allows an ordinary non-IME shortcut", () => {
    expect(isAgentHotkeyAllowed({ isComposing: false })).toBe(true)
  })

  it("blocks IME composition and modal scope", () => {
    expect(isAgentHotkeyAllowed({ isComposing: true })).toBe(false)
    const dialog = document.createElement("div")
    dialog.role = "dialog"
    document.body.appendChild(dialog)
    expect(isAgentHotkeyAllowed({ isComposing: false })).toBe(false)
  })
})
