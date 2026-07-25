---
title: API / OpenAPI
status: accepted
implementation: active
last_reviewed: 2026-07-25
---

# API / OpenAPI

## 目次

- [言語と読者](#言語と読者)
- [operationの一致](#operationの一致)
- [入口](#入口)
- [OpenAPI契約](#openapi契約)
- [Elysia codeとの同一管理](#elysia-codeとの同一管理)
- [Better Authとlibrary route](#better-authとlibrary-route)
- [securityとprivacy](#securityとprivacy)
- [drift検出とupgrade](#drift検出とupgrade)
- [Feature module](#feature-module)
- [Error contract](#error-contract)
- [Eden / 日付契約](#eden--日付契約)
- [Local確認](#local確認)
- [受入条件](#受入条件)

## 言語と読者

この文書はrepository maintainer向けなので日本語で記述します。一方、`/openapi`と
`/openapi/json`はAPI consumer向けproduct surfaceです。生成documentの次の人向けmetadataは、
placeholderや機械的なroute名ではなく、自然で詳細な英語に統一します。

- `info.title`、`info.description`
- tag name/description
- operation summary/description
- response description
- security scheme description
- schema/property description

全operationのdescriptionは、目的、想定caller、認証の要否、成功時に観測できる結果または副作用、
代表的なerrorを説明します。認証不要ならpublic routeであることを明記します。次の内容は該当する
routeだけに要求します。

- tenant/role/fresh-session条件: protected tenant route
- request body/query/path semantics: 対応するinputがあるroute
- side effect、idempotency、retry: mutationまたは再送可能なroute
- pagination/cursor: paginated collection route
- quota、429、`Retry-After`: quota/rate limitがあるroute
- configured-disabled時の挙動: `x-route-status: configured-disabled`のroute

CIの英語metadata gateは詳細さの下限だけをdeterministicに検査します。whitespaceを正規化した後、
summaryはASCII letterを含む8文字以上、operation descriptionは80文字以上、response/schema/property
descriptionは12文字以上、`info`/tag/security scheme descriptionは20文字以上を要求します。
`TODO`、`TBD`、`placeholder`、`GET auth / path`、`Response for status 200`等のfallbackと、
日本語scriptを人向けfieldで拒否します。`info.title`とtag nameは長さ下限の対象外ですが、空文字と
日本語を拒否します。条件付き内容の正しさと読みやすさはmechanicalな文字数だけで合格にせず、
API reviewで確認します。

日本語検査はこれらの人向けfieldだけに適用し、合法的なUnicode request example、regex、enum、
property nameまで誤検出しません。

## operationの一致

`METHOD + normalized path`をdocumentable operation identityとします。methodはuppercase、pathは
先頭`/`必須、root以外の末尾`/`を除去し、Elysiaの`:parameter`をOpenAPIの`{parameter}`へ変換します。
parameter名とpathの大小文字は保持し、Better Authには正規化前に`/auth` prefixを一度だけ付けます。

testは次の集合を実行時のcodeから求めます。

1. public API appへ登録されたElysia routeのうち、`detail.hide: true`でないoperation
2. Better Authが各modeで`auth.api.generateOpenAPISchema()`から実生成したoperation
3. `/openapi/json`に生成されたoperation

1と2の和が3へexactly once存在することを検証します。手書きoperation一覧や固定件数は正本にしません。
implicit `HEAD`/`OPTIONS`とBetter Authのwildcard handlerはdocumentable operationへ数えません。
private Agent appとdevelopment/test appはpublic API appへ合成しないため、documentへ現れません。
掲載しないapp-owned routeが必要な場合は、route declaration自身の`detail.hide: true`で明示します。

routeの異なる性質を一つのavailabilityへ混ぜず、次のvendor extensionへ直交して記録します。
standard OpenAPI `security`を認証要件の正本にし、extensionはconsumer向け分類に使います。

| extension        | allowed value                                        | 意味                    |
| ---------------- | ---------------------------------------------------- | ----------------------- |
| `x-route-status` | `enabled`, `configured-disabled`                     | product設定上の利用可否 |
| `x-auth-context` | `none`, `session-cookie`, `bearer`, `oauth-callback` | 呼出context             |
| `x-audience`     | `general`, `first-party-web`, `invitation-recipient` | 想定caller              |

email/password sign-up、email/password sign-in、password reset等が実生成schemaに存在しても、現在の
設定で400のdisabled responseを返すrouteは`x-route-status: configured-disabled`と明示します。
recipient routeがsession cookieを要求する等、各軸を同時に表現できます。internal routeはextensionで
掲載せず、documentから除外します。「掲載されている」ことを「利用可能」と同義にしません。

## 入口

| Path            | 用途                                                       |
| --------------- | ---------------------------------------------------------- |
| `/health`       | process/Workerのliveness。依存サービスへ接続しない         |
| `/ready`        | Turso/libSQLへ`select 1`を行うreadiness。失敗時は安全な503 |
| `/openapi`      | Scalar API Reference                                       |
| `/openapi/json` | app routeとBetter Auth routeを統合したOpenAPI 3.0.3 JSON   |

API consumer向けreferenceの入口は`/openapi`だけとし、Better Auth既定の`/auth/reference`は404にします。
authoringの正本はElysia route/schema/pluginのTypeScriptです。Scalarへ本番の認証情報や内部情報を
埋め込まないでください。公開可否は製品のsecurity policyに合わせ、必要ならedge access policyを
追加します。

Scalarは次を明示設定します。

- agent uploadを無効化する。
- telemetryを無効化する。
- auth値をlocalStorageへ永続化しない。
- Scalar CDNのdefault fontを読み込まない。
- browser内developer toolsを表示しない。
- API clientはJavaScriptの`fetch`を既定にし、operation IDを表示する。

同一originのtry-outはbrowserのSecure/HttpOnly cookieを利用できます。session cookieをScalarへ貼り付けたり、documentへ例示値として保存したりしません。

## OpenAPI契約

- すべてのpublic/library routeへsubstantiveな英語summary、description、宣言済みtag、成功response、
  代表error responseを付ける。
- request body/query/path/responseはValibot Standard Schemaを再利用する。OpenAPI変換は`@valibot/to-json-schema` mapperを通す。
- protected routeはaccess macroから `security: [{ sessionCookie: [] }]` を付ける。
- `sessionCookie` は `apiKey`, `in: cookie`, `name: better-auth.session_token`。本番secure prefixはdescriptionで補足する。
- app tagsは `System`, `Users`, `Sessions`, `Organizations`, `Organization members`,
  `Organization invitations`, `Issues`, `Issue comments`, `Audit`, `Agent`, `Files`,
  `Profile images`に統一する。Better Authは`Auth / Core`, `Auth / Passkeys`,
  `Auth / Magic links`, `Auth / Multi-session`, `Auth / OAuth`, `Auth / Organizations`等、
  有効pluginの英語tagへ分類する。
- 実装とdocumentationのdriftを防ぐため、Elysia routeとschemaから生成した`/openapi/json`をtestで
  検証する。
- Better Authは`auth.api.generateOpenAPISchema()`の実生成結果を使い、pathへ`/auth`を付けて同じdocumentへ統合する。auth routeを手書きで複製しない。
- Better Auth 1.6のOpenAPI 3.1 fragmentは、明示allowlistしたsubsetだけをsemantics-preservingに
  OpenAPI 3.0へ変換する。実際に存在するnullable type arrayは3.0の`nullable`へ、`$ref` siblingは
  `allOf`へ保持する。未対応keyword/type unionはJSON Pointer付きで起動/testをfail-fastする。
- Better Authの`disabledPaths`は生成schemaにも反映される。organization pluginは招待recipient向け4 routeだけを掲載し、app所有の管理routeを再公開しない。
- Better Auth由来のoperationにも一意な`operationId`、summary、description、`Auth / ...` tagを補完する。
- resource作成は `POST /organizations`、`POST /organizations/:organizationId/invitations`、`POST /issues`、`POST /issues/:id/comments` のすべてで201を返す。
- `GET /issues/:id/timeline` の `nextCursor` はopaqueな文字列とし、consumerは解析せず次の `cursor` queryへ渡す。同一timestampのitemを含むtotal orderで欠落・重複を防ぎ、不正cursorは400 `validation_error`を返す。
- 招待再送は`POST /organizations/:organizationId/invitations/:invitationId/resend`で200を返し、`{ invitation, delivery: "queued", revived }`をresponse schemaにする。403/404/409/429を明示し、admin role再送のfresh session、tenant非開示、terminal state、quotaをdescriptionへ含める。
- comment DTOは `authorId` に加えてtenant-safeな `author: { id, name, image }` を返す。退会済み/tenant外userのprivate profileを漏らさず `Former member` fallbackにする。
- organization削除は`DELETE /organizations/:organizationId`。active organizationの`super_admin`、fresh session、slug完全一致、`DELETE`確認、opaqueな冪等keyをすべて要求し、同一actor・organization・keyの再送へ同じreceiptを返す。

OpenAPI documentの人向け説明をYAML、YML、JSON、生成済みspec、別metadata registryへ書きません。
`openapi.yaml`や`openapi.json`をcommitして正本にせず、`/openapi/json`はElysiaが生成する結果として
test時または実行時にだけ取得します。

Git管理対象へ次のpathを追加しません。

```text
**/{openapi,swagger}.{yaml,yml,json}
**/*.{openapi,swagger}.{yaml,yml,json}
apps/api/**/{metadata,descriptions,operations,schemas,paths}.{yaml,yml,json}
apps/api/**/{openapi-metadata,openapi-descriptions,operation-metadata,schema-metadata,route-inventory}.{ts,js,json,yaml,yml}
```

file名を変えた別metadata registryもcode reviewで拒否します。app routeではElysia `detail`または
そのrouteが使うValibot metadata、global/Better AuthではElysia OpenAPI plugin内だけを許可します。
専用AST scannerやnegative fixtureは追加せず、実appから生成するOpenAPI contract testで最終documentの
metadata、schema、security、route parityを検証します。生成結果を確認する`/tmp/openapi.json`は
repository外の一時fileなので対象外です。

## Elysia codeとの同一管理

### app-owned route

App-owned operationの説明はroute実装と同じElysia declarationへ書きます。

- operationの`operationId`、英語summary/description/tag、`x-*`分類は各Elysia routeの`detail`へ置く
- request body、query、path parameter、responseは、そのElysia routeへ渡すValibot Standard Schemaを
  正本にする
- request/response全体の英語descriptionはroot Valibot schemaの`v.metadata({ description })`へ置く
- propertyの英語descriptionも対応するValibot schema metadataへ置く
- auth/tenant macroが付けるstandard `security`はrouteごとに生成結果を検証する
- global `info`、tag description、security scheme description、Scalar設定は
  Elysia `openapi({ documentation, scalar })`を呼ぶpluginのTypeScriptへ置く

例:

```ts
const issueResponse = v.pipe(
  v.object({
    id: v.pipe(
      v.string(),
      v.metadata({ description: "Stable identifier of the issue." })
    ),
  }),
  v.metadata({ description: "The requested issue." })
)

new Elysia().get("/issues/:id", getIssue, {
  params: issueParams,
  response: { 200: issueResponse },
  detail: {
    operationId: "getIssue",
    summary: "Retrieve an issue",
    description:
      "Returns an issue in the active organization without revealing resources from another tenant.",
    tags: ["Issues"],
    "x-route-status": "enabled",
  },
})
```

Elysia OpenAPI integrationはroot request/response schemaのmetadataからbody/response descriptionを
生成するため、response説明をroute外の一覧やYAMLへ移しません。route implementation、
validation schema、consumer向け説明を同じmoduleでreviewできる状態を保ちます。

### Better Auth route

Better Auth routeはElysia routeとして手書きで複製せず、
`auth.api.generateOpenAPISchema()`のrequest/response schemaを使います。Better Authはlibrary-owned
fetch handlerとしてmountされるため、app-owned routeのように各routeへ`detail`を追加できません。
この例外だけは、生成fragmentをElysia OpenAPI pluginのTypeScript内で`/auth` prefix付与、3.0.3への
normalization、英語metadata/securityの補足を行い、`openapi({ documentation })`へ渡します。

補足codeはElysia OpenAPI plugin内のprivate functionに限定し、YAML/JSONや独立した説明registryへ
分けません。各補足keyはそのmodeで実生成されたoperationまたはschemaへexactly once一致し、
missing/stale key、空または機械生成だけのdescription、未宣言tagをCI errorにします。
schemaのtype、required、enum、format、statusを推測して置換しません。生成結果に情報がなくruntime
から確定できないschemaは、もっともらしいshapeを捏造せずupstream制約を英語で説明し、
representative runtime contract testで補います。

## Better Authとlibrary route

Better Auth coreと有効pluginのrouteをできるだけ網羅し、次を含めます。

- core session、account、sign-in/sign-out、callback
- passkey
- magic link
- multi-session/device session
- generic OAuthとprovider callback
- invitation recipient向けorganization route

Better Auth organization管理routeをapp-owned管理APIと二重公開しません。`disabledPaths`で止める
管理routeはspecにも現れないことを確認し、recipient向けに残すrouteは実生成schemaから検証します。
GitHub plugin topologyとOAuth emulator modeの両方で実schemaを生成し、mode固有の3 operationも
最終documentへexactly once存在することを検証します。

raw generated operationのsecurityはそのまま信用しません。public sign-in/callback、session-required、
cookie/bearer、configured-disabledを実runtimeと照合し、operation単位で正しいsecurityと三つの
`x-*`分類をElysia OpenAPI plugin内で補足します。libraryが生成したstatus codeは一律にapp convention
へ書き換えず、runtime parityを確認します。

`apps/agent`からnamed Service Bindingで呼ぶ`/internal/agent/**`とdevelopment/test routeはpublic
consumer specへ含めません。absence testで誤掲載を防ぎ、private control plane contractはAgent/APIの
内部設計文書とin-process testで管理します。

## securityとprivacy

- 同一originのtry-outはHttpOnly cookieをbrowserに任せ、Scalar config/specへcookie値を埋め込まない
- real session/OAuth/magic-link/passkey/invitation token、password、Authorization、email、IP、
  user-agent、tenant/resource ID、provider/DB raw errorをexampleへ入れない
- exampleはreserved domain、synthetic ID、明示的なplaceholderだけを使う
- session token、access/refresh/id token、password等のsensitive fieldがruntime contractに存在する
  場合は勝手にschemaから削らず、値exampleを出さずsensitiveであることを英語で説明する
- public referenceにするかedge access policyで保護するかをdeployment policyとして明示し、
  「docsだから安全」と仮定しない

Scalarは`persistAuth: false`、telemetry無効、Agent/upload無効を維持します。Scalar Agentはspecを
外部へ送信し得るため、このrepositoryでは有効化しません。`/auth/reference`は404を維持し、
統合済み`/openapi`以外のreference surfaceを増やしません。

## drift検出とupgrade

CIはGitHub plugin topologyとOAuth emulator modeを別process/matrix jobで起動し、各processで
isolated module graph、mode専用のsynthetic credential、temporary DBを使って実Better Auth schemaを
生成します。同じVitest processでenvironmentだけを書き換え、最初に評価されたauth singletonを
再利用しません。「GitHub plugin topology」はproductionと同じplugin構成を意味し、production
credentialやproduction DBをtestへ渡す意味ではありません。

1. public API appに登録されたElysia operationをroute codeから取得する
2. Better Auth raw generated operationをmodeごとに取得する
3. 1と2の和がOpenAPI operationへexactly once存在する
4. `detail.hide: true`のroute、private Agent app、development/test appが最終documentに存在しない
5. Better Auth補足codeのkeyが実生成operation/schemaへexactly once一致し、missing/stale keyがない
6. 全operationにunique operation ID、英語metadata、declared tag、正確なsecurity、response schemaがある
7. app-owned routeの説明がElysia `detail`とValibot metadataから生成される
8. 禁止パスに外部OpenAPI仕様または独立メタデータ情報源が存在しないことをコードレビューで確認する
9. OpenAPI 3.0.3 validatorでdangling `$ref`、3.1 keyword残留、不正schemaがない
10. `/openapi`が`/openapi/json`を読み、Scalarの安全設定と`/auth/reference` 404を維持する
11. final documentを再帰走査し、`example`、`examples`、`default`、header/cookie/security exampleに
    credential/token/cookie/Authorization、known secret sentinel、non-reserved email/domain、
    private ID/URL、provider/DB raw errorがない

巨大なfull JSON snapshot一つだけを根拠にしません。集合、field、schema normalization、
representative runtime behaviorを個別にassertし、差分を読みやすくします。public sign-in/callback、
session-required route、disabled email/password、recipient organization、blocked organizationを
代表runtime parity caseにします。

leakage scannerはschema/property名やregexを値と誤認せず、上記value-bearing fieldだけを検査します。
reserved domain、`.test`、明示allowlistしたsynthetic ID/URLだけを許可し、両modeで生成した
最終documentへ実行します。

Better Auth、Elysia OpenAPI、Scalar、認証pluginをupgradeするときは、両modeのraw operation diff、
normalization、plugin内の補足code、runtime parity、安全設定を同じPRでreviewします。route追加をfallbackの
機械生成summaryだけで自動承認しません。

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

request validationは400 `validation_error`へ統一し、安全なfield pathと固定messageだけを`fieldErrors`へ載せます。response validationはserver contract違反なので500 `internal_error`としてcaptureし、内部issueやfield pathを公開しません。app-owned routeが返さない422はOpenAPIにも定義しません。未認証は401、権限不足は403、tenantの存在を隠すresourceは404、競合は409を使います。
このstatus規則はapp-owned Elysia routeに適用します。Better Auth/library routeの生成schemaに422等が
存在する場合は一律に削除せず、実runtimeと照合して記述します。

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

Cloudflare entrypointも同じElysia app作成関数を使います。Worker bundleは次でdeployせず検証します。

```sh
bun run --cwd apps/api build:cloudflare
```

## 受入条件

- Scalar/OpenAPIの人向けmetadataが詳細な英語で、placeholderや日本語fallbackがない
- GitHub plugin topologyとOAuth emulator modeの実Better Auth operationが最終documentと一致する
- app-owned Elysia routeとlibrary generated routeがexactly once掲載され、
  non-documentable/private/dev/test routeが掲載されない
- configured-disabled routeが利用可能と誤記されない
- Better Auth request/response schemaを手書きで複製していない
- app-owned routeの英語説明がElysia `detail`とValibot metadataに同居している
- Better Authの英語補足がElysia OpenAPI pluginのTypeScript内にある
- OpenAPIの説明を持つYAML/YML/JSON、生成済みspec、独立metadata registryがない
- 全operationにunique operation ID、declared tag、正確なsecurity、success/error responseがある
- OpenAPI 3.0.3 validation、runtime parity、Scalar safety smokeがgreen
- exampleにcredential、token、PII、private identifier、raw provider/DB errorがない
