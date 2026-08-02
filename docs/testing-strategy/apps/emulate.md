---
title: Emulateテスト戦略
status: accepted
implementation: active
last_reviewed: 2026-08-01
applies_to:
  - apps/emulate/**
related:
  - ../packages/auth.md
  - ../e2e.md
---

# Emulateテスト戦略

## 目的

Emulateはlocal開発と決定的E2E専用のsupporting applicationです。production runtimeへ
混入させず、GitHub OAuthを`@emulators/adapter-next`の標準Route Handlerで再現します。

## テスト層

| 名前               | 分類  | テスト内容                                                                             | 対象                                   | Runner                  |
| ------------------ | ----- | -------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------- |
| EMU1 Route契約     | 単体  | `/emulate/github/meta`、2ユーザー、未登録serviceの404                                  | `app/emulate/[...path]/route.test.ts`  | Vitest Node             |
| EMU2 Next build    | build | Node Route Handlerとadapter dependencyをproduction buildできる                         | `apps/emulate/**`                      | Next.js build           |
| EMU3 Auth統合      | 統合  | Better Authのauthorize、callback、token、profile取得がprefix付きbase URLで相互運用する | `packages/auth`のGitHub OAuth contract | Vitest + ephemeral HTTP |
| E1 browser journey | E2E   | `oauth-alice`と`oauth-bob`をworkerごとに分け、Web、API、Auth、emulatorを接続する       | `apps/web/e2e/**`                      | Playwright              |

## production隔離

- production dependency graphとWorker configから到達できない
- emulator URLはdevelopmentまたはtestだけで選択できる
- production credentialをseedやrequestへ渡さない
- 外部inputから任意fixture userを作れない

## 受入条件

- GitHub以外を公開しない
- `/emulate/github/**`だけを公開する
- 2ユーザーを決定的に選べる
- `bun run --cwd apps/emulate lint/typecheck/test/build`が通る
- 実provider credentialを通常CIで必要としない
