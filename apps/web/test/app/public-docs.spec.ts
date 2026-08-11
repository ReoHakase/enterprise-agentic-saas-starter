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
})
