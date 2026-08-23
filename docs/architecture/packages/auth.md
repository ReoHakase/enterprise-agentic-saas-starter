---
title: packages/authの設計
status: accepted
implementation: active
last_reviewed: 2026-08-23
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

Better Auth本体、`@better-auth/api-key`、`@better-auth/drizzle-adapter`、OAuth Provider、Passkey、
`auth` CLIは`1.7.1`へ完全固定します。Better Auth UIはこの更新の対象外です。Drizzle ORM、
Drizzle Kit、Drizzle Seedは互換する`1.0.0-rc.4`へ完全固定し、浮動タグとpeer overrideを使いません。

## Drizzle Relations v2

サーバーは`@better-auth/drizzle-adapter/relations-v2`の標準`drizzleAdapter`を使います。
旧`better-auth/adapters/drizzle`、Relations v1、旧コンストラクターを模倣する互換実装は維持しません。

認証スキーマは固定版`auth` CLIの出力を起点とし、生成された`defineRelationsPart`をDBパッケージの
Relations v2正本へ接続します。OAuth Providerと認証の`relations`は`user`と`session`で重なるため、
テーブル設定全体を上書きせず`relations`フィールド単位で統合します。認証`adapter`と
DBクライアントは、同じテーブルと統合済みの`relations`を受け取ります。

## アカウント識別子

Better Auth 1.7はアカウントを`(issuer, account_id)`で識別します。`issuer`は`NOT NULL`、
`(issuer, account_id)`は一意とし、CLIの最終スキーマと一致させます。

既存データは、現在の構成で信頼できる次の2種類だけを既存データ補完します。

- `provider_id = 'credential'`: `issuer = 'local:credential'`
- `provider_id = 'github'`: `issuer = 'local:oauth:github'`

未知のプロバイダー、`credential`の`account_id`と`user_id`の不一致、補完後の識別子重複は
失敗時に拒否します。推測した`issuer`で利用者を別の`account`へ結び付けません。補完後に
`NOT NULL`と一意制約を追加し、最終スキーマを有効にします。

OAuth Provider 1.7で追加されたリソース、クライアントアサーション、トークン、同意情報の列は
追記しますが、既存のOAuthクライアント、アクセストークン、更新トークン、同意情報、`public`、
`type`、クライアントシークレット、コールバックURLを削除または再登録しません。既存クライアントの
認証方式を補完できない場合も失敗時に拒否します。詳細な段階移行は
[Database lifecycle](../../database-lifecycle.md)を正本にします。

OAuth Provider 1.7で追加された`/admin/oauth2/resources`配下の管理ルートは公開しません。
リソースはmigrationとサーバー構成が所有し、対象の作成、一覧、更新、削除、クライアントとの関連付けを
top-level `disabledPaths`へ追加して公開対象から除外します。動的pathはBetter Authの`disabledPaths`が実requestを
文字列一致で判定するため、同じbase pathのexact segment-prefix guardでも404にします。
認証済みsessionだけを根拠にresource管理を許可しません。

MCPは環境ごとに決まる1つのresourceだけを`resources`へ登録し、request hookでもその完全一致を
要求します。旧`validAudiences`は使いません。既存クライアントには1.7のresource関連行がなく、
環境固有URLをSQLで安全に既存データ補完できないため、`enforcePerClientResources`を明示的に無効にし、
既存クライアントを再登録せず同じresourceだけで利用できるようにします。

OAuth Provider 1.7はBetter Auth contextの初期化時に設定済みresourceをDBへ登録します。Cloudflare
Workerは`@enterprise-agentic-saas/auth`のsingletonをglobal scopeで初期化せず、APIのAuth mount、
session取得、MCP metadata、access token検証が実際に呼ばれたrequest境界で標準ES moduleを遅延
importし、context初期化の完了後に各処理へ委譲します。Bunのlocal serverとAuth package testは同じ
singleton entrypointを維持し、独自factoryやresource登録処理を追加しません。APIが同期的に必要とする
MCP resourceは`API_PUBLIC_URL`から組み立て、deploymentとlocal topologyは`BETTER_AUTH_URL`へ
同じAPI originを渡します。

## テスト

- plugin contract
- session serialization
- `auth.api.generateOpenAPISchema()`と`/auth/open-api/generate-schema`
- callback privacy
- client bundle isolation
- Relations v2 `adapter`と実libSQLの接続
- `user`と`session`に認証とOAuth Provider双方の`relations`が残ること
- CLI生成スキーマとアカウント識別子制約の一致
- `credential`、GitHub、未知プロバイダー、識別子重複の移行境界
- OAuth resource管理ルートがOpenAPIから除外され、全methodで404になること
- 既存と新規のOAuthクライアントが設定済みの単一MCP resourceで`invalid_target`にならないこと
- `revoked`済みのOAuth access tokenをMCP検証とcredential一覧から除外すること
- API Workerのglobal scopeでBetter Auth contextとresource登録を開始しないこと

## 理由

Auth serverとbrowser clientを同一packageで提供しながら、entrypoint単位でruntimeを分離します。
GitHub OAuth emulatorとはHTTP protocolで接続し、source contractを共有しません。

## 受入条件

- client entrypointにserver dependencyがない
- generated Auth schemaとの整合testがある
- Better Auth関連パッケージが`1.7.1`、Drizzle関連パッケージが`1.0.0-rc.4`へ完全固定されている
- Relations v2の標準`adapter`を使い、旧`adapter`と互換実装がない
- アカウント識別子が`(issuer, account_id)`で一意であり、未検証の`issuer`補完を拒否する
- 認証とOAuth Providerの`relations`が同じ`user`、`session`で失われない
- 既存のOAuthクライアント、トークン、同意情報、コールバックURLを破壊しない
- OAuth resource管理ルートを認証済みsessionへ公開しない
- 単一MCP resourceを標準`resources`へ登録し、既存OAuthクライアントの再登録を要求しない
- API Workerではsingletonをrequest境界まで遅延importし、context完了後に委譲してglobal scopeまたは
  response完了後のDB I/Oを発生させない
- Better Auth OpenAPIを結合または変換する独自entrypointがない
- appへの逆依存がない
