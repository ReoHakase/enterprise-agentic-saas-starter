---
name: error-handling
description: enterprise-agentic-saas-starterのAppError、public error contract、retry/capture policy、Error.cause、safe loggingとOpenTelemetry error handlingを変更するときに使う。
---

# Error Handling

## 必読文書

- [API設計](../../../docs/architecture/apps/api.md)
- [APIテスト戦略](../../../docs/testing-strategy/apps/api.md)
- [Observability](../../../docs/observability.md)
- [API / OpenAPI](../../../docs/api-openapi.md)

## Workflow

1. finite error registryでstatus、public message、capture、retry policyを定義する。
2. unknown value、hostile Error、adapter failureを安全なprojectionへ変換する。
3. application failureをtelemetry failureより優先し、callbackを二重実行しない。
4. response、log、spanの各surfaceへprivate dataが漏れないtestを追加する。
5. OpenAPIのfinite error schemaとruntime responseの一致を検証する。

## Validation

- `bun run --cwd apps/api lint`
- `bun run --cwd apps/api typecheck`
- `bun run --cwd apps/api test`
- `bun run --cwd apps/api test -- openapi --coverage.enabled=false`

## 禁止事項

- raw `Error.message`、cause、stack、URL、opaque IDをpublic responseへ出さない。
- retryableやcapture policyをcall siteごとのbooleanへ分散しない。
- telemetry例外でapplication responseを失敗させない。
- catch後に無条件で成功扱いしない。
