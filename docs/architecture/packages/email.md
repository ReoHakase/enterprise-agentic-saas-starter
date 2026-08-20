---
title: packages/emailの設計
status: accepted
implementation: active
last_reviewed: 2026-07-25
applies_to:
  - packages/email/**
---

# packages/emailの設計

## 責務

Email contract、React Email template、render、provider adapter、development Mailpitを所有します。

## 目標構造

```text
packages/email/src/
  index.ts
  config.ts
  contracts/
  templates/
  render/
  runtime/
  providers/
  development/
  test-support/
```

## 依存方向

```text
contracts
  <- templates
  <- render

contracts
  <- providers
  <- runtime
```

Templateからprovider、runtime、Auth、DB、UIをimportしません。Email UIとWeb UIはCSS/runtimeが異なるため共有しません。
`contracts`と`runtime/types.ts`はReact Emailとprovider SDKを知りません。templateはprovider、
runtime、environment、Cloudflare binding、Node APIをimportせず、concrete runtimeだけが
environmentとadapterを選びます。
test-supportとdevelopment Mailpitをproduction public entrypointから再exportしません。

## 公開entrypoint

- `@enterprise-agentic-saas/email`: template、render helper、provider contract
- `@enterprise-agentic-saas/email/config`: environment非依存の設定解決
- `@enterprise-agentic-saas/email/runtime`: runtime別のsender
- `@enterprise-agentic-saas/email/development`: 開発process専用のMailpit session helper

root entrypointと同じtemplateを返す`./templates` subpathは公開しません。

## テスト

- template render
- privacy redaction
- provider error mapping
- runtime selection
- noop/console/Mailpit adapter

## 受入条件

- Templateがprovider-independent
- Email本文、token、recipient全文をtelemetryへ出さない
- Authやappへの逆依存がない
