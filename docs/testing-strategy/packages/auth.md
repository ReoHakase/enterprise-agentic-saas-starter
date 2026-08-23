---
title: Authパッケージテスト戦略
status: accepted
implementation: active
last_reviewed: 2026-08-24
applies_to:
  - packages/auth/**
related:
  - ../apps/api.md
  - ../apps/web.md
  - ../apps/emulate.md
  - ../packages/db.md
  - ../packages/email.md
---

# Authパッケージテスト戦略

## 目的

`packages/auth`は、Better Auth server factory、browser client、package内部のGitHub OAuth contract、Auth OpenAPI、DBとEmail adapterのcompositionを所有します。

認証はAPIだけの内部実装ではありません。serverはAPI、browser clientはWebが利用し、GitHub OAuthは
EmulateのHTTP serviceと接続するため、独立したpackage戦略を持ちます。EmulateからAuth packageへの
source依存は持ちません。

## コード構造との対応

```text
packages/auth/src/
  index.ts
  client.ts
  github-oauth.ts
  openapi.ts

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

| 名前                                      | Testing Trophy 分類 | テスト内容                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 実物として使うもの                                                               | 差し替えるもの                                     | 対象コード/ファイル                                                                                    | Test Runner                    | 実行速度   | CI時間課金以外の費用 | 量                   |
| ----------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------ | ---------- | -------------------- | -------------------- |
| **Auth契約単体テスト (AUTH1)**            | 単体                | <ul><li>callback URL、redirect target、state、nonce、scope、provider responseのparseを確認する</li><li>session result、public user、public organizationのschema変換を確認する</li><li>browser client optionとplugin contractがserver-only dependencyを含まないことを確認する</li><li>open redirect、invalid origin、expired token、unknown provider errorを拒否することを確認する</li></ul>                                                                            | pure contract、schema、URL parser、error mapper                                  | clock、random、ID generator                        | `client.ts`のpure config、`github-oauth.ts`、callback parser、public model                             | Vitest Node                    | 極めて速い | なし                 | 多い                 |
| **Authサーバー統合テスト (AUTH2)**        | 統合                | <ul><li>Better Auth factoryがDrizzle adapter、plugin、callback、email commandを正しくcompositionすることを確認する</li><li>user、session、account、organizationの作成と取得を実DBで確認する</li><li>password、magic link、passkey、multi-sessionなど有効化した機能の代表contractを確認する</li><li>test-only utilityがproduction auth instanceへ混入しないことを確認する</li><li>DB failureとemail failureが安全な公開errorへ変換されることを確認する</li></ul>        | Better Auth、Drizzle adapter、実libSQL、Auth plugin、server callback             | external OAuth、email delivery、clock、OTP capture | `packages/auth/src/server/**`、`index.ts`、server factory、adapter composition、test-only auth factory | Vitest + Better Auth + libSQL  | 速いから中 | なし                 | 厚くする             |
| **Auth HTTPプロトコル統合テスト (AUTH3)** | 統合                | <ul><li>Set-Cookie、cookie attributes、session refresh、sign-out、multiple sessionを実HTTPで確認する</li><li>CSRF、Origin、CORS、trusted origin、callback redirectを確認する</li><li>email verification、magic link、password reset、invitationなどのone-time token lifecycleを確認する</li><li>client disconnect、duplicate callback、expired session、revoked sessionを確認する</li><li>browser clientとserver endpointのruntime型が整合することを確認する</li></ul> | ephemeral HTTP server、Better Auth route、browser client、実cookie jar、実libSQL | email provider、OAuth provider、production domain  | Auth mount、HTTP handler、cookie/session plugin、browser client integration test                       | Vitest + ephemeral HTTP server | 中から遅い | なし                 | 必要な範囲で厚くする |
| **Auth OAuth連携統合テスト (AUTH4)**      | 統合                | <ul><li>EmulateのGitHub serviceとauthorize、callback、token exchange、profile取得を一巡させる</li><li>state mismatch、scope不足、provider cancel、invalid code、expired codeを確認する</li><li>同じ利用者の再ログイン、duplicate email、provider identity conflictを確認する</li><li>GitHub本番credentialなしで決定的に実行できることを確認する</li></ul>                                                                                                              | Auth OAuth adapter、EmulateのGitHub service、ephemeral HTTP、実libSQL            | GitHub本番、Web UI、production credential          | `packages/auth/src/github-oauth.ts`、OAuth callback、`apps/emulate/**`とのcontract                     | Vitest + emulator HTTP         | 遅い       | なし                 | 少数                 |

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

Better Auth 1.7.1とDrizzle `1.0.0-rc.4`の統合では、
`@better-auth/drizzle-adapter/relations-v2`の標準`drizzleAdapter`を実libSQLへ接続します。
旧`adapter`、Relations v1、旧コンストラクターを模倣した互換実装の挙動はテストしません。

AUTH2が保証するもの:

- server composition
- schemaとadapterの整合
- `defineRelationsPart`を統合したRelations v2設定
- `user`と`session`に認証とOAuth Provider双方の`relations`フィールドが残ること
- `credential`の`account`行が`local:credential`の`issuer`で作成、取得できること
- session persistence
- callbacks
- plugin behaviour
- email command発行

Email本文の描画品質はEmail packageが保証します。

## AUTH3: Auth HTTPプロトコル統合テスト

認証ではcookie、redirect、Origin、one-time tokenが重要なため、A5とは別にAuth package自身がprotocol testを所有します。

API側A4/A5では、Auth packageをAPIへ正しくmountし、API middlewareやCORSと競合しないことを確認します。

## AUTH4: Auth OAuth連携統合テスト

AUTH4はEmulateのGitHub serviceとのprovider contractを検査します。実browserによるlogin pageとnavigationはW6またはE1です。

GitHub OAuthの成功シナリオでは、Better Auth 1.7が`account`行を`local:oauth:github`の`issuer`で
作成、取得し、同じ利用者の再ログインで重複行を作らないことも確認します。
`(issuer, account_id)`の一意制約はDB2とDB3、ブラウザーを含むコールバックURLとログイン後の永続化は
E1が所有します。過去のアカウント行を補完するテストは持ちません。

```text
AUTH4
  browserなしのOAuth protocol

W6
  Web routeとauth UI、downstreamはmock

E1
  browser、Web、API、Auth、DB、emulatorを接続
```

## DB、Email、Web、APIとの責務分担

| 保証                            | 所有者                         |
| ------------------------------- | ------------------------------ |
| Auth schemaとmigration          | DB package                     |
| Better Auth factoryとDB adapter | AUTH2                          |
| cookie、session、CSRF、redirect | AUTH3                          |
| OAuth provider contract         | AUTH4、EmulateのGitHub service |
| API mountとAPI plugin順序       | API A4/A5                      |
| auth formの表示と操作           | Web W2からW4                   |
| 実route、callback URL、reload   | Web W6                         |
| full login journeyとpersistence | E1                             |
| 本番相当の最終疎通              | E2                             |

`issuer`制約と新規データベースの最終AuthスキーマはDB2とDB3、Relations v2の`adapter`と
`credential`の`issuer`はAUTH2、GitHubの`issuer`はAUTH4とE1が所有します。

## Better Auth 1.7更新の必須シナリオ

- Given Better Auth CLIの最終スキーマとRelations v2設定、When AUTH2を実行する、Then adapterが
  実libSQLへ接続し、認証とOAuth Provider双方の`relations`フィールドを取得できる。
- Given `credential`で登録する利用者、When `account`行を作成して再取得する、Then
  `issuer = 'local:credential'`で同じ利用者に結び付く。
- Given GitHubエミュレーターの利用者、When OAuth認可とコールバックを一巡する、Then
  `issuer = 'local:oauth:github'`で`account`行を作成し、再ログイン時に重複させない。
- Given OAuth Provider 1.7で追加されたresource管理ルート、When 未認証または認証済みsessionから
  作成、一覧、取得、更新、削除、クライアントとの関連付けを要求する、Then `disabledPaths`と
  exact segment-prefix guardにより全methodを404にし、Auth OpenAPIにも公開しない。
- Given resource管理ルートを公開しない構成で新しく動的登録したOAuthクライアント、When 設定済みの単一MCP
  resourceで認可を開始する、Then resource policyを通過し、`invalid_target`で拒否されない。
- Given 有効期限内かつ必要なscopeを持つOAuth access token、When Better Authが`revoked`を設定する、
  Then MCP access token検証は無効として扱い、credential一覧にも表示しない。
- Given API Workerのmoduleを評価する、When Auth route、session、MCP metadata、access token検証をまだ
  呼んでいない、Then `@enterprise-agentic-saas/auth`を読み込まず、Better Auth contextのresource登録を
  global scopeで開始しない。各surfaceをrequestから呼ぶと同じ標準ES moduleを読み込み、
  singleton contextが完了するまで下流処理を開始せずに応答する。

ライブラリ内部の全挙動を再テストせず、バージョン更新で変わった`adapter`、`relations`、
アカウント識別子とリポジトリ固有の配線だけを残します。

## 実行

```sh
bun --cwd packages/auth run test
```

AUTH1からAUTH4は外部credentialなしで通常CIへ含めます。AUTH4がGitHub本番へ接続する構成は許可しません。

## 受入条件

- Auth packageがserver、client、OAuth contractを独立して所有する
- browser client entrypointへserver dependencyが混入しない
- Better Authを実libSQLと統合検査する
- Relations v2の標準`adapter`を使い、認証とOAuth Providerの`relations`フィールドを保持する
- `credential`とGitHubの`issuer`を代表経路で検査する
- cookie、CSRF、redirectを実HTTPで検査する
- OAuth providerをemulatorで決定的に検査する
- 単一の基準マイグレーションから作成したAuthスキーマで代表的な認証経路が成功する
- OAuth resource管理ルートが認証済みsessionにも公開されない
- Better Authが`revoked`を設定したOAuth access tokenを検証とcredential一覧の双方から除外する
- 標準`resources`と単一resourceの設定で新しく動的登録したOAuthクライアントを利用できる
- API WorkerがBetter Auth singletonをrequest境界まで遅延importし、context完了後に各処理へ委譲する
- test utilityがproduction auth configへ混入しない
- API、Web、E2Eとの責務境界が明確である
