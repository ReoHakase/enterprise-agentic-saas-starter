import type { Locator, Page } from "@playwright/test"

const isActiveElement = (element: Element) => element === document.activeElement

const activeElementSummary = () => {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return "no active HTMLElement"

  return [
    active.tagName.toLowerCase(),
    active.getAttribute("role"),
    active.getAttribute("aria-label"),
    active.textContent?.trim().slice(0, 80),
  ]
    .filter(Boolean)
    .join(" | ")
}

export const tabTo = async (
  page: Page,
  target: Locator,
  options: { maxTabs?: number; reverse?: boolean } = {}
) => {
  const maxTabs = options.maxTabs ?? 120
  // Safari/WebKit follows the platform default where links require
  // Option+Tab. Chromium returns during the first two passes.
  const keys = options.reverse
    ? (["Shift+Tab", "Tab", "Alt+Shift+Tab", "Alt+Tab"] as const)
    : (["Tab", "Shift+Tab", "Alt+Tab", "Alt+Shift+Tab"] as const)
  await target.waitFor({ state: "visible" })

  for (const key of keys) {
    for (let index = 0; index <= maxTabs; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- Tab navigation is sequential by definition.
      if (await target.evaluate(isActiveElement).catch(() => false)) return
      // oxlint-disable-next-line no-await-in-loop -- The next focus target depends on the previous keypress.
      await page.keyboard.press(key)
    }
  }

  const active = await page.evaluate(activeElementSummary)
  throw new Error(
    `Could not reach target with standard or Safari link Tab navigation: ${active}`
  )
}

export const activate = async (page: Page, target: Locator) => {
  await tabTo(page, target)
  await page.keyboard.press("Enter")
}

export const replaceText = async (
  page: Page,
  target: Locator,
  value: string
) => {
  await tabTo(page, target)
  await page.keyboard.press("ControlOrMeta+A")
  await page.keyboard.press("Backspace")
  await page.keyboard.insertText(value)
}
