# @enterprise-agentic-saas/api

Elysia on Bun の API app workspace。

## 役割

- `createApp(db)` で Elysia app を組み立てる（テスト可能な最小ファクトリ）。
- `index.ts` は本番 plugin を合成して listen する。
- `client.ts` は`parseDate: false`固定のEden client、file/profile image DTO・URL builder・XHR upload helperをexportする。
- `worker.ts`はCloudflare request handler、private `FILES` R2/`IMAGES` binding、認可後の
  `IMAGE_PREVIEWS` Service Binding、durable cleanup cronを合成する。
- runtime固有の関心事（auth, cors, OpenTelemetry, structured logging, server-timing）は独立 plugin/runtime entrypointで合成する。

## 公開 entrypoint

- `@enterprise-agentic-saas/api/client`: `createApiClient`, `ApiClient`, `FileDto`, `ProfileImageDto`, file/profile image URL・upload helper

WebからAPI workspaceについてimportしてよいentrypointは`@enterprise-agentic-saas/api/client`だけです。
Agentの公開response schema、tool名、URL canonicalizerは再exportせず、Webは
`@enterprise-agentic-saas/agent-contracts`から直接importします。`App`型はEden client内部で保持し、
rootや`./types` entrypointは公開しません。

## 依存方向

- `apps/api -> packages/db`
- `apps/api -> packages/auth`
- `packages/* -> apps/api` は禁止。

## Env 境界

