---
title: Authパッケージテスト戦略
status: proposed
implementation: planned
last_reviewed: 2026-07-26
applies_to:
  - packages/auth/**
related:
  - ../apps/api.md
  - ../apps/web.md
  - ../apps/github-emulator.md
  - ../packages/db.md
  - ../packages/email.md
---

# Authパッケージテスト戦略

## 目的

`packages/auth`は、Better Auth server factory、browser client、GitHub OAuth contract、Auth OpenAPI、DBとEmail adapterのcompositionを所有します。

認証はAPIだけの内部実装ではありません。serverはAPI、browser clientはWeb、OAuth contractはGitHub emulatorが利用するため、独立したpackage戦略を持ちます。

## コード構造との対応

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

内部境界:

- `client.ts`はDB、Email、Node builtin、server implementationへ依存しない
- `github-oauth.ts`はBetter Auth instanceとDBへ依存しない
- contractはprovider SDKへ依存しない
- test utilityはproduction auth configへ混入しない

## テスト層

| 名前                                      | Testing Trophy 分類 | テスト内容                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 実物として使うもの                                                               | 差し替えるもの                                     | 対象コード/ファイル                                                                                          | Test Runner                    | 実行速度   | CI時間課金以外の費用 | 量                   |
| ----------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------ | ---------- | -------------------- | -------------------- |
| **Auth契約単体テスト (AUTH1)**            | 単体                | <ul><li>callback URL、redirect target、state、nonce、scope、provider responseのparseを確認する</li><li>session result、public user、public organizationのschema変換を確認する</li><li>browser client optionとplugin contractがserver-only dependencyを含まないことを確認する</li><li>open redirect、invalid origin、expired token、unknown provider errorを拒否することを確認する</li></ul>                                                                            | pure contract、schema、URL parser、error mapper                                  | clock、random、ID generator                        | `packages/auth/src/contracts/**`、`client.ts`のpure config、`github-oauth.ts`、callback parser、public model | Vitest Node                    | 極めて速い | なし                 | 多い                 |
| **Authサーバー統合テスト (AUTH2)**        | 統合                | <ul><li>Better Auth factoryがDrizzle adapter、plugin、callback、email commandを正しくcompositionすることを確認する</li><li>user、session、account、organizationの作成と取得を実DBで確認する</li><li>password、magic link、passkey、multi-sessionなど有効化した機能の代表contractを確認する</li><li>test-only utilityがproduction auth instanceへ混入しないことを確認する</li><li>DB failureとemail failureが安全な公開errorへ変換されることを確認する</li></ul>        | Better Auth、Drizzle adapter、実libSQL、Auth plugin、server callback             | external OAuth、email delivery、clock、OTP capture | `packages/auth/src/server/**`、`index.ts`、server factory、adapter composition、test-only auth factory       | Vitest + Better Auth + libSQL  | 速いから中 | なし                 | 厚くする             |
| **Auth HTTPプロトコル統合テスト (AUTH3)** | 統合                | <ul><li>Set-Cookie、cookie attributes、session refresh、sign-out、multiple sessionを実HTTPで確認する</li><li>CSRF、Origin、CORS、trusted origin、callback redirectを確認する</li><li>email verification、magic link、password reset、invitationなどのone-time token lifecycleを確認する</li><li>client disconnect、duplicate callback、expired session、revoked sessionを確認する</li><li>browser clientとserver endpointのruntime型が整合することを確認する</li></ul> | ephemeral HTTP server、Better Auth route、browser client、実cookie jar、実libSQL | email provider、OAuth provider、production domain  | Auth mount、HTTP handler、cookie/session plugin、browser client integration test                             | Vitest + ephemeral HTTP server | 中から遅い | なし                 | 必要な範囲で厚くする |
| **Auth OAuth連携統合テスト (AUTH4)**      | 統合                | <ul><li>GitHub OAuth emulatorとauthorize、callback、token exchange、profile取得を一巡させる</li><li>state mismatch、scope不足、provider cancel、invalid code、expired codeを確認する</li><li>既存accountとのlink、duplicate email、provider identity conflictを確認する</li><li>GitHub本番credentialなしで決定的に実行できることを確認する</li></ul>                                                                                                                   | Auth OAuth adapter、GitHub emulator、ephemeral HTTP、実libSQL                    | GitHub本番、Web UI、production credential          | `packages/auth/src/github-oauth.ts`、OAuth callback、`apps/github-emulator/**`とのcontract                   | Vitest + emulator HTTP         | 遅い       | なし                 | 少数                 |

## AUTH1: Auth契約単体テスト

AUTH1は認証providerやDBを使わず、公開contractと安全なURL処理を検査します。

特にopen redirectを防ぐため、次を確認します。

- absolute external URL
- protocol-relative URL
- encoded slash
- nested callback parameter
- allowed internal path
- invitation path
- unknown route

## AUTH2: Authサーバー統合テスト

Better Authの実instanceと実DBを使います。DB adapterをfakeだけで済ませません。

Better Authのtest utilityを使う場合は、production factoryと分離したtest-only auth factoryへ追加します。privileged helperをproduction configへ条件付きspreadしません。

AUTH2が保証するもの:

- server composition
- schemaとadapterの整合
- session persistence
- callbacks
- plugin behaviour
- email command発行

Email本文の描画品質はEmail packageが保証します。

## AUTH3: Auth HTTPプロトコル統合テスト

認証ではcookie、redirect、Origin、one-time tokenが重要なため、A5とは別にAuth package自身がprotocol testを所有します。

API側A4/A5では、Auth packageをAPIへ正しくmountし、API middlewareやCORSと競合しないことを確認します。

## AUTH4: Auth OAuth連携統合テスト

AUTH4はGitHub emulatorとのprovider contractを検査します。実browserによるlogin pageとnavigationはW6またはE1です。

```text
AUTH4
  browserなしのOAuth protocol

W6
  Web routeとauth UI、downstreamはmock

E1
  browser、Web、API、Auth、DB、emulatorを接続
```

## DB、Email、Web、APIとの責務分担

| 保証                            | 所有者                 |
| ------------------------------- | ---------------------- |
| Auth schemaとmigration          | DB package             |
| Better Auth factoryとDB adapter | AUTH2                  |
| cookie、session、CSRF、redirect | AUTH3                  |
| OAuth provider contract         | AUTH4、GitHub emulator |
| API mountとAPI plugin順序       | API A4/A5              |
| auth formの表示と操作           | Web W2からW4           |
| 実route、callback URL、reload   | Web W6                 |
| full login journeyとpersistence | E1                     |
| 本番相当の最終疎通              | E2                     |

## 実行

```sh
bun --cwd packages/auth run test
```

AUTH1からAUTH4は外部credentialなしで通常CIへ含めます。AUTH4がGitHub本番へ接続する構成は許可しません。

## 受入条件

- Auth packageがserver、client、OAuth contractを独立して所有する
- browser client entrypointへserver dependencyが混入しない
- Better Authを実libSQLと統合検査する
- cookie、CSRF、redirectを実HTTPで検査する
- OAuth providerをemulatorで決定的に検査する
- test utilityがproduction auth configへ混入しない
- API、Web、E2Eとの責務境界が明確である
