# 開発者ドキュメント

このディレクトリは、テンプレートを製品へ育てる開発者向けの正本です。agentが次回も使う実装判断は先に `.agents/local-skills/` へ記録し、ここでは人が実行するセットアップ、設計、運用手順をまとめます。

## 読む順序

1. [アーキテクチャ](./architecture.md) — workspace境界とruntime構成
2. [ローカル開発](./local-development.md) — 初回セットアップと日々の起動
3. [Database lifecycle](./database-lifecycle.md) — migration、seed、手動reset
4. [認証・認可・マルチテナント](./auth-tenancy-security.md) — session、role、tenant境界、step-up
5. [Agent runtime・tool・承認](./agent-runtime.md) — 3 Worker、Issue CRUD、HITL、chat画像、client state、tenant切り替え
6. [API / OpenAPI](./api-openapi.md) — Elysia APIの入口、schema、エラー契約
7. [テスト戦略](./testing.md) — Vitest、Testing Library、Storybook、Playwright
8. [Observability](./observability.md) — Sentry、Spotlight、structured log、trace、monitor、privacy
9. [認証付きfile storage](./file-storage-r2.md) — private R2、Images、quota、local seed、障害復旧
10. [10 MB upload memory smoke](./upload-memory-smoke.md) — local workerd、並列multipart、RSSの読み方
11. [Cloudflareデプロイと運用](./deployment-operations.md) — Workers、R2、Email Sending、Turso、rollback

## 最短の確認

```sh
bun install --frozen-lockfile
bun run check
bun run build
```

local applicationは `bun run dev` 1つで起動します。Webは`next dev --turbopack`のFast Refresh、APIは`src/worker.ts`をmainにした`wrangler dev`のsource再bundleとWorker isolate再起動を使い、build済みartifactは実行しません。このcommandにはlocal Turso、migration、Drizzle Studio、永続R2、Mailpit、React Email preview、GitHub OAuth emulatorを含めますが、DB seed、R2 fixture reconcile、testは含めません。fixtureが必要なときだけ`bun run dev:db:seed`を明示実行します。このseed commandはfull devが停止中でも必要なlocal processだけを一時起動でき、起動中ならhealthyなAPI dev sessionを再利用します。main checkoutの送信メールは `https://mailpit.enterprise-agentic-saas.localhost`、GitHub user pickerは`https://github.emulate.enterprise-agentic-saas.localhost`で確認できます。linked worktreeでは各`portless get`の出力を使います。DBだけが必要な場合は`bun run dev:db`を使います。初回起動、reset、seedの関係は[ローカル開発](./local-development.md)を参照してください。

破壊的なDB resetと本番deployは通常の開発コマンドへ混ぜていません。各runbookの確認条件を満たしてから明示実行してください。
