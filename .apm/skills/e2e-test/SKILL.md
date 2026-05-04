---
name: e2e-test
description: enterprise-agentic-saas-starterのPlaywright E2E、auth flow、organization/group/permission、todoのマルチテナント導線、Cloudflare/Next/Elysia連携、Playwright MCP、E2Eデータ準備、storybookではなくE2Eで見るべき範囲を変更するときに使う。
---

# E2E Test

このskillはPlaywright E2Eを書く・直す・範囲を判断するときに使う。

## E2Eで見るもの

- sign in / magic link / OAuth callback の代表導線。
- organization/group作成。
- member invitation。
- permission denied。
- tenantをまたいだtodo/project access禁止。
- critical CRUD flow。
- billing/settingsなどSaaSで壊れると困る導線。

## E2Eで見すぎないもの

- buttonの見た目。
- form部品の細かい状態。
- pure function。
- Valibot schemaの細かいvalidation。
- component単体のa11y/interaction。これはStorybook test runnerへ寄せる。

## 方針

- Playwright testは `apps/web/e2e` に置く。
- API/backendの細かい分岐はVitest + `app.handle()` で押さえ、E2Eは主要導線に絞る。
- auth/session/org/permissionはE2Eで最低1本ずつ代表失敗ケースを置く。
- test dataはtenant境界が見える名前にする。
- flakyな外部OAuthやmail providerはPRではmock/smoke、mainでは実環境寄りに分ける。
- Playwright MCPが使える場合はlocal UI確認、locator調査、失敗スクリーンショット確認に使う。

## 実装時の確認

- `webServer` でNext.jsとAPIが起動するか。
- envはdotenvx/direnv/GitHub Secretsから入り、secretをtest artifactへ出さないか。
- trace、screenshot、video、HTML reportをCI artifactに残すか。
- tenant Aのユーザーがtenant Bのtodoを見られないことを確認しているか。

具体的なPlaywright configやテスト例が必要なときだけ `references/e2e-test.md` を読む。
