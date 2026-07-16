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

APIは `app.handle()` でHTTP境界まで検証します。日付契約はreal HTTP server + Edenでも確認し、`parseDate: false`によってdue date/timestampが文字列のまま届くことを固定します。request validationは400とsanitized `fieldErrors`、OpenAPIも400 responseを検証します。response validationは実routeが宣言schemaを破るcaseで500、内部issue非公開、Sentry captureを確認します。`AppError` testでは`Error.message`や型外`publicContext`を変更しても、HTTPへは`publicMessage`、runtime allowlist済みcontext、request IDだけが出ることを固定します。DB migration testはfresh DB、legacy data変換、tenant複合FKを確認します。外部TursoやOAuth providerをunit testの必須条件にしません。

Web coverageはschema/helperだけに限定せず、profile、session、security method、multi-account、organization作成/切替/設定、member destructive flow、Issue CRUD/commentのactive componentも対象にします。Testing Libraryでは成功だけでなく、field errorが対応input直下に出て入力変更で消えること、`aria-invalid` / `aria-describedby`、入力が失敗後も残ること、retry/step-up導線を確認します。unknown JS/network/provider messageやsecret風文字列が表示されず操作別fallbackになること、5xxの検証済みrequest IDだけがreferenceとして残ること、同じ失敗が二重toastされないことも回帰testにします。

TanStack Tableのinline編集は、mutation中の`readOnly`/`aria-busy`だけでなく、row idとcolumn rendererのidentityを固定します。Testing Libraryではpending化、query反映、並び替えを跨いで同じtrigger DOMとfocusが残ることを確認します。`busyIssueId`や`pending`をcolumn定義の依存へ直接入れるとcell rendererが差し替わり、focus可能なtriggerでも再mountされるため禁止します。

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

`bun run test:e2e`は高速なapplication journey suiteと実OAuth suiteを順に実行します。片方だけを調査するときは次を使います。

```sh
bun run --cwd apps/web test:e2e:app
bun run test:e2e:oauth
```

PR用E2Eは `apps/web/e2e/fixtures/mock-api.ts` をNext.jsと一緒に起動します。外部mail/OAuth/Tursoへ依存せず、次の導線を決定的に検証します。

1. magic link登録 → organization作成 → dashboard
2. dashboard → Issue作成/編集/comment/削除 → active tenant切り替え
3. member role編集・削除、comma/newline bulk招待、session revokeを実画面から完了する管理導線。bulk招待は大小文字を含む重複排除、POST body、queued件数、409時のatomic rollbackと入力保持を確認する
4. mobile sidebarを閉じたaccount切替と、切替後sessionの反映
5. Super Adminの即時organization削除と二重確認
6. member権限拒否、active organization不一致、未所属tenant非開示、設定画面guard、失敗時のretry/error表示
7. consoleのhard/nested loadingとerror recoveryで、ready状態と同じsidebar、header、scroll、content、PageShell geometryを維持
8. `keyboard.spec.ts`で`click` / `fill` / locator `focus`を使わず、magic link、organization作成、sidebar、Issue作成/priority編集、tenant切替、member role/削除/招待、session revoke、passkey step-up、organization削除をkeyboardだけで完了

mockは認可そのものの証明ではありません。ただし本番契約と食い違う成功・失敗を隠さないよう、未所属/存在しないtenantは404、所属済みだがactiveでないtenantは409、active tenant内のrole不足だけを403として再現します。API Vitestで実service/repositoryのpermission matrixとtenant-scoped queryを検証し、staging smokeでは実Cloudflare/Turso構成を確認します。

GitHub OAuthだけは`playwright.oauth.config.ts`で別process群を起動します。`apps/github-emulator`のstrict OAuth App、migrationを適用したrunごとのfile DB、実Elysia API、専用Next distを使い、外部GitHubや実credentialなしで次を一続きに確認します。

1. `signIn.social`からemulator authorizeへ遷移する。
2. `oauth-alice`を選択し、state付きcallbackとone-time code交換を完了する。
3. GitHub profileとverified primary emailからuser/session/accountがDBへ保存される。
4. organization未所属の新規userが最初のorganization画面へ戻る。
5. reload後もsessionを維持し、account providerが`github`である。
6. HttpOnly、SameSite、共有cookie domainが維持される。
7. CDP virtual USB authenticatorで実WebAuthn registrationを完了し、passkeyがAPIのDB-backed list、reload後の画面、delete後の空listへ一貫して反映される。

