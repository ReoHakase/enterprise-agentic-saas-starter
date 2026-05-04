---
name: error-handling
description: enterprise-agentic-saas-starterのAppError、Error.cause、public/private context、Elysia onError、request id、validation error、redaction、OpenTelemetry error記録、secret漏洩防止を変更するときに使う。
---

# Error Handling

このskillはAPI error、logging、redaction、observability境界を触るときに使う。

## 方針

- 想定内の失敗は `AppError` をthrowする。
- 想定外の失敗は `cause` と `privateContext` に包む。
- HTTP responseへ返してよいのは public code、public message、sanitized public context、request idだけ。
- `error.message` をそのままresponseへ返さない。
- `stack`, `cause`, SQL, DB URL, token, cookie, Authorization header, raw request body, external API raw responseはresponse禁止。
- logへ出す前にもredactionを通す。
- `onError` は最後の防波堤として残す。

## public/private context

public context:

- `field`
- `reason`
- `resource`
- `constraint`
- `retryAfter`

private context:

- DB/libSQL/Drizzle error
- provider API error
- operation名
- external response metadata
- validation issues詳細

private contextはlog/trace向け。responseには出さない。

## OpenTelemetry

- request idとtrace idを関連付ける。
- `AppError` はstatus/codeをspan属性に残す。
- unknown errorはgeneric 500としてresponseし、span/logにはredacted detailsだけ残す。
- secret-looking attributeをspanへ載せない。

## 実装時の確認

- 新しいerror factoryがpublic messageだけを持つか確認する。
- validation errorの詳細を本番responseに出しすぎない。
- Better AuthやElysia validation pluginのthrowも `onError` で安全に丸める。
- redaction対象のkey/value patternにsecret, token, cookie, authorization, database url, api keyが入っていることを確認する。

具体的な `AppError` / `toHttpError` / redactor例が必要なときだけ `references/error-handling.md` を読む。
