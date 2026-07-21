# Agent Worker

Cloudflare Agents SDK の Durable Object を実行する独立 Worker です。Web から発行された一回限りの接続 ticket を API Worker の named service binding で消費し、認証できた WebSocket 接続だけを Agent へ転送します。

connection grant は live WebSocket ごとのmemoryだけに保持し、connection state、message、Durable Object SQLiteへ保存しません。isolate wake後にmemory上のgrantがなければ接続を閉じ、fresh ticketでの再接続を要求します。各user messageは `startRun` でrun grantへ交換し、account、active organization、member、label、Issueのbounded read toolだけがrun grantを使います。Issue mutation toolはこの段階には含めません。

## ローカル起動

```bash
bun run cf:typegen
bun run dev
```

Worker 用の `OPENROUTER_API_KEY` は追跡対象外の `.env.local` にのみ設定します。`bun run dev` は公開可能な既定値を `.dev.vars.example`、秘密値を `.env.local` から読み込みます。接続 URL は `/agents/issue-assistant/:threadId?ticket=...` の完全一致で、`Origin` は `WEB_ORIGIN` と完全一致する必要があります。

## 検証

```bash
bun run test
bun run typecheck
bun run lint
bun run format:check
bun run build:cloudflare
```

Mastra は本番 Worker に含めず、OpenRouter 疎通確認だけに使います。課金を伴うため通常テストや CI からは呼び出しません。key は追跡対象外の `apps/agent/.env.local` へ設定し、値をcommand lineやlogへ出しません。

```bash
bun run smoke:mastra
```
