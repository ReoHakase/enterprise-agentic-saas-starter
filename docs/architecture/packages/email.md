---
title: packages/emailの設計
status: proposed
implementation: planned
last_reviewed: 2026-07-24
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
