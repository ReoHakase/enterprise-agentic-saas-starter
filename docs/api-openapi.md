# API / OpenAPI

## 入口

| Path | 用途 |
| --- | --- |
| `/health` | process/Workerのliveness。依存サービスへ接続しない |
| `/ready` | Turso/libSQLへ`select 1`を行うreadiness。失敗時は安全な503 |
| `/openapi` | Swagger UI |
| `/openapi/json` | OpenAPI 3.0 JSON |
| `/auth/reference` | Better Auth公式reference |

Swagger UIは本番の認証情報や内部情報を埋め込まないでください。公開可否は製品のsecurity policyに合わせ、必要ならedge access policyを追加します。

## OpenAPI契約

- すべてのrouteへsummary、description、tag、成功response、代表error responseを付ける。
- request body/query/path/responseはValibot Standard Schemaを再利用する。OpenAPI変換は`@valibot/to-json-schema` mapperを通す。
- protected routeはaccess macroから `security: [{ sessionCookie: [] }]` を付ける。
- `sessionCookie` は `apiKey`, `in: cookie`, `name: better-auth.session_token`。本番secure prefixはdescriptionで補足する。
- tagsは `System`, `Users`, `Sessions`, `Organizations`, `Organization members`, `Organization invitations`, `Todos`, `Todo comments`, `Audit` に統一する。
- 実装とdocumentationのdriftを防ぐため、route schemaから生成した `/openapi/json` をtestで検証する。
- resource作成は `POST /organizations`、`POST /organizations/:organizationId/invitations`、`POST /todos`、`POST /todos/:id/comments` のすべてで201を返す。
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

公開responseは安定した `error.code`、安全なmessage、request ID、必要最小限のcontextを返します。raw SQL、stack、token、email provider responseなどprivate causeはresponseへ出しません。request validationは400 `validation_error`へ統一し、安全なfield名と固定messageだけを`fieldErrors`へ載せます。runtimeが返さない422はOpenAPIにも定義しません。未認証は401、権限不足は403、tenantの存在を隠すresourceは404、競合は409を使います。

## Eden / 日付契約

Webがfirst-party APIへ接続するときは`@enterprise-agentic-saas/api/client`だけをimportし、featureごとのraw `fetch` wrapperを作りません。clientはconsumer optionsを適用した後に`parseDate: false`を固定するため、ISO風文字列が暗黙に`Date`へ変換されません。todoのdue dateはHTTPで`YYYY-MM-DD | null`、DBでUTC midnightとして扱い、repository境界で相互変換します。Web-local Valibot schemaはUI表示時のruntime境界として残します。

## Local確認

```sh
bun run --cwd apps/api dev
curl -fsS https://api.enterprise-agentic-saas.localhost/health
curl -fsS https://api.enterprise-agentic-saas.localhost/ready
curl -fsS https://api.enterprise-agentic-saas.localhost/openapi/json > /tmp/openapi.json
bun run --cwd apps/api test
```

Cloudflare entrypointも同じapp compositionを使います。Worker bundleは次でdeployせず検証します。

```sh
bun run --cwd apps/api build:cloudflare
```
