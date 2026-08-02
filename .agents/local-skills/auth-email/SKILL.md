---
name: auth-email
description: enterprise-agentic-saas-starterのBetter Auth、session、organization membership、role、permission、auth callbackと認証email接続境界を変更するときに使う。
---

# Auth and Email

## 必読文書

- [Auth package設計](../../../docs/architecture/packages/auth.md)
- [認証・認可・マルチテナント](../../../docs/auth-tenancy-security.md)
- [API設計](../../../docs/architecture/apps/api.md)
- [Observability](../../../docs/observability.md)
- email配信変更時: [Email package設計](../../../docs/architecture/packages/email.md)

## Workflow

1. identity、session、membership、resource authorizationの責務境界を確認する。
2. browser用client、server factory、provider adapterをruntime別entrypointへ分ける。
3. organization境界をrepository queryとDB制約の両方で検証する。
4. callback、account linking、role変更にはnegative caseとcross-tenant testを追加する。
5. email本文やsenderを変更する場合は`email` skillの手順も実行する。
6. account menuのSign outは現在のmulti-sessionトークンだけを`multiSession.revoke`で失効し、Agent失効とローカル後処理の順序を共有`controller`へ集約する。実行直前に`getSession`と`listDeviceSessions`を再取得し、描画時のidentityまたは対象が古い場合は拒否する。

## Validation

- `bun run --cwd packages/auth lint`
- `bun run --cwd packages/auth typecheck`
- `bun run --cwd packages/auth test`
- API接続変更時: `bun run --cwd apps/api test`

## 禁止事項

- browser entrypointへserver secret、DB、Email implementationを混入しない。
- client inputやsession payloadだけでtenant authorizationを確定しない。
- token、recipient全文、provider raw errorをproduction・remote・testのlogやtelemetryへ出さない。
  固定ローカルの例外は[ADR-013](../../../docs/decisions/ADR-013-local-raw-errors-in-logs-only.md)に従い、
  認証情報を除去したcause chainだけを端末とLokiへ出す。
- auth schemaをWebへdeep importしない。