環境変数は [`src/platform/env/index.ts`](src/platform/env/index.ts) で [envin](https://github.com/turbostarter/envin) + Valibot により検証する。API 固有の env のみ管理する。`@enterprise-agentic-saas/db` / `@enterprise-agentic-saas/auth` が管理する env（`TURSO_DATABASE_URL`, `BETTER_AUTH_SECRET` 等）は各 package が検証するため、ここでは重複させない。email providerはdevelopment=`mailpit`、test=`noop`、production=`cloudflare`を既定にする。developmentのsupervisorはprivate local sessionから起動中Mailpitのdirect loopback URLを取得して`MAILPIT_URL`へ注入する。公開origin、DB URL、GitHub Emulate URLはrepository共通の`portless-topology` CLIが同じworktree namespaceから注入する。local/testで`EMAIL_FROM`を省略した場合は配送不能な`noreply@example.test`を使う。本番では`EMAIL_FROM`を必須にし、未設定や不正なaddressならfail-fastする。

主な env:

- `PORT`
- `APP_NAME`
- `APP_BASE_URL`
- `API_PUBLIC_URL`
- `CORS_ORIGIN`
- `EMAIL_PROVIDER`
- `EMAIL_FROM`
- `MAILPIT_URL`
- `GITHUB_OAUTH_EMULATOR_URL`（`packages/auth`が検証するlocal-only URL）
- `NODE_ENV`

local Workerは`@inference-net/otel-cf-workers`を使い、固定loopback OTLP endpointかつdevelopmentの場合だけtrace/logを送ります。production remote backendは未構成です。

## Local Worker development

rootの`bun run dev`ではbuild済み`dist`ではなく、`src/dev.ts` supervisorが`src/worker.ts`をmainにした`wrangler dev --local`を起動する。Wranglerはimport graphをwatchし、Elysiaや依存sourceの保存時にrebundleしてWorker isolateを再起動する。Bunの状態保持型HMRではないためmemory stateは引き継がないが、Tursoと`--persist-to .wrangler/state`のR2 dataはreload後も残る。supervisorまたは起動時envを変えた場合はdev processを再起動する。

`src/index.ts`のBun `listen`は、分離した`file:` DBを使うdeterministic OAuth E2E fixtureだけが起動する。rootのpublic developmentやproduction deployには使わない。

APIとprivate Images Workerを一つのWrangler multi-config sessionで起動し、`FILES`、`IMAGES`、
`IMAGE_PREVIEWS`、`EMAIL` bindingをローカルでも利用する。APIの最上位Workers Cachingは無効にし、
すべてのAPIリクエストでElysia、Better Auth、テナント認可を実行する。preview変換後のWorkers Cachingは
認可後に呼ばれるImages Workerだけが所有する。通常の開発用プロバイダーはMailpitであり、workerdから
実際のアプリケーション送信導線をローカル受信箱へ流す。workerdはPortlessの開発CAを信頼しないため、
ブラウザー用Portless HTTPSではなく、トークンで保護したセッションから受け取る同じMailpit実体の直接
loopback HTTPへ接続する。`EMAIL_PROVIDER=cloudflare`を明示した場合だけWranglerのローカルEmail binding
simulationを通る。共有設定では実配送する`remote: true`を使わない。

fixture投入の公開入口はrootの`bun run dev:db:seed`だけにする。healthyなAPI dev sessionがあればそのWorkerを再利用し、なければlocal Tursoが停止中の場合だけ一時起動したうえで、`apps/api/.wrangler/state`を使うloopback限定Wranglerを一時起動する。migration、DB seed、R2 reconcileの後はcommand自身が起動したprocessだけを停止し、既存のdev processには触れない。production/remote seedとrootの`seed` aliasは作らない。

## Local observability

Docker/OrbStackとPortless proxyを利用者が起動してから共有LGTMを起動します。

```sh
bun run observability:up
bun run dev
```

`portless-topology`がworktree/session IDと固定endpointを注入します。localはrequest/business/provider contextを保持し、Authorization、Cookie、key/token/secret/grant/ticket/signed credentialだけをredactします。`x-request-id`は128文字以内の安全な形式だけを受理します。`bun run dev`はLGTM readinessだけを確認しDocker lifecycleを呼びません。

## Validation

API routeのbody/query/params/responseと環境変数はValibotへ統一します。route modelはStandard SchemaとしてElysiaへ直接渡し、OpenAPIは`@valibot/to-json-schema` mapperで生成します。request validationは400 `validation_error`へ正規化し、422は返しません。

Eden clientはoptionsをspreadした後で`parseDate: false`を固定し、consumerから上書きできません。issue due dateの公開値はISO timestampまたは`null`、DB内部は`timestamp_ms`です。実HTTP transport testでdue dateとtimestampが文字列のまま届くことを確認します。

## API documentation

- Scalar API Reference: `/openapi`
- アプリケーション所有ルートだけのOpenAPI 3.0.3 JSON: `/openapi/json`
- Better Authが生成するOpenAPI 3.1.1 JSON: `/auth/open-api/generate-schema`
- liveness: `/health`
- Turso/libSQL readiness: `/ready`

各routeは`operationId`、tag、request/response schema、共通error schema、cookie securityを持つ。
Better Authの実plugin構成から生成した仕様は変換せず独立公開し、Scalarの`source`でアプリケーション仕様と
切り替える。個別の`/auth/reference`は404を維持する。

Scalarはagent upload、telemetry、local auth persistence、外部default fontを無効化する。try-outではBetter AuthのSecure/HttpOnly cookieをUIへ貼り付けず、同一originのbrowser credentialとして送る。

## 認証・tenant・権限境界

- `authenticated` macroがsessionを解決する。protected routeでhandlerがcookieを直接読む実装は禁止。
- `organizationAccess` macroが `organizationId` をparams/query/bodyから取り、membership、active organization、role、必要ならfresh sessionをhandler前に検証する。
- 非memberが指定したorganizationは、存在する他tenantと存在しないIDを区別せず404にする。
- tenant tableのrepository queryは必ず `organizationId` とresource IDを組み合わせる。
- sessionのactive organization切替は、session所有者とmembershipをtransaction内で再確認する。

Better Authのfresh sessionは15分。`step_up_required` (403) を受けたclientはpasskey、magic link等で再認証し、新しいsessionで操作をretryする。安定したerror contractは次の形:

```json
{
  "error": "step_up_required",
  "message": "Recent authentication is required."
}
```

request IDは`x-request-id`、再試行情報は必要な場合だけ`Retry-After`へ返す。

`owner`移管は通常のmember role PATCHから分離する。`POST /organizations/:organizationId/ownership-transfer`へ移管先の`memberId`とmember emailの完全一致`confirmation`を送り、新しいsessionを要求する。member削除も対象emailの確認と新しいsessionが必要。

organization削除は`DELETE /organizations/:organizationId`と専用`organizationDeletionAccess` macroを使います。通常はactive organization、`owner`、新しいsession、slug完全一致、`DELETE`確認、opaqueな冪等性keyを必須にします。削除済みorganizationへの同一request retryだけはactor・organization・key完全一致のjobを確認し、新しいsessionを再要求して同じreceiptを返します。別actor/key/organizationは許可しません。

DB transactionはPIIを持たないcleanup jobを先に保存し、対象をactiveにする全sessionをnullへ戻してorganizationをhard deleteします。tenant rowはcascadeで即時削除し、外部keyを持たないjobは残します。Cloudflare cronがR2のorganization prefixをlease/backoff付きで冪等削除します。job/tenant/user IDをproduction logやremote telemetryへ出しません。

## Audit

organization/member/invitation/issue/comment mutationは `audit_logs` へappend-only eventを残す。重要mutationとevent insertは同じDB transactionに含め、audit失敗後にmutationだけ成功したように見える状態を作らない。admin以上は `/organizations/:organizationId/audit-logs` でtenant内eventを取得できる。

## Issue

issueはorganization内連番、Markdown description、status、priority、assignee、creator、labels、due dateを持つ。list routeはsearch/filter/sort、番号解決、detail/comment CRUD、activity/comment統合timelineを提供する。採番はprocess内のorganization別queueに加え、DBの `(organization_id, number)` unique conflictだけを限定retryする。

timelineは新しい順のtotal orderで返し、`nextCursor`は内部構造を解釈しないopaqueな文字列として次の`cursor` queryへそのまま渡す。同一timestampのactivity/commentが連続しても欠落や重複が起きないkeyset paginationとし、不正cursorは400 `validation_error`にする。

## File

`/files/*`はprivate R2 objectを認証付きでupload/list/preview/download/deleteする汎用moduleです。v1のowner typeは`issue`だけに閉じますが、route、DB metadata、cleanup job、client helperはfileを正本にします。URLはDBへ保存せず、object keyも公開DTOへ返しません。

uploadは1 file/1 multipart request、decimal 20,000,000 bytes上限、organization 1 GiB quota、`uploadId`冪等性を持ちます。同じIDのretryはR2 objectとrequest bodyをstream比較し、別内容なら409にします。R2/Imagesのraw provider errorはpublic response、production log、remote telemetryへ渡しません。

preview幅は`360 / 720 / 1200 / 2400`だけです。認証・tenant/file確認後に`IMAGE_PREVIEWS` Service Bindingを呼び、private Images WorkerがWorkers CachingとWebP quality 75、静止画、scale-downの固定変換を所有します。original downloadはoctet-stream attachment、single Range、ETag conditional requestを扱います。

## Profile image

UserとOrganizationの画像はapp境界で`profileImage`に統一し、Better Auth生成schemaの`user.image` / `organization.logo`だけを互換境界として維持します。更新・削除・表示の入口は`/files/profile-images/users/*`と`/files/profile-images/organizations/*`です。汎用file owner typeは拡張しません。

browserから受け取るcrop済みPNGはmagic bytes、5,000,000 bytes上限、512x512を再検証し、Cloudflare Imagesで512x512 WebP quality 85へ正規化してprivate `FILES` R2へ保存します。安定したfirst-party routeとopaqueな`?v={profileImageId}`だけをauth tableへ戻し、R2 key、source hash、upload ID、ETag、置換前URLは`profile_images`へ閉じます。同一upload IDの別内容は409、同じready内容は冪等retry、置換・削除済みのupload IDは`superseded` tombstoneへ収束し、並行更新は最後に開始した有効なuploadを採用します。

Organization更新はactive organizationの`owner`だけを許可し、finalize/delete transactionでもmembership、active session、roleを再検証します。Organization表示はmembershipを確認して他tenantを404にし、User表示は認証済みsessionへ許可します。配信はETag/304、`Cache-Control: private, no-cache`、`nosniff`、same-site CORPを返します。置換・削除・期限切れpendingのobjectは`profile_image_cleanup_jobs`へ保存し、cronがlease/backoff付きで再試行します。

## テスト

```sh
bun run test
```

API integration は `createApp(testDb())` と `app.handle(new Request(...))` を使う。テストは `@enterprise-agentic-saas/auth` / `@enterprise-agentic-saas/db` を import しないため起動が軽い。

security testでは401/403/404、active tenant不一致、tenant leak非開示、stale session、admin権限昇格、単一`owner`不変条件、同時issue採番、cross-tenant commentを確認する。organization削除は非owner、stale session、確認不一致、exact replay、key衝突、cascade、session null、job残存、R2 retryを別々に固定する。

## 入れてはいけないもの

- `packages/api-client`
- TypeBoxとのroute schema二重管理
- Web feature内のfirst-party API用raw `fetch` wrapper
- packages から apps への逆依存
- raw secret や DB URL を error response へ返す処理
