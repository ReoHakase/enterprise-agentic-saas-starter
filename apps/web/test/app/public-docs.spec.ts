import type { Page } from "@playwright/test"

import { expect, test } from "./fixtures/test"

const expectPublicDocRoute = async (page: Page, route: string) => {
  await page.goto(route)
  await expect(page.locator("[data-docs-page]")).toBeVisible()
  await expect(page.locator("[data-console-shell]")).toHaveCount(0)
}

test.describe("public documentation", () => {
  test("renders without authentication or the console shell", async ({
    page,
  }) => {
    await page.goto("/docs")

    await expect(page).toHaveURL(/\/docs$/u)
    await expect(
      page.getByRole("heading", { name: "Documentation", exact: true })
    ).toBeVisible()
    await expect(page.locator("[data-console-shell]")).toHaveCount(0)
    await expect(
      page.getByRole("link", { name: "Manual", exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole("link", { name: "Developer documentation", exact: true })
    ).toBeVisible()
  })

  test("serves the manual, public specifications, and privacy draft", async ({
    page,
  }) => {
    await expectPublicDocRoute(page, "/docs/manual")
    await expectPublicDocRoute(page, "/docs/developers/mcp")
    await expectPublicDocRoute(page, "/docs/developers/skills")
    await expectPublicDocRoute(page, "/docs/privacy")

    await page.goto("/docs/developers/mcp")
    await expect(
      page.getByRole("heading", { name: "MCP specification", exact: true })
    ).toBeVisible()
    await expect(
      page.getByText("guide://enterprise-agentic-saas/issues", { exact: true })
    ).toBeVisible()
  })

  test("returns the public docs not-found page", async ({ page }) => {
    await page.goto("/docs/not-a-real-page")
    await expect(
      page.getByRole("heading", {
        name: "Documentation page not found",
        exact: true,
      })
    ).toBeVisible()
    await expect(page.locator("[data-console-shell]")).toHaveCount(0)
  })

  test("searches and navigates through public documentation", async ({
    page,
  }) => {
    await page.goto("/docs")

    const trigger = page.getByRole("button", {
      name: "Search documentation",
      exact: true,
    })
    await trigger.click()

    const input = page.getByRole("textbox", {
      name: "Search documentation",
      exact: true,
    })
    await expect(input).toBeFocused()
    await input.fill("MCP")

    const result = page.getByRole("link", { name: /MCP/i }).first()
    await expect(result).toBeVisible()
    await result.click()

    await expect(page).toHaveURL(/\/docs\/developers\/mcp$/)
    await expect(
      page.getByRole("heading", { name: "MCP specification", exact: true })
    ).toBeVisible()

    await trigger.click()
    await expect(input).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(trigger).toBeFocused()
  })

  test("shows an empty search state", async ({ page }) => {
    await page.goto("/docs")
    await page.getByRole("button", { name: "Search documentation" }).click()
    await page
      .getByRole("textbox", { name: "Search documentation" })
      .fill("not-a-real-documentation-term")

    await expect(
      page.getByText("No documentation results found.", { exact: true })
    ).toBeVisible()
  })

  test("shows the search loading state", async ({ page }) => {
    let releaseSearch: (() => void) | undefined
    const searchPending = new Promise<void>((resolve) => {
      releaseSearch = resolve
    })

    await page.route("**/api/search**", async (route) => {
      await searchPending
      await route.continue()
    })
    await page.goto("/docs")
    await page.getByRole("button", { name: "Search documentation" }).click()
    await page
      .getByRole("textbox", { name: "Search documentation" })
      .fill("MCP")

    const status = page.getByRole("status")
    await expect(status).toHaveText("Searching documentation…")
    releaseSearch?.()
  })

  test("shows the search error state", async ({ page, allowClientErrors }) => {
    allowClientErrors(/Failed to load resource:.*503/u)
    await page.route("**/api/search**", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "text/plain",
        body: "Search unavailable",
      })
    })
    await page.goto("/docs")
    await page.getByRole("button", { name: "Search documentation" }).click()
    await page
      .getByRole("textbox", { name: "Search documentation" })
      .fill("MCP")

    await expect(page.locator('p[role="alert"]')).toHaveText(
      "Search is temporarily unavailable. Try again."
    )
  })

  test("searches only the public documentation source", async ({ request }) => {
    const response = await request.get("/api/search?query=MCP")

    expect(response.ok()).toBe(true)
    const results: Array<{ url?: unknown }> = await response.json()

    expect(results.length).toBeGreaterThan(0)
    expect(
      results.some((result) => result.url === "/docs/developers/mcp")
    ).toBe(true)
    expect(
      results.every(
        (result) =>
          typeof result.url === "string" && result.url.startsWith("/docs")
      )
    ).toBe(true)
  })
})
