# E2E Test Reference

## 配置

```txt
apps/web/
  e2e/
    auth.spec.ts
    organization.spec.ts
    permissions.spec.ts
    todos.spec.ts
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
- Elysia APIを起動する。
- test用envをdotenvx/direnvから渡す。
- trace/screenshot/video/reportをartifactへ残す。

## Playwright MCP

locator調査、失敗再現、スクリーンショット確認にはPlaywright MCPを使う。実装自体はrepoのPlaywright configへ反映する。
