---
title: API / OpenAPI
status: proposed
implementation: active
last_reviewed: 2026-07-24
---

# API / OpenAPI

## 入口

| Path | 用途 |
| --- | --- |
| `/health` | process/Workerのliveness。依存サービスへ接続しない |
| `/ready` | Turso/libSQLへ`select 1`を行うreadiness。失敗時は安全な503 |
| `/openapi` | Scalar API Reference |
| `/openapi/json` | app routeとBetter Auth routeを統合したOpenAPI 3.0.3 JSON |

`/openapi`をdocumentationの唯一の正本にし、Better Auth既定の`/auth/reference`は404にします。Scalarへ本番の認証情報や内部情報を埋め込まないでください。公開可否は製品のsecurity policyに合わせ、必要ならedge access policyを追加します。

Scalarは次を明示設定します。

- agent uploadを無効化する。
- telemetryを無効化する。
- auth値をlocalStorageへ永続化しない。
- Scalar CDNのdefault fontを読み込まない。
- browser内developer toolsを表示しない。
- API clientはJavaScriptの`fetch`を既定にし、operation IDを表示する。

同一originのtry-outはbrowserのSecure/HttpOnly cookieを利用できます。session cookieをScalarへ貼り付けたり、documentへ例示値として保存したりしません。

## OpenAPI契約

- すべてのrouteへsummary、description、tag、成功response、代表error responseを付ける。
- request body/query/path/responseはValibot Standard Schemaを再利用する。OpenAPI変換は`@valibot/to-json-schema` mapperを通す。
- protected routeはaccess macroから `security: [{ sessionCookie: [] }]` を付ける。
- `sessionCookie` は `apiKey`, `in: cookie`, `name: better-auth.session_token`。本番secure prefixはdescriptionで補足する。
- tagsは `System`, `Users`, `Sessions`, `Organizations`, `Organization members`, `Organization invitations`, `Issues`, `Issue comments`, `Audit` に統一する。
- 実装とdocumentationのdriftを防ぐため、route schemaから生成した `/openapi/json` をtestで検証する。
- Better Authは`auth.api.generateOpenAPISchema()`の実生成結果を使い、pathへ`/auth`を付けて同じdocumentへ統合する。auth routeを手書きで複製しない。
- Better Auth 1.6のOpenAPI 3.1 fragmentは、実際に存在するnullable type arrayをOpenAPI 3.0の`nullable`へ変換し、`$ref`のsiblingsは`allOf`へ保持してから統合する。変換不能なschemaは起動時にfail-fastする。
- Better Authの`disabledPaths`は生成schemaにも反映される。organization pluginは招待recipient向け4 routeだけを掲載し、app所有の管理routeを再公開しない。
- Better Auth由来のoperationにも一意な`operationId`、summary、description、`Auth / ...` tagを補完する。
- resource作成は `POST /organizations`、`POST /organizations/:organizationId/invitations`、`POST /issues`、`POST /issues/:id/comments` のすべてで201を返す。
- `GET /issues/:id/timeline` の `nextCursor` はopaqueな文字列とし、consumerは解析せず次の `cursor` queryへ渡す。同一timestampのitemを含むtotal orderで欠落・重複を防ぎ、不正cursorは400 `validation_error`を返す。
- 招待再送は`POST /organizations/:organizationId/invitations/:invitationId/resend`で200を返し、`{ invitation, delivery: "queued", revived }`をresponse schemaにする。403/404/409/429を明示し、admin role再送のfresh session、tenant非開示、terminal state、quotaをdescriptionへ含める。
- comment DTOは `authorId` に加えてtenant-safeな `author: { id, name, image }` を返す。退会済み/tenant外userのprivate profileを漏らさず `Former member` fallbackにする。
- organization削除は`DELETE /organizations/:organizationId`。active organizationの`super_admin`、fresh session、slug完全一致、`DELETE`確認、opaqueな冪等keyをすべて要求し、同一actor・organization・keyの再送へ同じreceiptを返す。

## Feature module

```txt
modules/<feature>/
  index.ts       # Elysia route、schema、HTTP status
  model.ts       # request/response model
  service.ts     # use caseと認可済みinput
  repository.ts  # tenant-scoped DB query
```

共通session/tenant/permissionはrouteごとの手書き条件へ散らさず、macro/middleware/guardへ集約します。ただしorganization IDの意味やactionはroute metadataとして明示します。

## Error contract

公開responseは安定した `error.code`、`AppError.publicMessage`、必須request ID、runtime allowlist済みcontext、必要な場合だけ安全な`fieldErrors`を返します。`publicMessage`はapplication側が公開可と明示した値であり、変更可能な`Error.message`、raw SQL、stack、token、入力値、tenant/resource ID、email/provider responseはresponseへ出しません。

request validationは400 `validation_error`へ統一し、安全なfield pathと固定messageだけを`fieldErrors`へ載せます。response validationはserver contract違反なので500 `internal_error`としてcaptureし、内部issueやfield pathを公開しません。runtimeが返さない422はOpenAPIにも定義しません。未認証は401、権限不足は403、tenantの存在を隠すresourceは404、競合は409を使います。

## Eden / 日付契約

Webがfirst-party APIへ接続するときは`@enterprise-agentic-saas/api/client`だけをimportし、featureごとのraw `fetch` wrapperを作りません。clientはconsumer optionsを適用した後に`parseDate: false`を固定するため、ISO風文字列が暗黙に`Date`へ変換されません。issueのdue dateはHTTPでISO timestampまたは`null`、DBで`timestamp_ms`として扱い、repository境界で相互変換します。Web-local Valibot schemaはUI表示時のruntime境界として残します。

## Local確認

```sh
bun run --cwd apps/api dev
curl -fsS https://api.enterprise-agentic-saas.localhost/health
curl -fsS https://api.enterprise-agentic-saas.localhost/ready
curl -fsS https://api.enterprise-agentic-saas.localhost/openapi/json > /tmp/openapi.json
bun run --cwd apps/api test
bun run --cwd packages/auth test
```

Cloudflare entrypointも同じapp compositionを使います。Worker bundleは次でdeployせず検証します。

```sh
bun run --cwd apps/api build:cloudflare
```
