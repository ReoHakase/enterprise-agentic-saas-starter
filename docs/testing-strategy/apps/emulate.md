---
title: Emulateテスト戦略
status: accepted
implementation: active
last_reviewed: 2026-07-26
applies_to:
  - apps/emulate/**
related:
  - ../packages/auth.md
  - ../e2e.md
---

# Emulateテスト戦略

## 目的

Emulateはlocal開発と決定的E2E専用のsupporting applicationです。production runtimeへ
混入させず、GitHub、Google、Slack、Apple、Microsoft、Okta、Stripeをlocal HTTP serviceとして
決定的に起動します。

## コード構造との対応

```text
apps/emulate/src/
  index.ts
  adapters/
  config/
  fixtures/
  protocol/
  server/
  services/
  state/
  test-support/
```

許可するworkspace依存は`@enterprise-agentic-saas/auth/github-oauth`のpublic contractだけです。

## テスト層

| 名前                                      | Testing Trophy 分類 | テスト内容                                                                                                                                                                                                                                         | 実物として使うもの                              | 差し替えるもの                    | 対象コード/ファイル                                                    | Test Runner                    | 実行速度   | CI時間課金以外の費用 | 量         |
| ----------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------- | ------------------------------ | ---------- | -------------------- | ---------- |
| **Emulate設定単体テスト (EMU1)**          | 単体                | <ul><li>7サービスの許可一覧、既定port、readiness endpointを確認する</li><li>service選択、環境変数、loopback URL、GitHub callbackを検証する</li><li>production、remote URL、debug flag、未対応serviceを拒否する</li></ul>                           | registry、schema、pure config                   | process、HTTP listener            | `apps/emulate/src/services/**`、`config/**`、`fixtures/**`、`state/**` | Vitest Node                    | 極めて速い | なし                 | 多い       |
| **Emulateサーバー統合テスト (EMU2)**      | 統合                | <ul><li>7サービスを実HTTP listenerで起動できることを確認する</li><li>service固有のreadiness endpointを確認する</li><li>GitHubだけにstrict OAuth seedを渡す</li><li>readiness失敗時のcloseとgraceful shutdownを確認する</li></ul>                   | emulator server、HTTP Request/Response          | 実provider、remote persistence    | `apps/emulate/src/server/**`、`adapters/**`、`index.ts`                | Vitest + ephemeral HTTP server | 速いから中 | なし                 | 厚くする   |
| **Emulate provider契約統合テスト (EMU3)** | 統合                | <ul><li>製品が実装済みのprovider contractとemulatorの相互運用を確認する</li><li>現在は`packages/auth`のGitHub OAuth authorize、callback、token、profile取得を対象にする</li><li>production URLまたはcredentialへ接続しないことを確認する</li></ul> | 製品provider contract、emulator、ephemeral HTTP | 実provider、Web UI、production DB | `apps/emulate/**`と実装済みprovider adapterのcontract test             | Vitest + ephemeral HTTP        | 中から遅い | なし                 | 必要な範囲 |

## production隔離

静的検査とbuild検査で次を確認します。

- production dependency graphから到達できない
- production Worker configへbindingまたはrouteがない
- production build artifactへfixtureとtest endpointが含まれない
- emulator URLはtestまたはdevelopment environmentでのみ選択できる
- external inputから任意fixtureまたは任意userを作れない

## 製品contractとE2Eの境界

- EMU1とEMU2はemulator launcher自身を保証する
- EMU3は実装済みの製品provider contractだけを保証する
- Google、Slack、Apple、Microsoft、Okta、Stripeは、製品adapterが追加されるまでEMU3の対象外
- E1は実browser、Web、API、Auth、emulatorを接続する代表login journeyを持てる
- E2は通常実providerを使わず、安全なprovider sandboxが明示的に用意された場合だけ対象にする

## 受入条件

- emulatorがproduction runtimeから隔離される
- 7サービスの選択と実HTTP起動が検査される
- GitHubのstrict OAuth clientとcallback検証が維持される
- 未実装の製品provider連携を保証済みと記載しない
- 実provider credentialを通常CIで必要としない
