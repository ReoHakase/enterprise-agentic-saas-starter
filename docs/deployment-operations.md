---
title: Cloudflare deploymentと運用
status: accepted
implementation: active
last_reviewed: 2026-07-28
---

# Cloudflareデプロイと運用

## 対象

- `apps/web`: OpenNext Cloudflare Worker + Assets + R2 incremental cache
- `apps/api`: Elysia Cloudflare Worker + private R2 file storage + Images binding
- `apps/agent`: private Mastra Worker。model、skills、tools、workflow、AI SDK streamだけを担当し、DB/R2/Authへ直接触れない
- Database: Turso/libSQL（Cloudflare外の唯一のprimary data store）

設定の正本は `apps/web/wrangler.jsonc`、`apps/web/open-next.config.ts`、`apps/api/wrangler.jsonc`、`apps/agent/wrangler.jsonc` です。通信方向はBrowser→Web/API、API→Agent named runtime、Agent→API named private `/internal/agent/*`です。BrowserはAgent Workerへ直接接続しません。

## 初回provisioning

```sh
bunx wrangler login
bunx wrangler r2 bucket create enterprise-agentic-saas-web-cache
bunx wrangler r2 bucket create enterprise-agentic-saas-attachments
```

worker名とbucket名はstarterからforkした製品固有名へ変更してください。custom domainは同じ親domainの `app.example.com` / `api.example.com` だけに付け、`AUTH_COOKIE_DOMAIN=example.com`のようにこのapplication専用の親domainへ閉じます。GitHub Environmentの`APP_BASE_URL`と`API_PUBLIC_URL`にはpath、query、末尾slashを含まない完全なHTTPS originを設定します。Agent用public originは作りません。

Custom DomainはCloudflare dashboardまたはIaCで初回に登録し、DNSとTLSのactive状態を確認します。deploy workflowは2 originからhostnameを安全に抽出し、Web/API deployへ`--domain`を毎回渡してroute driftを防ぎます。`--strict`でworkflow外のremote変更との競合をsilent overwriteせず停止します。Agent Workerは`workers_dev=false`、`preview_urls=false`を維持し、route/custom domainを一つも持ちません。Agentの正常性はAPI→Agent Service BindingとAgent→API private internal routeを通す認証付きsmokeで確認します。

Agent Workerの`AGENT_INTERNAL_API`はAPI Worker `enterprise-agentic-saas-api`のnamed `WorkerEntrypoint` `AgentInternalApi`へのService Bindingです。named entrypointの`fetch`内だけでprivate Elysia `/internal/agent/*`を処理し、public API appやOpenAPIへmountしません。AgentはEden custom fetcherからbindingを呼び、public HTTP fallbackを持ちません。逆方向のAPI `AGENT_RUNTIME`はAgent named `AgentRuntime`だけを指します。fork時は両方の`services[].service`と`entrypoint`を同時に変更します。AgentへTurso、R2、Better Auth、Email bindingを渡しません。

`enterprise-agentic-saas-attachments` は物理bucket名だけを互換性のため維持し、Worker bindingは汎用名`FILES`を使います。bucketはprivateのままにし、public accessと`r2.dev`を有効化しません。API WorkerにはCloudflare Imagesの`IMAGES` bindingとWorkers Cacheも必要です。設定と障害復旧は[認証付きfile storage](./file-storage-r2.md)を参照してください。

Cloudflare dashboardまたはIaCでAPI Workerへ次を設定します。

- vars: `NODE_ENV=production`, `APP_NAME`, `APP_BASE_URL`, `API_PUBLIC_URL`, `BETTER_AUTH_URL`, `AUTH_COOKIE_DOMAIN`, `TRUSTED_ORIGINS`, `CORS_ORIGIN`, `EMAIL_PROVIDER=cloudflare`, `EMAIL_FROM`, `AGENT_ASSET_UPLOAD_ENABLED`
- secrets: `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`

Agent Workerへはvarsとして`AGENT_RUNS_ENABLED`、`AGENT_VISION_ENABLED`、`AGENT_WRITES_ENABLED`、`NODE_ENV=production`、secretとして`OPENROUTER_API_KEY`を設定します。production remote telemetryは未構成です。

