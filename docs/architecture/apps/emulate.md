---
title: apps/emulateの設計
status: accepted
implementation: active
last_reviewed: 2026-08-01
applies_to:
  - apps/emulate/**
---

# apps/emulateの設計

## 責務

GitHub OAuthを再現するlocal/E2E test infrastructureです。production application codeでは
ありません。Next.js applicationとして実行し、`@emulators/adapter-next`の標準Route Handlerを
`/emulate/github/**`へ公開します。

## 構造

```text
apps/emulate/
  app/emulate/[...path]/route.ts
  next.config.mjs
  package.json
```

Route Handlerは`nodejs` runtimeを使い、`@emulators/github`だけを登録します。fixtureは並列E1で
分離して使える`oauth-alice`と`oauth-bob`の2ユーザーです。

## 所有しないもの

- GitHub以外のservice registry
- 独自HTTP listener、readiness poll、graceful shutdown
- 独自config validatorとlauncher
- production credentialとproduction product接続

origin、port、worktree namespaceは既存の`portless-topology`が所有します。rootの公開入口は
引き続き`bun run dev`であり、`apps/emulate#dev`の内部だけをNext.js標準起動にします。

## 理由

外部serviceを待ち受ける実行系なので`packages`ではなく`apps`に置きます。adapterが所有する
route、seed、request lifecycleへ委譲し、repository固有の保守対象を増やしません。

## テストと受入条件

- `/emulate/github/meta`とOAuth user chooserへ到達できる
- 2ユーザーが決定的に選べる
- GitHub以外を公開しない
- `bun run --cwd apps/emulate lint/typecheck/test/build`が通る
- root `bun run dev`とPortless hostnameを変更しない
