---
name: email
description: enterprise-agentic-saas-starterのReact Email template、email contract、render、Cloudflare Email binding、Mailpit、noop senderを変更するときに使う。
---

# Email

## 必読文書

- [Email package設計](../../../docs/architecture/packages/email.md)
- [Cloudflareデプロイと運用](../../../docs/deployment-operations.md)
- auth emailの場合: [認証・認可・マルチテナント](../../../docs/auth-tenancy-security.md)

## Workflow

1. contract、template、render、provider、runtime compositionの責務を確認する。
2. BunとWorkerdのentrypointを分け、runtime固有依存を共有contractへ漏らさない。
3. URL、token、recipientをsafe fixtureへ置き換えてtemplateとsenderをtestする。
4. production providerはCloudflare `EMAIL` bindingから注入する。
5. auth接続変更時は`auth-email` skillのvalidationも実行する。

## Validation

- `bun run --cwd packages/email lint`
- `bun run --cwd packages/email typecheck`
- `bun run --cwd packages/email test`
- API composition変更時: `bun run --cwd apps/api test`

## 禁止事項

- provider raw error、token、URL、recipient全文、本文をlogやtelemetryへ出さない。
- browserからproviderやserver runtimeをimportしない。
- production deliveryをconsole、SMTP、HTTP APIへ暗黙fallbackしない。
- templateからDBやAuth implementationへ依存しない。
