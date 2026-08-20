---
title: packages/authの設計
status: accepted
implementation: active
last_reviewed: 2026-08-01
applies_to:
  - packages/auth/**
---

# packages/authの設計

## 責務

Better Auth server factory、browser client factory、GitHub OAuth contract、標準OpenAPI生成ルートを提供します。

## 目標構造

```text
packages/auth/src/
  index.ts
  client.ts
  github-oauth.ts
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
- `@enterprise-agentic-saas/auth/mcp-oauth`
- `@enterprise-agentic-saas/auth/mcp-oauth-credentials`

`client.ts`からDB、Email、Node builtin、`process.env`、`server-only`、server codeをimportしません。
`github-oauth.ts`と`mcp-oauth-contract.ts`はpackage内部のcontractとして維持し、重複する
subpath exportを作りません。Emulateは`@emulators/github`を直接利用し、Authのsourceや公開entrypointを
importしません。`server/**`だけがDB/Emailへ依存できます。

## 依存関係

serverだけがDBとEmail adapterを利用できます。UI、API、Web、Agentへ逆依存しません。
client entrypointへの直接importはOxlint、公開面と推移的なserver dependencyはpackage exports、
Knip、Web buildとpackage testで検査します。

## テスト

- plugin contract
- session serialization
- `auth.api.generateOpenAPISchema()`と`/auth/open-api/generate-schema`
- callback privacy
- client bundle isolation

## 理由

Auth serverとbrowser clientを同一packageで提供しながら、entrypoint単位でruntimeを分離します。
GitHub OAuth emulatorとはHTTP protocolで接続し、source contractを共有しません。

## 受入条件

- client entrypointにserver dependencyがない
- generated Auth schemaとの整合testがある
- Better Auth OpenAPIを結合または変換する独自entrypointがない
- appへの逆依存がない
