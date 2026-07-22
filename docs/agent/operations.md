# 運用runbook

## Local development

`bun run dev`はWeb、API、Agent Worker、local Turso等を起動します。Mastra Studioだけを確認する場合はrepo scriptを使い、production Agent定義と別forkを作りません。OpenRouter keyはgitignore済み`apps/agent/.env.local`または明示的なprocess environmentから読みます。

Agentのfeature flagは`1`だけを有効とし、productionの未設定、`true`、未知値をfail closedにします。local API supervisorは`bun run dev`時だけ`AGENT_ASSET_UPLOAD_ENABLED`未設定を`1`へ補い、明示値は尊重します。disabledとprovider/API障害は別のsafe toastにし、raw responseを表示しません。DB schema変更はDrizzle migrationを生成して適用し、通常起動でpush/resetしません。

## Paid test secret

paid supervisorは`OPENROUTER_API_KEY`をrun専用tmp directoryのAgent専用`.dev.vars`へmode 0600で書き、test process自身、Browser、Next.js、API Worker、GitHub emulatorへ渡しません。console、CLI引数、artifact、`GITHUB_OUTPUT`へ値を出しません。

tmp pathは`$TMPDIR/enterprise-agentic-saas-agent-e2e-<run-id>`のような固定prefixとrun IDを検証してから削除します。既存`bun run dev`、通常のWrangler state、開発DBを停止・resetしません。

## Deploy順序

productionはAPI/Agent Workerの存在とprotocol互換をread-only確認して分岐します。

- fresh/片側欠損: migration → bindingなしbootstrap API → Agent → final API → Web → smoke
- compatible: migration → Agent → API → Web → smoke
- 旧protocol: maintenance windowとone-time bootstrap flagを要求

API/Agent/Webのtypegen、dry-run/build、Sentry source map uploadを先に完了します。Sentry upload失敗後にdeployを続行しません。3 Workerは同じcommit SHAをrelease IDに使います。

## Smoke

- API health/ready/OpenAPI
- Web sign-in、active organization
- Agent default HTTPはfail closed
- API → Agent stream
- Agent → API named entrypoint
- thread ownerとcross-tenant拒否
- natural Web検索とquery guard
- approval Yes/No、Issue write receipt
- image input
- reasoning/tool/activity/context/usage parts
- 3 Sentry projectのreadable stackとprivacy

## Retention

- pending/approved action: 最大15分
- terminal action payload/preview: 7日でscrub
- minimal receipt/audit: audit policyに従う
- ready chat asset: 既定72時間、hard max 7日
- expired action/cardはstatus projectionを返し、汎用load errorにしない
- old `IssueAssistant` SQLite: export/件数/backup/保持判断まで削除しない

scheduled sweepとrequest時lazy sweepはtenant、claim、leaseを再確認し、exact R2 keyのcleanup jobだけを作ります。prefix deleteやbroad filesystem deleteを使いません。

## Incident behavior

- provider outage: product runは2分でabortしてcomposerを復帰し、write toolへfallbackせずrunをcanceled、observed usageを保存する。run grantの5分上限までUIを拘束しない
- internal API outage: bounded 503。raw body/headerを伝播しない
- quota/concurrency: bounded 429と整数`Retry-After`
- DB contention:冪等operation IDでretryし、二重usage/writeを防止
- session/org mismatch: capabilityを失効し、UIをfrozenにして切替完了までtoolを無効化
- approval readだけ失敗: inline retry。他messageとcomposerを利用不能にしない