Web buildには`API_PUBLIC_URL`と`NEXT_PUBLIC_API_BASE_URL`を同じAPI originとして渡します。`NEXT_PUBLIC_AGENT_BASE_URL`は設定しません。file preview/download/Agent chatはBetter Auth cookieを使うAPI routeなので、Web/APIは同じregistrable domain配下に置き、`AUTH_COOKIE_DOMAIN`、`TRUSTED_ORIGINS`、credential付き`CORS_ORIGIN`を揃えます。R2、Images、Agent専用domainは不要です。

`keep_vars: true`は既存のdashboard varsを残しますが、GitHub ActionsのdeployはreleaseとAgent feature flagを毎回明示します。環境ごとの全設定一覧はIaC/secret managerでも管理し、dashboardだけを唯一の記録にしません。

## Agent feature flag

次の4値はGitHub `production` Environmentのvarsへ必ず文字列`0`または`1`で登録します。未設定、空文字、`true`、大文字、小数などは許可せず、runtimeでも`1`だけを有効としてfail closedに扱います。

- `AGENT_ASSET_UPLOAD_ENABLED`: APIのchat画像upload
- `AGENT_RUNS_ENABLED`: Agentのmodel run
- `AGENT_VISION_ENABLED`: Agentの画像入力
- `AGENT_WRITES_ENABLED`: AgentのIssue write tool

初回rolloutは全て`0`で3 Workerとbindingをdeployし、API smoke後にasset upload、run、vision、writeの順で段階的に`1`へ進めます。`0011_file_activity_backfill`の互換deployが必要な場合も、migration完了までは4値を全て`0`に固定し、workflowは1つでも`1`ならWorkerを変更する前に停止します。障害時はまず該当flagを`0`に戻して再deployし、データを削除したりsecretを消したりして停止しません。

Issue添付画像toolのrolloutでは、既存環境の`AGENT_VISION_ENABLED`を一時的に`0`へ戻します。DB migrationやpublic file routeは追加せず、添付metadataを返す互換API/Webを先行し、Agent Workerとprivate model routeのsmoke後に`1`へ戻します。`0`の間も`get_issue`の添付metadataは利用でき、画像toolだけを登録しません。

## GitHub Environmentとsecret注入

GitHub `production` Environmentでは、少なくとも次を登録します。

- vars: `APP_NAME`、`APP_BASE_URL`、`API_PUBLIC_URL`、`AUTH_COOKIE_DOMAIN`、`EMAIL_PROVIDER=cloudflare`、`EMAIL_FROM`、4つのAgent flag
- secrets: `BETTER_AUTH_SECRET`、`OAUTH_GITHUB_CLIENT_ID`、`OAUTH_GITHUB_CLIENT_SECRET`、`TURSO_DATABASE_URL`、`TURSO_AUTH_TOKEN`、`OPENROUTER_API_KEY`、`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`

workflowはsecretをjob全体のenvへ置かず、validation、migration、各deployの必要stepだけへ渡します。3 Workerとも`umask 077`で作った一時JSONへruntime secretを書き、WebのOpenNext経由を含む`wrangler deploy --secrets-file`でcodeと同じversionへ加算的に注入し、step終了時に必ず削除します。値をCLI引数、`echo`、`GITHUB_OUTPUT`、artifactへ渡しません。`--secrets-file`に含めなかった既存secretは保持されるため、secret削除は別の明示手順で行います。

production telemetry backendは未構成です。local OTLP endpointと`DEV_*`をproduction deployへ注入しません。

## Fileとorganization削除のR2 cleanup

API Workerのscheduled handlerは`apps/api/wrangler.jsonc`のcron（既定は毎分）で`file_cleanup_jobs`と`organization_deletion_jobs`を処理します。file削除はquota解放、metadata削除、exact-key job、auditを同じtransactionで確定し、R2 objectをbackgroundで冪等削除します。Issue削除はowner prefix、organization削除は`organizations/<encoded organization id>/` prefixを対象にします。job tableは削除済みresourceへの外部keyを持たないため、cleanupを継続できます。

processorはleaseと指数backoffで再試行します。`pending` / retry可能な`failed` / lease切れ`processing`だけをclaimし、成功を`completed`にします。完了/失敗更新はclaim時の`attempts + locked_at`が一致する場合だけ行うため、時間のかかった旧workerがlease再取得後の状態を上書きしません。batch logは`claimed/completed/failed/stale`の件数、失敗eventはattemptと固定error codeだけを記録します。job ID、organization/user ID、slug、email、filename、object keyをproduction logやremote telemetryへ出しません。運用では`failed`件数、`stale`発生、最古job ageを監視し、`FILES` bindingやbucket権限を解消後、次回cronの冪等retryに任せます。

