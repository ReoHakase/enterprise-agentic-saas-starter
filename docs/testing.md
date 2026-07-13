# テスト戦略

## 責務分担

| Layer | Tool | 主な対象 |
| --- | --- | --- |
| pure/service/repository | Vitest | schema、認可分岐、error、migration |
| React component | Testing Library + Vitest | keyboard/input/state、DOM契約 |
| UI catalog | Storybook + Vitest addon | light/dark、a11y、`play` interaction |
| browser journey | Playwright | auth、org作成、tenant切替、critical CRUD |
| production adapter | Wrangler dry-run | OpenNext/Elysia Worker bundle |

## Unit / integration

```sh
bun run test
```

APIは `app.handle()` でHTTP境界まで検証します。DB migration testはfresh DB、legacy data変換、tenant複合FKを確認します。外部TursoやOAuth providerをunit testの必須条件にしません。

## Storybook

Storybookは `packages/ui` に置き、`@storybook/addon-vitest` とPlaywright browser providerで実行します。previewはlight/darkのglobal toolbarを持ち、a11y violationをtest errorにします。componentの代表操作はstoryの `play` に置きます。

```sh
bun run --cwd packages/ui storybook
bun run build:storybook
bun run test:storybook
```

Storybook 10では旧standalone test-runnerではなくVitest addonを標準経路にします。light/darkを別projectで実行し、theme依存のcontrast/layout regressionを見落とさないようにします。

## Playwright E2E

```sh
bunx playwright install chromium
bun run test:e2e
```

PR用E2Eは `apps/web/e2e/fixtures/mock-api.ts` をNext.jsと一緒に起動します。外部mail/OAuth/Tursoへ依存せず、次の導線を決定的に検証します。

1. magic link登録 → organization作成 → dashboard
2. dashboard → Issue作成 → active tenant切り替え
3. member権限拒否、未所属tenant拒否、設定画面guard

mockは認可そのものの証明ではありません。API Vitestで実service/repositoryのpermission matrixとtenant-scoped queryを検証し、staging smokeでは実Cloudflare/Turso構成を確認します。

videoは成功・失敗・再試行を問わずすべてのrunを `apps/web/test-results` に残します。traceとscreenshotは失敗時に保持し、HTML reportとあわせて `apps/web/test-results` / `apps/web/playwright-report` からCI artifactへuploadします。

## CI gate

PR/mainではNix、quality、Storybook、E2E、Cloudflare dry-runを独立jobで実行します。次をrelease前にすべてgreenにします。

root `bun run lint` は `turbo run lint` を使い、`apps/web` と `packages/ui` のReact/Next/Tailwind pluginを含むpackage-local Oxlint configを各workspaceのcwdから読みます。

```sh
bun run lint
bun run format:check
bun run typecheck
bun run test
bun run build
bun run build:storybook
bun run test:storybook
bun run test:e2e
bun run build:cloudflare
nix flake check
```
