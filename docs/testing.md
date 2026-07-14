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

APIは `app.handle()` でHTTP境界まで検証します。日付契約はreal HTTP server + Edenでも確認し、`parseDate: false`によってdue date/timestampが文字列のまま届くことを固定します。request validationは400とsanitized `fieldErrors`、OpenAPIも400 responseを検証します。DB migration testはfresh DB、legacy data変換、tenant複合FKを確認します。外部TursoやOAuth providerをunit testの必須条件にしません。

Web coverageはschema/helperだけに限定せず、profile、session、security method、multi-account、organization作成/切替/設定、member destructive flow、Issue CRUD/commentのactive componentも対象にします。Testing Libraryでは成功だけでなく、field errorがinput直下に出ること、入力が失敗後も残ること、retry/step-up導線を確認します。

organization削除はroute/専用guard/service/repository/R2 processorに分け、非`super_admin`、stale session、slug/DELETE不一致、他tenant非開示、同一receipt replay、actor-key衝突、tenant cascade、active sessionのnull化、外部keyを持たないjob残存、R2 pagination/lease/backoffをVitestで検証します。Playwrightだけで認可やDB原子性を証明しません。

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
bunx playwright install chromium webkit
bun run test:e2e
```

PR用E2Eは `apps/web/e2e/fixtures/mock-api.ts` をNext.jsと一緒に起動します。外部mail/OAuth/Tursoへ依存せず、次の導線を決定的に検証します。

1. magic link登録 → organization作成 → dashboard
2. dashboard → Issue作成/編集/comment/削除 → active tenant切り替え
3. member role編集・削除、招待、session revokeを実画面から完了する管理導線
4. mobile sidebarを閉じたaccount切替と、切替後sessionの反映
5. Super Adminの即時organization削除と二重確認
6. member権限拒否、active organization不一致、未所属tenant非開示、設定画面guard、失敗時のretry/error表示
7. consoleのhard/nested loadingとerror recoveryで、ready状態と同じsidebar、header、scroll、content、PageShell geometryを維持

mockは認可そのものの証明ではありません。ただし本番契約と食い違う成功・失敗を隠さないよう、未所属/存在しないtenantは404、所属済みだがactiveでないtenantは409、active tenant内のrole不足だけを403として再現します。API Vitestで実service/repositoryのpermission matrixとtenant-scoped queryを検証し、staging smokeでは実Cloudflare/Turso構成を確認します。

mock stateとreset endpointは全projectで共有されるため、標準設定はlocal/CIとも `workers: 1` でjourneyを直列実行します。tenant切替時は旧tenantのmount済みqueryを再取得せず、cancelしてから遷移し、切替途中の409をbrowser errorとして発生させないこともE2Eで固定します。

Streaming boundaryはmock APIのbounded one-shot `POST /__e2e/request-delays` で対象requestだけを遅延し、`POST /__e2e/reset`でstate、fault、delayを同時に初期化します。`console-boundaries.spec.ts`は3 projectでready/loading/errorの実`boundingBox()`を1px以内で比較し、desktop sidebar 256px、mobile drawerの幅非予約、横overflowなし、error headingのfocus、再試行後の復帰を確認します。WebKitがclient navigation中のRSC fallbackをDOMへcommitしない場合はhard navigation streamで同じroute skeletonを測定し、Chromiumでは既存shell DOMのidentityも確認します。

標準matrixはDesktop Chrome（viewport 1280×720）、Pixel 7 Chrome、iPhone 13 WebKitです。Desktop Chromeのemulated screenはdevice presetどおり1920×1080、device scale factorは1です。動画sizeやreporterの`show`は指定せず、Playwright既定へ任せます。

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
