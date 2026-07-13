# 開発者ドキュメント

このディレクトリは、テンプレートを製品へ育てる開発者向けの正本です。agentが次回も使う実装判断は先に `.agents/local-skills/` へ記録し、ここでは人が実行するセットアップ、設計、運用手順をまとめます。

## 読む順序

1. [アーキテクチャ](./architecture.md) — workspace境界とruntime構成
2. [ローカル開発](./local-development.md) — 初回セットアップと日々の起動
3. [Database lifecycle](./database-lifecycle.md) — migration、seed、手動reset
4. [認証・認可・マルチテナント](./auth-tenancy-security.md) — session、role、tenant境界、step-up
5. [API / OpenAPI](./api-openapi.md) — Elysia APIの入口、schema、エラー契約
6. [テスト戦略](./testing.md) — Vitest、Testing Library、Storybook、Playwright
7. [Observability](./observability.md) — Sentry、Spotlight、structured log、trace、monitor、privacy
8. [Cloudflareデプロイと運用](./deployment-operations.md) — Workers、R2、Email Sending、Turso、rollback

## 最短の確認

```sh
bun install --frozen-lockfile
bun run --cwd packages/db db:prepare
bun run --cwd packages/db db:seed
bun run check
bun run build
```

破壊的なDB resetと本番deployは通常の開発コマンドへ混ぜていません。各runbookの確認条件を満たしてから明示実行してください。
