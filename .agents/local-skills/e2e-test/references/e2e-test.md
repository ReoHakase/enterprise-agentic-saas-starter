# E2E Test Reference

## 配置

```txt
apps/web/
  e2e/
    auth.spec.ts
    fixtures/mock-api.ts
  playwright.config.ts
```

## tenant境界テスト例

```ts
test("別organizationのtodoは見えない", async ({ page }) => {
  await signInAs(page, "member-a@example.com")
  await page.goto("/todos")
  await expect(page.getByText("Org B private todo")).not.toBeVisible()
})
```

## webServer確認

- Next.js webを起動する。
- PRでは決定的なmock API、stagingではElysia APIを起動する。
- mock APIとNext.jsを2つの `webServer` entryで起動し、mock stateを各test前にresetする。
- test用envをdotenvx/direnvから渡す。
- `use.video` は `"on"` にし、成功・失敗・再試行を問わずすべてのrunをartifactへ残す。
- traceとscreenshotは失敗時に保持し、HTML reportとあわせてartifactへ残す。

mock harnessではcookie session、organization membership、tenantごとのIssueを最低限再現する。外部mail deliveryはpackage test、実認可はAPI integration testへ分担し、mockの403だけでsecurityを完了扱いにしない。

## Playwright MCP

locator調査、失敗再現、スクリーンショット確認にはPlaywright MCPを使う。実装自体はrepoのPlaywright configへ反映する。
