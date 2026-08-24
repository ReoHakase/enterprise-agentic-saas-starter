import { afterEach, describe, expect, it } from "vitest"

import { isAgentHotkeyAllowed } from "./hotkey-scope"

afterEach(() => document.body.replaceChildren())

describe("isAgentHotkeyAllowedの契約", () => {
  it("IME 以外の通常のショートカットを許可する", () => {
    expect(isAgentHotkeyAllowed({ isComposing: false })).toBe(true)
  })

  it("IME入力中はショートカットを拒否する", () => {
    expect(isAgentHotkeyAllowed({ isComposing: true })).toBe(false)
  })

  it("モーダルscopeではショートカットを拒否する", () => {
    const dialog = document.createElement("div")
    dialog.role = "dialog"
    document.body.appendChild(dialog)
    expect(isAgentHotkeyAllowed({ isComposing: false })).toBe(false)
  })
})
