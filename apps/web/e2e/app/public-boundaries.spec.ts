import { tanStackStartIntegrationEnvironment } from "./fixtures/environment"
import { expect, test } from "./fixtures/test"

for (const { caseLabel, expectedLocation, route } of [
  {
    caseLabel: "public",
    expectedLocation: "/docs?topic=MCP&topic=OAuth",
    route: "/docs/?topic=MCP&topic=OAuth",
  },
  {
    caseLabel: "console",
    expectedLocation:
      "/organization/alpha-operations/issues?page=2&status=open",
    route: "/organization/alpha-operations/issues/?page=2&status=open",
  },
] as const) {
  test(`${caseLabel} route末尾slashをquery保持の308へ正規化する`, async ({
    request,
  }) => {
    // When: 末尾slash付きURLへ直接requestする
    const response = await request.get(route, { maxRedirects: 0 })

    // Then: security header付きのcanonical URLを返す
    expect(response.status()).toBe(308)
    expect(response.headers().location).toBe(expectedLocation)
    expect(response.headers()["content-security-policy"]).toContain(
      "connect-src 'self'"
    )
    expect(response.headers()["referrer-policy"]).toBe("same-origin")
  })
}

test("存在しないrouteでもroot documentとclient runtimeを維持する", async ({
  allowClientErrors,
  page,
}) => {
  // Given: file routeに一致しない公開URLを指定する
  allowClientErrors(/Failed to load resource: .*404 .*not-a-real-route/u)
  await page.addInitScript(() => window.localStorage.setItem("theme", "dark"))
  const response = await page.goto("/not-a-real-route")

  // When: root not-found boundaryをSSRする
  expect(response?.status()).toBe(404)

  // Then: document shellとclient runtimeの内側で復帰導線を表示する
  await expect(page.locator("html")).toHaveAttribute("lang", "en")
  await expect(page.locator("html")).toHaveClass(/dark/u)
  await expect(page).toHaveTitle("Enterprise SaaS")
  await expect(page.locator("body script").first()).toBeAttached()
  await expect(
    page.getByRole("link", { name: "Back to dashboard", exact: true })
  ).toBeVisible()
  await page.keyboard.press("d")
  await expect(page.locator("html")).not.toHaveClass(/dark/u)
})

test("route pathの大文字小文字を区別する", async ({
  allowClientErrors,
  page,
}) => {
  // Given: 旧Next routeと大文字小文字だけが異なるURLを指定する
  allowClientErrors(/Failed to load resource: .*404 .*\/DOCS/u)

  // When: TanStack Startへ直接requestする
  const response = await page.goto("/DOCS")

  // Then: 別URLとして扱いroot not-foundを返す
  expect(response?.status()).toBe(404)
  await expect(
    page.getByRole("region", { name: "Page not found", exact: true })
  ).toBeVisible()
})

test("public認証routeは製品名を含む文書titleを設定する", async ({
  context,
  page,
}) => {
  // Given: 未認証で表示する認証routeを用意する
  // When: 認証routeを開く
  await page.goto("/auth/sign-in")

  // Then: 個別titleに製品名を付ける
  await expect(page).toHaveTitle("Authentication · Enterprise SaaS")

  // Given: 認証済みセッションが必要なOAuth routeを用意する
  await context.addCookies([
    {
      name: "e2e-session",
      value: "admin",
      url: tanStackStartIntegrationEnvironment.webOrigin,
    },
  ])

  // When: 組織選択routeを開く
  await page.goto("/oauth/organization")

  // Then: 個別titleに製品名を付ける
  await expect(page).toHaveTitle("Choose an organization · Enterprise SaaS")

  // When: 認可routeを開く
  await page.goto("/oauth/consent")

  // Then: 個別titleに製品名を付ける
  await expect(page).toHaveTitle("Authorize MCP access · Enterprise SaaS")
})

test("アカウント追加時の不明な認証routeを公開エラーへ変換する", async ({
  allowClientErrors,
  page,
}) => {
  // Given: アカウント追加contextで、アプリが提供しない認証routeを指定する
  allowClientErrors(
    /Unknown view/u,
    /Failed to load resource: .*500 .*\/auth\/not-a-view/u
  )

  // When: TanStack StartのSSR routeへ遷移する
  await page.goto("/auth/not-a-view?add_account=1")

  // Then: 認証contextを保った公開エラーを表示する
  await expect(page).toHaveURL(/\/auth\/not-a-view\?add_account=1$/u)
  await expect(
    page.getByRole("heading", {
      name: "Authentication could not be loaded",
      level: 1,
    })
  ).toBeVisible()
  await expect(page.getByText("Add account", { exact: true })).toBeVisible()
})
