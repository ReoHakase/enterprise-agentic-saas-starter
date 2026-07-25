---
title: apps/github-emulatorの設計
status: accepted
implementation: active
last_reviewed: 2026-07-25
applies_to:
  - apps/github-emulator/**
---

# apps/github-emulatorの設計

## 責務

GitHub OAuthのlocal/E2E test infrastructureです。production application codeではありません。

## 目標構造

```text
apps/github-emulator/src/
  index.ts
  config/
  protocol/
  state/
  fixtures/
  server/
  adapters/
  test-support/
```

## 依存関係

許可:

```text
@enterprise-agentic-saas/auth/github-oauth
emulate
valibot
```

Web、API、Agent、DB、Email、UIへ依存しません。production appからemulatorをimportしません。
Auth packageも`github-oauth` entrypoint以外はdeep importしません。fixtureとtest supportをpublic
runtime entrypointから再exportしません。

## 理由

OAuth contractだけを共有し、test infrastructureがproduction data modelへcoupleすることを防ぎます。process再起動をstate reset boundaryとし、外部GitHub credentialを必要としません。

## テスト

protocol、one-time code、state、callback、token、fixtureをVitestで検証し、実browser journeyは`bun run test:e2e`へ置きます。

## 受入条件

- Authの`github-oauth` entrypoint以外をdeep importしない
- remote URLやproduction credentialを受け付けない
- state resetがprocess boundaryで明確
