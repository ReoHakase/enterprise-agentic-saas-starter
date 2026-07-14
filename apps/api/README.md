# @enterprise-agentic-saas/api

Elysia on Bun の API app workspace。

## 役割

- `createApp(db)` で Elysia app を組み立てる（テスト可能な最小ファクトリ）。
- `index.ts` は本番 plugin を合成して listen する。
- `client.ts` は`parseDate: false`固定のEden clientをexportする。
- `worker.ts`はCloudflare request handlerとorganization削除後のR2 cleanup cronを合成する。
- 本番固有の関心事（auth, cors, Sentry, structured logging, server-timing）は独立 plugin/runtime entrypointで合成する。

## 公開 entrypoint

- `@enterprise-agentic-saas/api/client`: `createApiClient`, `ApiClient`

Webからimportしてよいentrypointは`@enterprise-agentic-saas/api/client`だけです。`App`型はEden client内部で保持し、rootや`./types` entrypointは公開しません。

## 依存方向

- `apps/api -> packages/db`
- `apps/api -> packages/auth`
- `packages/* -> apps/api` は禁止。

## Env 境界

環境変数は [`src/env.ts`](src/env.ts) で [envin](https://github.com/turbostarter/envin) + Valibot により検証する。API 固有の env のみ管理する。`@enterprise-agentic-saas/db` / `@enterprise-agentic-saas/auth` が管理する env（`TURSO_DATABASE_URL`, `BETTER_AUTH_SECRET` 等）は各 package が検証するため、ここでは重複させない。local/testで`EMAIL_FROM`を省略した場合だけ、配送不能な`noreply@example.test`を使う。本番では`EMAIL_FROM`を必須にし、未設定や不正なaddressならfail-fastする。

主な env:

- `PORT`
- `APP_NAME`
- `APP_BASE_URL`
- `API_PUBLIC_URL`
- `CORS_ORIGIN`
- `NODE_ENV`

SentryはBunとCloudflare WorkerのSDKをruntime entrypointで分離する。productionでは`SENTRY_DSN`、`SENTRY_ENVIRONMENT`、`SENTRY_RELEASE`、`SENTRY_TRACES_SAMPLE_RATE`を設定する。Cloudflareでは`SENTRY_DSN`を`wrangler secret put SENTRY_DSN`で登録し、releaseはdeploy時のversion/commitへ揃える。

## Local observability

Spotlight sidecarを起動したうえで次を実行する。

```sh
bun run dev:spotlight
```

`SENTRY_SPOTLIGHT=1`または`spotlight run`が注入するlocal sidecar URLはdevelopmentだけで有効になり、placeholder DSNを使うためSentry SaaSへlocal eventを送らない。任意URLはlocalhost、loopback、`host.docker.internal`、`.localhost`だけを許可し、remote URLとcredential付きURLは拒否する。Cloudflare Workerをlocal previewするときだけ`.dev.vars`の`SENTRY_SPOTLIGHT`を`1`またはlocal sidecar URLへ変更する。remote previewからlocalhostのsidecarへは接続できない。

Sentryへ送るrequest logは`request_id`、HTTP method、登録route pattern、status、durationだけに制限する。cookie、authorization、request/response body、query、SQL、DB URL、email/IP/tenant/user識別子はevent/log/span送信前にredactする。`x-request-id`は128文字以内の安全な形式だけを受理する。

Elysiaのrequest trace/logはSentry SDKとPII-safeなstructured console sinkへ一本化し、旧`@elysiajs/opentelemetry` / `logixlysia` pluginは併用しない。Cloudflare native traceも二重計測を避けるため無効にし、Workers Logsとplatform metricsは維持する。

## Validation

API routeのbody/query/params/responseと環境変数はValibotへ統一します。route modelはStandard SchemaとしてElysiaへ直接渡し、OpenAPIは`@valibot/to-json-schema` mapperで生成します。request validationは400 `validation_error`と安全な`fieldErrors`へ正規化し、422は返しません。

Eden clientはoptionsをspreadした後で`parseDate: false`を固定し、consumerから上書きできません。todo due dateの公開値は`YYYY-MM-DD | null`、DB内部はUTC midnightです。実HTTP transport testでdue dateとtimestampが文字列のまま届くことを確認します。

## API documentation

- Swagger UI: `/openapi`
- OpenAPI 3.0 JSON: `/openapi/json`
- Better Auth reference: `/auth/reference`
- liveness: `/health`
- Turso/libSQL readiness: `/ready`

各routeは `operationId`、tag、request/response schema、共通error schema、cookie securityを持つ。browserからSwagger UIのtry-outを使う場合、Better AuthのSecure/HttpOnly cookieはUIへ貼り付けず、同一browserのcredentialとして送る。

## 認証・tenant・権限境界

- `authenticated` macroがsessionを解決する。protected routeでhandlerがcookieを直接読む実装は禁止。
- `organizationAccess` macroが `organizationId` をparams/query/bodyから取り、membership、active organization、role、必要ならfresh sessionをhandler前に検証する。
- 非memberが指定したorganizationは、存在する他tenantと存在しないIDを区別せず404にする。
- tenant tableのrepository queryは必ず `organizationId` とresource IDを組み合わせる。
- sessionのactive organization切替は、session所有者とmembershipをtransaction内で再確認する。

Better Authのfresh sessionは15分。`step_up_required` (403) を受けたclientはpasskey、magic link等で再認証し、新しいsessionで操作をretryする。安定したerror contractは次の形:

```json
{
  "error": {
    "code": "step_up_required",
    "message": "Recent authentication required",
    "context": {
      "action": "organization.transfer_super_admin",
      "maxAgeSeconds": 900,
      "reason": "session_not_fresh"
    },
    "requestId": "..."
  }
}
```

`super_admin`移管は通常のmember role PATCHから分離する。`POST /organizations/:organizationId/ownership-transfer` へtarget `memberId` とtarget member emailの完全一致 `confirmation` を送り、fresh sessionを要求する。member削除もtarget email確認とfresh sessionが必要。

organization削除は`DELETE /organizations/:organizationId`と専用`organizationDeletionAccess` macroを使います。通常はactive organization、`super_admin`、fresh session、slug完全一致、`DELETE`確認、opaqueな冪等性keyを必須にします。削除済みorganizationへの同一request retryだけはactor・organization・key完全一致のjobを確認し、fresh sessionを再要求して同じreceiptを返します。別actor/key/organizationは許可しません。

DB transactionはPIIを持たないcleanup jobを先に保存し、対象をactiveにする全sessionをnullへ戻してorganizationをhard deleteします。tenant rowはcascadeで即時削除し、外部keyを持たないjobは残します。Cloudflare cronがR2のorganization prefixをlease/backoff付きで冪等削除します。job/tenant/user IDをlogやSentryへ出しません。

## Audit

organization/member/invitation/issue/comment mutationは `audit_logs` へappend-only eventを残す。重要mutationとevent insertは同じDB transactionに含め、audit失敗後にmutationだけ成功したように見える状態を作らない。admin以上は `/organizations/:organizationId/audit-logs` でtenant内eventを取得できる。

## Issue相当todo

todoはorganization内連番、Markdown description、status、priority、assignee、creator、labels、due dateを持つ。list routeはsearch/filter/sort、detail routeとcomment CRUDを提供する。採番はprocess内のorganization別queueに加え、DBの `(organization_id, number)` unique conflictだけを限定retryする。

## テスト

```sh
bun run test
```

API integration は `createApp(testDb())` と `app.handle(new Request(...))` を使う。テストは `@enterprise-agentic-saas/auth` / `@enterprise-agentic-saas/db` を import しないため起動が軽い。

security testでは401/403/404、active tenant不一致、tenant leak非開示、stale session、admin権限昇格、single `super_admin` invariant、同時issue採番、cross-tenant commentを確認する。organization削除は非super admin、stale session、確認不一致、exact replay、key衝突、cascade、session null、job残存、R2 retryを別々に固定する。

## 入れてはいけないもの

- `packages/api-client`
- TypeBoxとのroute schema二重管理
- Web feature内のfirst-party API用raw `fetch` wrapper
- packages から apps への逆依存
- raw secret や DB URL を error response へ返す処理