OAuth suiteはDesktop Chromium 1280×720、`workers: 1`で実行します。標準mock matrixのmobile/WebKitを重複実行しません。suite runごとに新しいemulator processとfresh DBを使い、fixture `finally`とPlaywright `globalTeardown`でrun固有のDB、WAL、SHMを二重cleanupします。Playwright retryは同じfixture userを再認証しても結果が変わらないjourneyにし、途中成功を`failOnFlakyTests`でCI失敗として検出します。`emulate.reset()`は発行済みtoken mapを完全には消さないためtest isolation境界に使いません。

Passkeyの失敗系は標準3 projectでfresh session期限切れ、step-up dialog、Escape後のAdd buttonへのfocus復帰、再認証URLを確認します。成功系はOAuth Chromium suiteだけでvirtual authenticatorを有効化し、`navigator.credentials.create`やAPI responseをmockせずにregistration ceremonyを通します。

keyboard suiteはDesktop Chrome、Pixel 7 Chrome、iPhone 13 WebKitの全projectで実行します。Issue priorityはone-shot delay中もtriggerを`disabled`にせず`readOnly` + `aria-busy`にし、response、再取得、updatedAtによるrow reorderの後まで同じDOMへfocusが残ることを確認します。mobile tableは列を隠さず、document幅がviewport内に収まり、名前付き`table-container`だけが横overflowしてkeyboard focus可能になることを実寸で確認します。Safari/WebKitはplatform既定でlinkが通常Tab対象外になるため、keyboard helperは通常Tabの後にOption+Tab相当も試し、locatorの`focus()`で差を隠しません。Menu内はTabではなくARIA menu規約どおりArrow key + Enterを使います。

mock stateとreset endpointは全projectで共有されるため、標準設定はlocal/CIとも `workers: 1` でjourneyを直列実行します。tenant切替時は旧tenantのmount済みqueryを再取得せず、cancelしてから遷移し、切替途中の409をbrowser errorとして発生させないこともE2Eで固定します。

Turboのstrict envでは`CI`も暗黙には透過されません。rootのE2E taskは`CI`を`passThroughEnv`へ明示し、GitHub Actionsでもretry、`forbidOnly`、既存server非再利用を有効にします。標準suiteの外部server実行に使う`PLAYWRIGHT_BASE_URL`も同じtaskから透過します。

Playwrightが起動するNext.jsは`NEXT_DIST_DIR=.next-e2e`を使い、通常の`bun run dev`が使う`.next`からbuild artifactとdevelopment lockを分離します。portless開発serverを動かしたまま`bun run test:e2e`を実行できるため、testのためにdeveloper-owned processを停止しません。

Streaming boundaryはmock APIのbounded one-shot `POST /__e2e/request-delays` で対象requestだけを遅延し、`POST /__e2e/reset`でstate、fault、delayを同時に初期化します。`console-boundaries.spec.ts`は3 projectでready/loading/errorの実`boundingBox()`を1px以内で比較し、desktop sidebar 256px、mobile drawerの幅非予約、横overflowなし、error headingのfocus、再試行後の復帰を確認します。WebKitがclient navigation中のRSC fallbackをDOMへcommitしない場合はhard navigation streamで同じroute skeletonを測定し、Chromiumでは既存shell DOMのidentityも確認します。

標準matrixはDesktop Chrome（viewport 1280×720）、Pixel 7 Chrome、iPhone 13 WebKitです。Desktop Chromeのemulated screenはdevice presetどおり1920×1080、device scale factorは1です。動画sizeやreporterの`show`は指定せず、Playwright既定へ任せます。

videoは成功・失敗・再試行を問わずすべてのrunを `apps/web/test-results` に残します。OAuth suiteは`test-results/oauth`、HTMLは`playwright-report/oauth`へ分離します。traceとscreenshotは失敗時に保持し、親directoryからまとめてCI artifactへuploadします。

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
