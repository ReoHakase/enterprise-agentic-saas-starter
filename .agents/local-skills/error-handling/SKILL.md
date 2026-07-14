---
name: error-handling
description: enterprise-agentic-saas-starterのAppError、Error.cause、public/private context、Elysia onError、request id、validation error、redaction、Sentry error記録、secret漏洩防止を変更するときに使う。
---

# Error Handling

このskillはAPI error、logging、redaction、observability境界を触るときに使う。

## 方針

- 想定内の失敗は `AppError` をthrowする。
- 想定外の失敗は `cause` と `privateContext` に包む。
- HTTP responseへ返してよいのは public code、public message、sanitized public context、request idだけ。
- `error.message` をそのままresponseへ返さない。
- `fieldErrors`は`Record<string, string[]>`とし、Valibot issueからはsanitized field pathと固定の安全なmessageだけを返す。入力値、`received`、raw issue messageは反射しない。
- `AppError.publicContext.field`がある場合は、application側で定義したpublic messageを同じfieldの`fieldErrors`へ写してよい。prototype pollutionに使えるfield名と過度に深いpathは破棄する。
- `stack`, `cause`, SQL, DB URL, token, cookie, Authorization header, raw request body, external API raw responseはresponse禁止。
- logへ出す前にもredactionを通す。
- `onError` は最後の防波堤として残す。

## public/private context

public context:

- `action`
- `field`
- `reason`
- `resource`
- `constraint`
- `retryAfter`
- `maxAgeSeconds`

public contextのkeyは上記allowlistに型で限定する。`organizationId`, `memberId`, `userId`, `invitationId`, `todoId` 等をrequestからresponseへ反射しない。tenant resourceの404は `{ resource: "organization" }` のような復旧用分類だけを返す。

private context:

- DB/libSQL/Drizzle error
- provider API error
- operation名
- external response metadata
- validation issues詳細

private contextは内部診断向け。responseには出さず、log/Sentryへ渡す場合も必ずallowlist化またはredactionする。

## Sentry

- request idとtrace idを関連付ける。
- `AppError` はstatus/codeをspan属性に残す。
- unknown errorはgeneric 500としてresponseし、span/logにはredacted detailsだけ残す。
- secret-looking attributeをspanへ載せない。
- `beforeSend`だけでなくtransaction、breadcrumb、structured logにも同じscrubberを適用する。`sendDefaultPii`はfalse、local variables/server nameは収集しない。
- requestはmethodとquery/hash/dynamic IDを除いたURLだけ残す。user object、cookie/header/body/form data、email/IP、tenant/resource IDはdropまたはredactする。
- route未解決の404でもtenant slugや短いresource IDをtransaction名へ残さない。既知resource collection直下のsegmentは形式に依存せず`:id`へ正規化する。
- exception message、stack frame URL、span description、tag/extra/context/log attribute内の自由文もcredential、DB URL、email、UUID、token patternをscrubする。
- providerのraw errorを`captureException`へ直接渡さず、code/retryable等のallowlist metadataを持つapplication errorへ変換する。scrubber自体のVitestを必須にする。

## 実装時の確認

- 新しいerror factoryがpublic messageだけを持つか確認する。
- validation errorの詳細を本番responseに出しすぎない。
- request validationの`fieldErrors`は許可するが、response validationの内部field pathは公開しない。
- Elysia/Valibotのrequest validationは400 `validation_error`へ正規化し、OpenAPI responseも400に揃える。runtimeが返さない422をdocumentしない。
- Better AuthやElysia validation pluginのthrowも `onError` で安全に丸める。
- redaction対象のkey/value patternにsecret, token, cookie, authorization, database url, api keyが入っていることを確認する。

具体的な `AppError` / `toHttpError` / redactor例が必要なときだけ `references/error-handling.md` を読む。