## Cloudflare Email Sending

Email Service > Email Sendingで送信domainをonboardし、SPF、DKIM、DMARCを確認する。`EMAIL_FROM`にはそのdomainの実addressを指定する。Cloudflare DNSを使うことと、利用plan・Beta提供条件をproduction契約前に確認する。

API Workerの`wrangler.jsonc`はstructured Workers API用の`EMAIL` bindingを持つ。starterでは製品の送信addressが未確定なためbinding restrictionを固定していない。fork後は`allowed_sender_addresses`を`EMAIL_FROM`と一致させ、漏洩や実装ミスで別senderを使えないようにする。

local Bun developmentは既定で`EMAIL_PROVIDER=mailpit`を使い、portlessのlocal inboxへ送る。`mailpit`と`console`はproductionでは起動時に拒否する。Cloudflare Worker productionは`EMAIL_PROVIDER=cloudflare`、検証済み`EMAIL_FROM`、`EMAIL` bindingを必須にする。`noop`はtestまたは明示的な配送停止環境だけに使い、magic linkが必要なproductionでは選ばない。

通常の`wrangler dev`はEmail bindingをlocal simulationし、本文をlocal fileへ保存するが実配送しない。bindingへ`remote: true`を一時指定すると実メールを送るため、共通設定へcommitせず、検証済みtest recipientだけで実行する。送信eventにはtemplate、recipient domain、message ID、Cloudflare error code、retryableだけを残し、URL/token/本文/recipient全文を記録しない。

organization invitationは`invitation_email_jobs`から配送します。jobはrecipient、token、URL、organization/user IDを持たず、送信時にinvitation・organization・inviterをjoinします。API request後の`waitUntil`と毎分scheduled handlerは同じprocessorを呼び、1回25件、5分lease、30秒から最大1時間の指数backoffで処理します。`attempts + locked_at`をfencing tokenにするため、lease切れ後の旧workerは新しい結果を上書きできません。

招待再送/期限切れ復活ではinvitationごとに一意な同じjobを`pending`へ戻し、error、lock、next attempt、completed時刻をclearします。`attempts`はresetせず単調増加させるため、再送直前まで動いていた旧workerの完了/失敗更新はfencing条件に一致せずstaleになります。job欠損時だけ同じtransactionで再作成します。

監視対象はbatchの`claimed/completed/failed/canceled/stale`件数、失敗時のattempt・固定error code・retryableだけです。job/invitation/organization/user ID、email、URL、provider raw errorをproduction logやremote telemetryへ出しません。`failed`増加、`stale`、最古pending ageをalertにし、bindingやsender domainを修復後はcronの再試行へ任せます。provider受付とjob完了の間でWorkerが停止すると重複配送の可能性が残るため、運用上はat-least-onceとして扱います。

## Production observability

production remote backendは未構成です。local用`grafana/otel-lgtm`、fixed endpoint、Portless alias、rich content policyをproductionへ持ち込みません。Grafana Cloudまたはself-hosted LGTMを導入するときはretention、tenant isolation、source map、alert、sampling、費用、Cloudflare native exportとの重複防止を別ADRで決めます。詳細は[Observability](./observability.md)を参照してください。

本番では `AUTH_COOKIE_DOMAIN` が必須です。異なる親domainへapp/APIを分離するとcookie sessionが成立しないため、DNS設計を先に確定します。

## Type生成とdry-run

```sh
bun run --cwd apps/api cf:typegen
bun run --cwd apps/agent cf:typegen
bun run --cwd apps/web cf:typegen
bun run build:cloudflare
```

API/Agentの生成後はtrackedな`apps/api/src/cloudflare-env.d.ts`と`apps/agent/src/cloudflare-env.d.ts`に差分がないことを確認します。Webのpackage commandは`apps/web/cloudflare-env.d.ts`を生成しますが、production workflowではsource treeを汚さないよう`RUNNER_TEMP`へ生成して成功とnon-emptyを検証します。特にAPIの`AGENT_RUNTIME`、Agentの`AGENT_INTERNAL_API`、3つのAgent feature flagがtypeへ反映されない状態でdeployしません。

