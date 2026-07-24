---
title: packages/authの設計
status: proposed
implementation: planned
last_reviewed: 2026-07-24
applies_to:
  - packages/auth/**
---

# packages/authの設計

## 責務

Better Auth server factory、browser client factory、GitHub OAuth contract、OpenAPI生成を提供します。

## 目標構造

```text
packages/auth/src/
  index.ts
  client.ts
  github-oauth.ts
  openapi.ts
  contracts/
  server/
    callbacks/
    plugins/
    adapters/
  test-support/
```

## 公開entrypoint

- `@enterprise-agentic-saas/auth`
- `@enterprise-agentic-saas/auth/client`
- `@enterprise-agentic-saas/auth/github-oauth`
- `@enterprise-agentic-saas/auth/openapi`

`client.ts`からDB、Email、Node builtin、`process.env`、`server-only`、server codeをimportしません。
`github-oauth.ts`はemulatorとserverが共有するprotocol/schemaだけを公開し、Better Auth server
factory、instance/callback、DB/Email adapter、runtime env、credentialをimportまたは再exportしません。
`server/**`だけがDB/Emailへ依存できます。

## 依存関係

serverだけがDBとEmail adapterを利用できます。UI、API、Web、Agentへ逆依存しません。
client entrypointはbrowser向けarchitecture checkでNode builtin、`server-only`、server pathへの
推移的依存も検査します。

## テスト

- plugin contract
- session serialization
- OpenAPI generation
- callback privacy
- client bundle isolation

## 理由

Auth serverとbrowser clientを同一packageで提供しながら、entrypoint単位でruntimeを分離します。GitHub emulatorにはOAuth contractだけを公開します。

## 受入条件

- client entrypointにserver dependencyがない
- generated Auth schemaとの整合testがある
- appへの逆依存がない
