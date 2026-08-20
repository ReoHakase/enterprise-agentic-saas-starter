---
title: 製品Agentの運用runbook
status: accepted
implementation: active
last_reviewed: 2026-08-19
---

# 運用runbook

## Local development

`bun run dev`はWeb、API、Agent Worker、local Turso等を起動します。Mastra Studioだけを確認する場合はrepo scriptを使い、production Agent定義と別forkを作りません。OpenRouter keyはgitignore済み`apps/agent/.env.local`または明示的なprocess environmentから読みます。

Agentのfeature flagは`1`だけを有効とし、productionの未設定、`true`、未知値をfail closedにします。local API supervisorは`bun run dev`時だけ`AGENT_ASSET_UPLOAD_ENABLED`未設定を`1`へ補い、明示値は尊重します。disabledとprovider/API障害は別のsafe toastにし、raw responseを表示しません。DB schema変更はDrizzle migrationを生成して適用し、通常起動でpush/resetしません。

ADR-013の固定ローカル条件を満たす`NODE_ENV=development`のAgent processだけは、modelとWeb検索providerの
raw `Error`および起点を含む最大5段のcause chainから認証情報を除去し、local consoleとLokiへ出します。
公開HTTP response、Mastra Memory、workflow snapshot、Tempo、production log、remote telemetry、test・evalの
出力やartifactへは転送しません。consoleとLokiは独立して出力し、片方の失敗でAgent処理を止めません。

## Paid test secret

`OPENROUTER_API_KEY`はgitignore済みの`apps/agent/.env.local`またはGitHub Actionsのprotected
environmentからだけ供給します。fork PRと通常のfree test jobへsecretを渡しません。

Paid testはmaintainerの明示実行、nightly、releaseだけで動かします。repository内にcost計算、
pricing snapshot、予算manifest、credential gatewayを実装しません。workflowとtest runnerの
timeoutでrunawayを止めます。

全paid profileでvideo、trace、screenshot、HTML/DOM report、provider raw responseを保存せず、
console、CLI引数、artifact、`GITHUB_OUTPUT`へkeyを出しません。終了時は起動した子processと一時
resourceだけを停止・削除し、既存のdevelopment processやDBを変更しません。

tmp pathは`$TMPDIR/enterprise-agentic-saas-agent-e2e-<run-id>`のような固定prefixとrun IDを検証してから削除します。既存`bun run dev`、通常のWrangler state、開発DBを停止・resetしません。

## Deploy順序

productionはAPI/Agent Worker、migration ledger、cross-database secret inventoryをread-only確認して分岐します。

- destructive migration、stale secret、fresh/片側欠損、旧protocol: Agent flag全停止 → bindingなしmaintenance API → remote settings確認 → live capability/runの連続zero drain → exact secret削除・再inventory → migration → Agent → final API → remote settings確認 → Web → smoke
- destructive migrationもstale secretもないcompatible release: migration → Agent → final API → remote settings確認 → Web → smoke

maintenance APIはpublic `/agent`、Agent thread/asset file route、named `AgentInternalApi`、scheduled jobを同時に閉じます。health/readiness/OpenAPIは維持し、実routeの503とCloudflare settings上の`AGENT_RUNTIME`欠如、`AGENT_MAINTENANCE_MODE=1`を確認します。drainはApplication DB clockを使う単一aggregate snapshotでticket、resume ticket、grant、runを数え、全件0がgrace window中継続しなければmigrationへ進みません。初回inventoryがcleanだった後にstale secretが現れた場合はraceとして削除せず停止します。final API後は`AGENT_RUNTIME`の存在と`AGENT_MAINTENANCE_MODE=0`をremote settingsで再確認します。

API/Agent/Webのtypegenとdry-run/buildを先に完了します。production remote telemetryは未構成であり、local OTLP envをdeployへ注入しません。

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
- production remote telemetry未構成とlocal OTLP env非注入

## Retention

- pending/approved action: 最大15分
- terminal action payload/preview: 7日でscrub
- minimal receipt/audit: audit policyに従う
- ready chat asset: 既定72時間、hard max 7日
- expired action/cardはstatus projectionを返し、汎用load errorにしない

scheduled sweepとrequest時lazy sweepはtenant、claim、leaseを再確認し、exact R2 keyのcleanup jobだけを作ります。prefix deleteやbroad filesystem deleteを使いません。

## Incident behavior

- provider outage: product runは2分でabortしてcomposerを復帰し、write toolへfallbackせずrunをcanceled、observed usageを保存する。run grantの5分上限までUIを拘束しない
- internal API outage: bounded 503。raw body/headerを伝播しない
- quota/concurrency: bounded 429と整数`Retry-After`
- DB contention:冪等operation IDでretryし、二重usage/writeを防止
- session/org mismatch: capabilityを失効し、UIをfrozenにして切替完了までtoolを無効化
- approval readだけ失敗: inline retry。他messageとcomposerを利用不能にしない
