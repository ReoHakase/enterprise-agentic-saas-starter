import { expect, test } from "./fixtures/test"

test.describe("公開ドキュメント", () => {
  for (const { caseLabel, route } of [
    { caseLabel: "HTML document", route: "/docs" },
    { caseLabel: "LLM index", route: "/llms.txt" },
    { caseLabel: "LLM全文", route: "/llms-full.txt" },
    { caseLabel: "root Markdown表現", route: "/docs.md" },
    { caseLabel: "Markdown表現", route: "/docs/developers/mcp.md" },
    { caseLabel: "検索API", route: "/api/search?query=MCP" },
  ] as const) {
    test(`${caseLabel}に共通security headerを付与する`, async ({ request }) => {
      // When: 公開routeへ直接requestする
      const response = await request.get(route)

      // Then: documentとserver handlerで同じsecurity headerを返す
      expect(response.headers()["content-security-policy"]).toContain(
        "connect-src 'self'"
      )
      expect(response.headers()["referrer-policy"]).toBe("same-origin")
    })
  }

  for (const { caseLabel, route } of [
    { caseLabel: "LLM index", route: "/llms.txt" },
    { caseLabel: "LLM全文", route: "/llms-full.txt" },
    { caseLabel: "root Markdown表現", route: "/docs.md" },
    { caseLabel: "Markdown表現", route: "/docs/developers/mcp.md" },
    { caseLabel: "検索API", route: "/api/search?query=MCP" },
  ] as const) {
    test(`${caseLabel}をGET専用endpointとして公開する`, async ({ request }) => {
      // Given: GET専用の公開endpointがある
      const expectedAllow = "GET, HEAD, OPTIONS"

      // When: 非対応methodでrequestする
      const postResponse = await request.fetch(route, { method: "POST" })

      // Then: app SSRへfallthroughせず405と許可methodを返す
      expect(postResponse.status()).toBe(405)
      expect(postResponse.headers().allow).toBe(expectedAllow)
      expect(await postResponse.text()).toBe("Method Not Allowed")
    })
  }

  test("認証やコンソールshellなしで表示する", async ({ page }) => {
    await page.goto("/docs")

    await expect(page).toHaveURL(/\/docs$/u)
    await expect(
      page.getByRole("heading", { name: "Documentation", exact: true })
    ).toBeVisible()
    await expect(page.locator("[data-console-shell]")).toHaveCount(0)
  })

  for (const { caseLabel, heading, route } of [
    {
      caseLabel: "マニュアルrouteを表示する",
      route: "/docs/manual",
      heading: "Manual",
    },
    {
      caseLabel: "MCP仕様routeを表示する",
      route: "/docs/developers/mcp",
      heading: "MCP Specification",
    },
    {
      caseLabel: "Skill仕様routeを表示する",
      route: "/docs/developers/skills",
      heading: "Skills Specification",
    },
    {
      caseLabel: "プライバシーrouteを表示する",
      route: "/docs/privacy",
      heading: "Privacy Policy",
    },
  ] as const) {
    test(caseLabel, async ({ page }) => {
      await page.goto(route)

      await expect(page).toHaveURL(new RegExp(`${route}$`, "u"))
      await expect(
        page.getByRole("heading", { name: heading, exact: true }).first()
      ).toBeVisible()
      await expect(page.locator("[data-console-shell]")).toHaveCount(0)
    })
  }

  test("ドキュメントのOpen Graph fallback metadataを使用する", async ({
    page,
  }) => {
    await page.goto("/docs/developers/mcp")

    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      new URL("/docs/opengraph-image.png", page.url()).href
    )
    await expect(
      page.locator('meta[property="og:image:width"]')
    ).toHaveAttribute("content", "1774")
    await expect(
      page.locator('meta[property="og:image:height"]')
    ).toHaveAttribute("content", "887")
  })

  test("存在しない公開ドキュメントrouteをnot-foundへ変換する", async ({
    allowClientErrors,
    page,
  }) => {
    allowClientErrors(
      /Failed to load resource: .*404 .*\/docs\/not-a-real-page/u
    )
    await page.goto("/docs/not-a-real-page")

    await expect(
      page.getByRole("heading", {
        name: "Documentation page not found",
        exact: true,
      })
    ).toBeVisible()
    await expect(page.locator("[data-console-shell]")).toHaveCount(0)
  })

  test("公開ドキュメントを検索して対象routeへ遷移する", async ({ page }) => {
    await page.goto("/docs")
    await page
      .getByRole("button", { name: "Search Documentation", exact: true })
      .click()
    await page
      .getByRole("combobox", { name: "Search Documentation", exact: true })
      .fill("MCP")
    await page.getByRole("option", { name: /MCP/iu }).first().click()

    await expect(page).toHaveURL(/\/docs\/developers\/mcp$/u)
    await expect(
      page.getByRole("heading", { name: "MCP Specification", exact: true })
    ).toBeVisible()
  })

  test("公開ドキュメントのsourceだけを検索する", async ({ request }) => {
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

  test("公開ドキュメントのindexをLLM向けtextとして提供する", async ({
    request,
  }) => {
    const indexResponse = await request.get("/llms.txt")
    expect(indexResponse.ok()).toBe(true)
    expect(indexResponse.headers()["content-type"]).toContain("text/plain")
    const index = await indexResponse.text()
    expect(index).toContain("# Documentation")
    expect(index).toContain("/docs/developers/mcp")
    expect(index).not.toContain("/api/")
  })

  test("公開ドキュメントの全文をLLM向けtextとして提供する", async ({
    request,
  }) => {
    const fullResponse = await request.get("/llms-full.txt")
    expect(fullResponse.ok()).toBe(true)
    expect(fullResponse.headers()["content-type"]).toContain("text/plain")
    const full = await fullResponse.text()
    expect(full).toContain("# MCP Specification (/docs/developers/mcp)")
    expect(full).toContain("OAuth Authorization Code with PKCE")
    expect(full).not.toContain("<html")
  })

  test("明示的なMarkdown表現だけをMarkdownとして提供する", async ({
    request,
  }) => {
    const rootMarkdownResponse = await request.get("/docs.md")
    expect(rootMarkdownResponse.ok()).toBe(true)
    expect(rootMarkdownResponse.headers()["content-type"]).toContain(
      "text/markdown"
    )
    expect(await rootMarkdownResponse.text()).toContain(
      "# Documentation (/docs)"
    )

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

    const emptySplatResponse = await request.get("/docs/.md")
    expect(emptySplatResponse.status()).toBe(404)
  })
})