API WorkerはElysia Cloudflare adapter、WebはOpenNext、AgentはMastraとCloudflare named entrypointを使います。Bun/Next buildだけをrelease判定にせず、3 Worker全てのCloudflare dry-runを通します。

## Deploy順序

1. Turso backup/restore pointを確認する。
2. workflowがAPI/Agent Worker、migration ledger、API/Agentのcross-database secret inventoryをread-only確認する。destructive migration、stale secret、片側Worker欠損、または明示した旧protocol切替が1つでもあればcompatibility rolloutを必須にする。
3. 4つのAgent flagが全て`0`であることを確認し、`apps/api/wrangler.bootstrap.jsonc`で`AGENT_RUNTIME`を持たないAPIを`AGENT_MAINTENANCE_MODE=1`としてdeployする。maintenance中はpublic `/agent`、Agent thread/asset file route、named `AgentInternalApi`、scheduled jobを503または停止状態へ閉じる。
4. API health/readiness/OpenAPIとmaintenance smokeを通し、Cloudflare Worker settingsのremote inventoryで`AGENT_RUNTIME`が存在せず、`AGENT_MAINTENANCE_MODE`がplain textの`1`であることを確認する。
5. Application DBの1つのaggregate queryでDB clock、live connection/resume ticket、unrevoked grant、`running` / `waiting_approval` runを同時に取得する。最大capability lifetimeを含むbounded deadline内で全件0がgrace window中継続するまでpollingし、途中で1件でも再発したらzero windowを最初から数え直す。partial schema、timeout、query errorでは停止する。
6. 初回inventoryで検出した禁止secretだけをAPI/Agent Workerからexact nameで削除する。削除直前に再inventoryし、初回がcleanだったWorkerへ新たな禁止secretが現れた場合は削除せず停止する。Workerごとの削除と確認を終えた後、migration直前にAPI/Agentのfresh inventoryを全件取り直し、初回後の新規禁止secretと禁止secret残存がどちらもないことを再検査する。
7. production migrationを1回だけ適用し、Agent WorkerをdeployしてAPI named entrypointへのService Binding解決を確認する。
8. final API Workerを`AGENT_RUNTIME` binding付き、`AGENT_MAINTENANCE_MODE=0`でdeployし、health/readiness/OpenAPIを自動smokeする。Cloudflare Worker settingsのremote inventoryでもbindingの存在とmaintenance解除を確認する。
9. Web Workerをbuildしてからdeployし、custom domainのsign-in pageを自動smokeする。
10. sign-in/org/Issue/API→Mastra stream/Agent→private `/internal/*` journeyを認証付きE2Eで確認する。

compatibility rolloutはremote inventory、maintenance smoke、drainを伴うため、上記を手動commandへ分解せず`Deploy production` workflowを使います。destructive migrationもstale secretもないcompatible releaseだけがmigration-first順序を取れます。

これは順序の概要です。相互Service Bindingはtarget Workerが先に存在する必要があるため、compatibility rolloutでは常にbindingなしAPIを先に置きます。Workerの存在だけではprotocol互換性やtraffic停止を証明できません。remote settings inventory、実API maintenance smoke、Application DBの連続zero windowを全て通してからsecret削除とdestructive migrationへ進みます。旧Agents SDKからの初回切替は4 Agent flagを全て`0`にし、`force_agent_protocol_bootstrap=true`を選びます。workflowはこのinput時にflagが1つでも`0`以外なら停止します。`apps/api/wrangler.bootstrap.jsonc`はfinal configと同じWorker名・binding・trigger・observabilityを持ち、outbound `services`だけを除きます。この差分はunit contract testで固定します。Cloudflareのauth failure、network error、429、5xxをWorker不存在と推測せず停止します。runtime secretをCLI引数へ渡さず、flagは検証済みのGitHub Environment varsから渡し、実際のproduction deployは`Deploy production` workflowだけから実行します。workflowは`production` Environmentのapprovalとconcurrency lock付きで進め、どのdeploy、inventory、drain、または自動smokeで失敗しても後続の破壊的操作へ進みません。

旧Agentの`IssueAssistant` SQLite Durable Object namespaceはこのprotocol切替では削除しません。Agent configに既存`v1 new_sqlite_classes` migrationを残し、worker bundleにも410を返すretention classをexportしますが、Durable Object bindingとpublic routeは外します。これにより新規trafficをMastra `AgentRuntime`へ限定しつつ、旧message dataを保持します。旧dataのexport/backfill、件数照合、retention期間の承認を完了した後だけ、別releaseでunique migration tagの`deleted_classes`とclass export削除を同時に行います。delete migrationはnamespaceと全dataを永久削除し、rollbackやTrashで復元できないため、今回のdeployへ含めません。

