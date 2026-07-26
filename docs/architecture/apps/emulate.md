---
title: apps/emulateの設計
status: accepted
implementation: active
last_reviewed: 2026-07-26
applies_to:
  - apps/emulate/**
---

# apps/emulateの設計

## 責務

GitHub、Google、Slack、Apple、Microsoft、Okta、Stripeを再現するlocal/E2E test
infrastructureです。production application codeではありません。

`vercel-labs/emulate`のプログラム用APIに対するrepo所有のlauncherとして、次を所有します。

- 明示的なサービス選択と許可一覧
- サービスごとの既定portとreadiness endpoint
- loopbackに限定した公開用URL
- 1 processにつき1サービスの起動とgraceful shutdown
- GitHub OAuth用のstrict client、secret、callback、fixture user

Google、Slack、Apple、Microsoft、Okta、Stripeの製品接続や独自fixtureは所有しません。
これらは固定した`emulate` versionの既定fixtureを使用します。

## 目標構造

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

## 依存関係

許可:

```text
@enterprise-agentic-saas/auth/github-oauth
emulate
valibot
```

Web、API、Agent、DB、Email、UIへ依存しません。production appからemulatorをimportしません。
Auth packageも`github-oauth` entrypoint以外はdeep importしません。fixtureとtest supportを
public runtime entrypointから再exportしません。

## 実行境界

通常のroot開発起動は既存機能が利用するGitHubだけを起動します。その他のサービスは
`dev:service <service>`または`dev:http <service>`で明示的に選択します。

公開用URL、GitHub callback、listener portはlocal環境だけを許可します。
`NODE_ENV=production`とdebug flagは起動前に拒否し、実プロバイダーのcredentialを読みません。
SDKのlistenerがhostを指定できないため、local machine以外から到達できないnetwork境界でだけ
実行します。

## 理由

独立してHTTPを待ち受ける実行系なので`packages/emulate`ではなく`apps/emulate`に置きます。
1つの共通launcherへlocal安全境界を集約しながら、製品packageへtest infrastructureを
混入させないためです。

## テスト

service registryと環境変数をEMU1、7サービスの実HTTP listenerとreadinessをEMU2、
製品が実際に利用するGitHub OAuthとのprovider contractをEMU3で検証します。
実browser journeyは`bun run test:e2e`へ置きます。

## 受入条件

- 対応する7サービス以外を起動できない
- 1 processにつき1サービスだけを起動する
- root開発起動はGitHubだけを自動起動する
- Authの`github-oauth` entrypoint以外をdeep importしない
- remote URL、production credential、debug flagを受け付けない
- GitHub以外の未実装製品接続を保証済みと扱わない
