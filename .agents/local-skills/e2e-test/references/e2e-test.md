# E2E Test Reference

## 配置

```txt
apps/web/
  e2e/
    auth.spec.ts
    fixtures/mock-api.ts
    fixtures/oauth-api.ts
    fixtures/oauth-database.ts
    fixtures/oauth-global-teardown.ts
    oauth/github-oauth.spec.ts
  testing/
    oauth-database.test.ts
  playwright.config.ts
  playwright.oauth.config.ts
```

## tenant境界テスト例

```ts
test("別organizationのissueは見えない", async ({ page }) => {
  await signInAs(page, "member-a@example.com")
  await page.goto("/organization/org-a/issues")
  await expect(page.getByText("Org B private issue")).not.toBeVisible()
})
```

## webServer確認

- Next.js webを起動する。
- PRでは決定的なmock API、stagingではElysia APIを起動する。
- mock APIとNext.jsを2つの `webServer` entryで起動し、mock stateを各test前にresetする。
- OAuthは`apps/github-emulator`、fresh migration DBを使う実Elysia API、Next.jsを専用configで起動する。外部GitHubと実credentialは使わない。
- API fixtureは直接起動し、fixture `finally`と`globalTeardown`でrun固有のtemporary DBを二重cleanupする。
- `emulate`は`oauth_apps`をstrict seedし、`/meta` readinessを確認する。userは`getByRole("button", { name: /oauth-alice/ })`のようにloginで選び、`nth()`を使わない。
- test用envをdotenvx/direnvから渡す。
- `use.video` は `"on"` にし、成功・失敗・再試行を問わずすべてのrunをartifactへ残す。
- traceとscreenshotは失敗時に保持し、HTML reportとあわせてartifactへ残す。
- Turbo taskは`CI`を`passThroughEnv`へ明示し、GitHub ActionsでもPlaywrightのCI分岐を有効にする。

mock harnessではcookie session、organization membership、tenantごとのIssueを最低限再現する。外部mail deliveryはpackage test、実認可はAPI integration testへ分担し、mockの403だけでsecurityを完了扱いにしない。

## Playwright MCP

locator調査、失敗再現、スクリーンショット確認にはPlaywright MCPを使う。実装自体はrepoのPlaywright configへ反映する。