`0011_file_activity_backfill`は、migration適用とAPI切替の間に旧Workerがfileを確定・削除するとactivityを復元できないため、compatibility rolloutを要求する既存triggerの1つです。workflowはmigration ledgerが`0010`適用済みかつ`0011`未適用なら、4つのAgent flagを全て`0`に固定し、旧schemaと互換なmaintenance API、remote binding確認、drain、secret inventory barrierを通してからbackfillへ進みます。この節は上記general compatibility rolloutを上書きしません。fresh/片側Worker欠損、旧protocol切替、将来のdestructive migrationも、それぞれの検出条件に該当すれば同じcompatibility順序を優先します。全triggerがないcompatible releaseだけがmigration-first順序を取れます。

## Smoke checklist

- `/health` が200。
- `/ready` が200で、Turso障害時はprivate詳細なしの503になる。
- `/openapi/json` が生成でき、protected routeに `sessionCookie` がある。
- Web custom domainの`/auth/sign-in`が200で、Agent Workerにcustom domain、route、preview URL、`workers.dev`公開がない。
- Browserがcookie認証済み`POST /agent/chat`からprivate Agent runtimeのAI SDK streamを受け取れ、同じconnection ticketのreplay、別Origin、別threadは拒否される。
- Agentから`AGENT_INTERNAL_API` named entrypointのprivate Elysia `/internal/agent/*`でread toolを実行でき、API public custom domainの同pathは404になり、public HTTP fallbackがない。
- `get_issue`がready添付metadataをpageで返し、private Issue画像routeはowner/tenant/形式不一致を同じ404へ丸め、WebP・`private, no-store`だけを返す。canonical traceと3 Workerのtelemetryに画像bytes、base64、private URL、object keyがない。
- 4つのAgent flagがGitHub Environmentと各runtimeで完全一致し、`0`時に該当機能がfail closed、`1`時だけ有効になる。
- magic link / OAuth callbackのredirect originがproduction値。
- 新規userが最初のorganizationを作成できる。
- tenant Aからtenant BのIssueが取得できない。
- tenant Aからtenant Bのfile metadata、preview、downloadが取得できず、membership取消後もcache経由で表示されない。
- 4つの許可幅だけがpreviewでき、original downloadがattachment、Range/conditional response、`nosniff`を満たす。
- user/org profile imageが512x512 WebPとしてprivate R2から配信され、ETag/304、`private, no-cache`、`nosniff`、same-site CORPを満たす。userは円、organizationは角丸四角で表示される。
- memberがorganization設定やrole elevationを実行できない。
- Web asset、R2 cache、3 Workerのlogにsecret、prompt、raw image、filename、object key、provider raw errorが出ていない。
- production remote telemetryが未構成であり、local endpointとrich telemetry envがdeploy設定へ含まれない。
- Cloudflare Emailのmagic link、verification、organization invitationが検証済みsenderから届き、delivery failureがsanitized eventになる。
- test organization削除でtenant rowとactive sessionが即時に消え、jobが残り、cron後に対象R2 prefixだけが削除される。同一key retryは同じreceipt、別keyは404、別organizationへのkey再利用は409になる。

## Observability

Wrangler configのWorkers Observabilityはplatform診断用です。applicationのproduction remote backendは未構成で、local OTLP envを注入しません。運用とredactionの正本は[Observability](./observability.md)です。

## Rollback

- Agent障害: 影響するflagを`0`にし、Agent→API→Webの互換順で再deployして新規run/upload/writeを先に止める。
- code: 依存を外すためWeb→Agent→APIの逆順でCloudflare Workersの直前versionへrollbackする。APIを先に戻して新Agentから旧APIへcallさせない。
- migration: destructive downgrade SQLを即実行しない。forward fixを基本とし、必要ならbackupから別DBへrestoreして切り替える。
- web cache: schema/API incompatibilityがある場合はR2 incremental cache prefixを更新して古いcacheと分離する。
- incident後: audit/log/traceの機密情報を確認し、原因と再発防止を関連repo-local skillへ反映する。
