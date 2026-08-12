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
      page.locator("[data-docs-sidebar]").getByRole("link", {
        name: "Manual",
        exact: true,
      })
    ).toBeVisible()
    await expect(
      page.getByRole("link", { name: "Developers", exact: true }).first()
    ).toBeVisible()
    await expect(
      page.getByRole("link", { name: "Privacy Policy", exact: true })
    ).toBeVisible()
    await Promise.all(
      ["Manual", "Developers", "Privacy Policy"].map((name) =>
        expect(
          page
            .locator("[data-docs-sidebar]")
            .getByRole("link", { name, exact: true })
            .locator("svg")
        ).toBeVisible()
      )
    )
    await expect(page.locator("[data-docs-sidebar]")).toContainText(
      "Documentation"
    )
    await expect(
      page.getByRole("button", {
        name: "Search Documentation",
        exact: true,
      })
    ).toBeVisible()
    await expect(
      page.getByRole("link", { name: "Open App", exact: true })
    ).toHaveAttribute("href", "/dashboard")
    await expect(page.locator("[data-docs-card]")).toHaveCount(3)
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
      page.getByRole("heading", { name: "MCP Specification", exact: true })
    ).toBeVisible()
    await expect(
      page.getByText("guide://enterprise-agentic-saas/issues", { exact: true })
    ).toBeVisible()
    await expect(page.locator("[data-docs-page-header]")).toBeVisible()
    await expect(page.locator("[data-docs-page-icon] svg")).toBeVisible()
    await expect(page.locator("[data-docs-breadcrumb]")).toContainText(
      "Developers"
    )
    await expect(page.locator("[data-doc-last-updated]")).toContainText(
      "Last updated"
    )
  })

  test("shows the table of contents and heading link controls", async ({
    page,
  }) => {
    await page.goto("/docs/developers/mcp")

    await expect(page.locator('[data-docs-toc="desktop"]')).toBeVisible()
    await expect(page.locator('[data-docs-toc="desktop"]')).toHaveCSS(
      "position",
      "sticky"
    )
    await expect(page.locator('[data-docs-toc="mobile"]')).toBeHidden()
    const desktopToc = page.locator('[data-docs-toc="desktop"]')
    await expect(
      desktopToc.getByText("On This Page", { exact: true })
    ).toBeVisible()
    await expect(
      desktopToc.locator('a[href="#endpoint-and-transport"]')
    ).toBeVisible()

    const copyButton = page.getByRole("button", {
      name: "Copy link to Endpoint and transport",
      exact: true,
    })
    await expect(copyButton).toBeVisible()
    await copyButton.click()
    await expect(
      page.getByRole("button", { name: "Link copied", exact: true })
    ).toBeVisible()
  })

  test("uses the docs Open Graph fallback metadata", async ({ page }) => {
    await page.goto("/docs/developers/mcp")

    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      /\/docs\/opengraph-image(?:-[^/]+)?\.png(?:\?.*)?$/u
    )
    await expect(
      page.locator('meta[property="og:image:width"]')
    ).toHaveAttribute("content", "1774")
    await expect(
      page.locator('meta[property="og:image:height"]')
    ).toHaveAttribute("content", "887")
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
      name: "Search Documentation",
      exact: true,
    })
    await trigger.click()

    const input = page.getByRole("combobox", {
      name: "Search Documentation",
      exact: true,
    })
    await expect(input).toBeFocused()
    await expect(page.getByRole("dialog")).toHaveCSS("max-width", "896px")
    await input.fill("MCP")

    await expect(
      page.locator("[data-docs-search-highlight]").first()
    ).toBeVisible()
    await expect(
      page.locator("[data-docs-search-location]").first()
    ).toContainText("MCP Specification")
    await expect(
      page.locator("[data-docs-search-location]").first()
    ).not.toContainText("/docs/developers/mcp")
    await expect(
      page.locator("[data-docs-search-highlight]").first()
    ).toHaveClass(/bg-yellow-200/u)

    const searchStatus = page.locator(
      'p[aria-live="polite"][aria-atomic="true"]'
    )
    await expect(searchStatus).toHaveText(/\d+ documentation results found\./u)
    const results = page.locator("[data-docs-search-result]")
    await expect(results.nth(1)).toBeVisible()
    await input.press("ArrowDown")
    await expect(results.nth(1)).toHaveAttribute("data-active", "true")
    await input.press("End")
    await expect(results.last()).toHaveAttribute("data-active", "true")
    await expect(results.last()).toBeInViewport()
    await input.press("Home")
    await expect(results.first()).toHaveAttribute("data-active", "true")

    const result = page.getByRole("option", { name: /MCP/i }).first()
    await expect(result).toBeVisible()
    await result.click()

    await expect(page).toHaveURL(/\/docs\/developers\/mcp$/)
    await expect(
      page.getByRole("heading", { name: "MCP Specification", exact: true })
    ).toBeVisible()

    await trigger.click()
    await input.fill("tools/list")
    await expect(
      page.locator("[data-docs-search-result-content] code").first()
    ).toBeVisible()
    await input.fill("Privacy Policy")
    await expect(results.first()).toContainText("Privacy Policy")
    await input.press("Enter")
    await expect(page).toHaveURL(/\/docs\/privacy$/u)

    await trigger.click()
    await expect(input).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(trigger).toBeFocused()

    await page.keyboard.press("Control+k")
    await expect(input).toBeFocused()
    await page.keyboard.press("Escape")
  })

  test("shows an empty search state", async ({ page }) => {
    await page.goto("/docs")
    await page.getByRole("button", { name: "Search Documentation" }).click()
    await page
      .getByRole("combobox", { name: "Search Documentation" })
      .fill("not-a-real-documentation-term")

    await expect(
      page.getByText("No documentation results found.", { exact: true })
    ).toBeVisible()
  })

  test("renders GFM and MDX tab groups in developer documentation", async ({
    page,
  }) => {
    await page.goto("/docs/developers/mcp")

    await expect(page.locator("[data-docs-table]")).toBeVisible()
    await expect(page.locator("del")).toHaveText("implicit")
    await expect(page.locator('input[type="checkbox"]').first()).toBeVisible()
    await expect(page.getByRole("tab", { name: /TypeScript/u })).toBeVisible()

    const typescriptTab = page.getByRole("tab", { name: /TypeScript/u })
    await typescriptTab.focus()
    await typescriptTab.press("ArrowRight")
    await expect(page.getByRole("tab", { name: /cURL/u })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    await expect(
      page.locator("[data-docs-tab-panel]:not([hidden])")
    ).toContainText("curl")
  })

  test("renders the self-hosted documentation components", async ({ page }) => {
    await page.goto("/docs/developers/mcp")

    const coverTrigger = page.getByRole("button", {
      name: "Zoom documentation image",
      exact: true,
    })
    await expect(page.locator("[data-docs-cover] img")).toHaveAttribute(
      "src",
      /opengraph-image/u
    )
    await expect(page.locator("[data-docs-cover] img")).not.toHaveAttribute(
      "loading",
      "lazy"
    )
    await coverTrigger.click()
    await expect(page.locator("[data-docs-zoom-dialog]")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(coverTrigger).toBeFocused()

    const codeBlock = page.locator("[data-docs-code-block]").first()
    await expect(codeBlock).toContainText("TypeScript client")
    await expect(codeBlock.locator("figcaption svg")).toBeVisible()
    await expect(
      codeBlock.getByRole("button", { name: "Copy code" })
    ).toBeVisible()
    const syntaxColorCount = await codeBlock
      .locator("span[style*='--shiki-light']")
      .evaluateAll(
        (tokens) =>
          new Set(tokens.map((token) => getComputedStyle(token).color)).size
      )
    expect(syntaxColorCount).toBeGreaterThan(1)

    await expect(page.locator("[data-docs-files]")).toContainText("client.ts")
    await expect(page.locator("ol[data-docs-steps]")).toBeVisible()
    await expect(page.locator("li[data-docs-step]")).toHaveCount(3)
    await expect(page.locator("[data-docs-type-table]")).toContainText(
      "organizationId"
    )
  })

  test("uses the expandable table of contents on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/docs/developers/mcp")

    await expect(page.locator('[data-docs-toc="desktop"]')).toBeHidden()
    const mobileToc = page.locator('[data-docs-toc="mobile"]')
    await expect(mobileToc).toBeVisible()
    await expect(
      page.locator("[data-docs-page-header] + [data-docs-toc='mobile']")
    ).toHaveCount(1)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true)
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
    await page.getByRole("button", { name: "Search Documentation" }).click()
    await page
      .getByRole("combobox", { name: "Search Documentation" })
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
    await page.getByRole("button", { name: "Search Documentation" }).click()
    await page
      .getByRole("combobox", { name: "Search Documentation" })
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

  test("serves the public documentation as LLM-friendly text", async ({
    request,
  }) => {
    const indexResponse = await request.get("/llms.txt")
    expect(indexResponse.ok()).toBe(true)
    expect(indexResponse.headers()["content-type"]).toContain("text/plain")
    const index = await indexResponse.text()

    expect(index).toContain("# Documentation")
    expect(index).toContain("/docs/developers/mcp")
    expect(index).not.toContain("/api/")

    const fullResponse = await request.get("/llms-full.txt")
    expect(fullResponse.ok()).toBe(true)
    expect(fullResponse.headers()["content-type"]).toContain("text/plain")
    const full = await fullResponse.text()

    expect(full).toContain("# MCP Specification (/docs/developers/mcp)")
    expect(full).toContain("OAuth Authorization Code with PKCE")
    expect(full).not.toContain("<html")
  })

  test("serves an explicit Markdown representation without Accept negotiation", async ({
    request,
  }) => {
    const markdownResponse = await request.get("/docs/developers/mcp.md")

    expect(markdownResponse.ok()).toBe(true)
    expect(markdownResponse.headers()["content-type"]).toContain(
      "text/markdown"
    )
    const markdown = await markdownResponse.text()
    expect(markdown).toContain("# MCP Specification (/docs/developers/mcp)")
    expect(markdown).toContain("## Endpoint and transport")
    expect(markdown).not.toContain("<html")

    const htmlResponse = await request.get("/docs/developers/mcp", {
      headers: { Accept: "text/markdown" },
    })
    expect(htmlResponse.ok()).toBe(true)
    expect(htmlResponse.headers()["content-type"]).toContain("text/html")
  })
})
