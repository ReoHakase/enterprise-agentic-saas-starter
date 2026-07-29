# Agent Worker

Mastra の `product-agent` を実行するprivate Cloudflare Workerです。BrowserはこのWorkerへ直接接続せず、cookie認証済みAPIの`POST /agent/chat`がnamed `AGENT_RUNTIME` Service Bindingを通してstreamをproxyします。default fetchは常に404を返し、`workers.dev`、preview URL、custom domainを公開しません。

APIはsession、active organization、membership、thread ownerを検証し、Application Tursoの6列のthread認可台帳からone-time run ticketを発行します。Agentは`AGENT_INTERNAL_API` Service Bindingだけでticket消費、bounded read tool、承認付きIssue CRUDを行い、native UIMessage履歴とWorkflow snapshotをAgent専用TursoのMastra Storageへ保存します。API認可後のthread listとhistoryもService Binding経由で取得し、archive済みregistryはAgent DBに履歴が残っていても公開しません。画像は現在のmessageに限ってAPI bindingからbounded WebPとして取得し、provider向けの一時contextへだけ追加します。

旧Agents SDKの`IssueAssistant` SQLite Durable Objectはdata retentionのため`v1` migrationとclass exportだけを残し、runtime bindingとpublic routeを持ちません。旧messageのexport/backfillとretention判断が終わるまで`deleted_classes`を追加しないでください。

## ローカル起動

```bash
bun run cf:typegen
bun run dev
```

Worker用の`OPENROUTER_API_KEY`、`SENTRY_DSN`、remote利用時の`MASTRA_STORAGE_AUTH_TOKEN`は追跡対象外の`.env.local`にのみ設定します。`bun run dev`は公開可能な既定値を`.dev.vars.example`、秘密値を`.env.local`から読み込み、Application DBとは別のlocal Agent DBを`storage:dev`で同時起動します。Portless topologyが`MASTRA_STORAGE_URL`とlocal tokenをworktreeごとに解決し、Agent WorkerとMastra Studioへ同じ値を渡します。`MASTRA_STORAGE_URL`とcredentialはApplication Tursoと共有できず、production deployも同一URLまたはtokenを拒否します。`AGENT_RUNS_ENABLED`、`AGENT_WRITES_ENABLED`、`AGENT_VISION_ENABLED`は明示値`1`でだけ有効になるfail-closed switchです。

SentryはAgent Worker専用の `SENTRY_ENVIRONMENT` と `SENTRY_RELEASE` を使います。event、log、spanからrequest data、ticket、grant、resume ticket、prompt、tool payloadを除去し、固定error codeだけを記録します。

Mastra Studioはrepo rootの`bun run dev`でAgent Workerと一緒に起動します。

```bash
bun run dev
```

Studioだけを起動したい場合は次を使います。

```bash
bun run dev:agent:studio
```

main checkoutのPortless URLは `https://mastra-studio.enterprise-agentic-saas.localhost` です。
linked worktreeでは
`bun run portless-topology resolve mastra-studio.enterprise-agentic-saas`で実効URLを
確認します。`MASTRA_AUTO_DETECT_URL=true`によりbrowserのsame-origin `/api`へ接続し、
ephemeralなdirect HTTP portやmixed contentへ依存しません。Studioもproduction Workerと同じ
`src/mastra/index.ts`を読み込みます。

Agent DBだけを操作する場合は`bun run storage:dev`、`bun run storage:smoke`、
`bun run storage:reset`を使います。`storage:dev`と`storage:smoke`はworktree別のAgent storage URLを
使い、`storage:reset`はこのworktree内の固定local Agent DB以外を拒否します。

free full-stack E2Eはproductionとは別の`wrangler.e2e.jsonc`と
`src/mastra/e2e/worker.ts`を使い、standard scripted modelをcompile-timeで注入します。
production環境変数からmodelを切り替える経路はありません。production dry-runは
scripted modelのsentinelがbundleへ混入していないことまで検査します。

## 検証

```bash
bun run test
bun run typecheck
bun run lint
bun run format:check
bun run build:cloudflare
```

Mastraは本番Workerのruntime authorityです。通常のunit testとCIはproviderを呼ばず、課金を伴うOpenRouter疎通確認だけを明示的なsmokeで実行します。keyは追跡対象外の`apps/agent/.env.local`へ設定し、値をcommand lineやlogへ出しません。

```bash
bun run smoke:mastra
```
