---
title: GitHub OAuth emulatorテスト戦略
status: accepted
implementation: active
last_reviewed: 2026-07-26
applies_to:
  - apps/github-emulator/**
related:
  - ../packages/auth.md
  - ../e2e.md
---

# GitHub OAuth emulatorテスト戦略

## 目的

GitHub OAuth emulatorはlocal開発と決定的E2E専用のsupporting applicationです。production runtimeへ混入せず、GitHub OAuthのauthorize、callback、token exchange、user responseを決定的に再現します。

## コード構造との対応

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

許可するworkspace依存は原則として`@enterprise-agentic-saas/auth/github-oauth`のpublic contractだけです。

## テスト層

| 名前                                         | Testing Trophy 分類 | テスト内容                                                                                                                                                                                                                                                                                                                   | 実物として使うもの                                  | 差し替えるもの                    | 対象コード/ファイル                                                           | Test Runner                    | 実行速度   | CI時間課金以外の費用 | 量         |
| -------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------- | ------------------------------ | ---------- | -------------------- | ---------- |
| **OAuth emulatorプロトコル単体テスト (GE1)** | 単体                | <ul><li>authorize request、redirect URI、scope、state、codeのparseとvalidationを確認する</li><li>token requestとuser responseのschemaを確認する</li><li>invalid client、invalid code、expired code、state mismatchを確認する</li><li>GitHub本番の公開contractから必要以上のfieldを模倣しないことを確認する</li></ul>         | protocol codec、schema、pure state transition       | clock、ID、random                 | `apps/github-emulator/src/protocol/**`、pure config、state transition         | Vitest Node                    | 極めて速い | なし                 | 多い       |
| **OAuth emulatorサーバー統合テスト (GE2)**   | 統合                | <ul><li>authorize endpointが決定的なcodeを発行し、正しいcallbackへredirectすることを確認する</li><li>token endpointがone-time code、expiry、client認証を処理することを確認する</li><li>user endpointがfixture userを返し、unknown tokenを拒否することを確認する</li><li>testごとのnamespaceとstate resetを確認する</li></ul> | emulator server、state store、HTTP Request/Response | GitHub本番、remote persistence    | `apps/github-emulator/src/server/**`、`state/**`、`adapters/**`、`index.ts`   | Vitest + ephemeral HTTP server | 速いから中 | なし                 | 厚くする   |
| **OAuth契約統合テスト (GE3)**                | 統合                | <ul><li>`packages/auth`のGitHub OAuth client contractとemulatorが相互運用できることを確認する</li><li>authorize、callback、token、profile取得をbrowserなしで一巡させる</li><li>scope不足、provider error、cancel、state mismatchを確認する</li><li>production GitHub URLまたはcredentialへ接続しないことを確認する</li></ul> | Auth OAuth contract、emulator、ephemeral HTTP       | GitHub本番、Web UI、production DB | `apps/github-emulator/**`と`packages/auth/src/github-oauth.ts`のcontract test | Vitest + ephemeral HTTP        | 中から遅い | なし                 | 必要な範囲 |

## production隔離

静的検査とbuild検査で次を確認します。

- production dependency graphから到達できない
- production Worker configへbindingまたはrouteがない
- production build artifactへfixtureとtest endpointが含まれない
- emulator URLはtestまたはdevelopment environmentでのみ選択できる
- external inputから任意fixtureまたは任意userを作れない

## AuthとE2Eの境界

- GE1からGE3はemulator自身とAuth contractを保証する
- Auth packageはBetter AuthへのOAuth adapterを保証する
- E1は実browser、Web、API、Auth、emulatorを接続する代表login journeyを持てる
- E2は通常GitHub本番OAuthを使わず、本番相当の安全なprovider sandboxが明示的に用意された場合だけ対象にする

## 受入条件

- emulatorがproduction runtimeから隔離される
- state、code、tokenがtest namespaceで決定的に生成される
- one-time codeとexpiryが検査される
- Auth contractとbrowserなしで相互運用できる
- GitHub本番credentialを通常CIで必要としない
