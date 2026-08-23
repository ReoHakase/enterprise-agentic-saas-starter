---
title: Cloudflare deploymentと運用
status: accepted
implementation: active
last_reviewed: 2026-08-24
---

# Cloudflareデプロイと運用

## 対象

- `apps/web`: OpenNext Cloudflare Worker + Assets + R2 incremental cache
- `apps/api`: Elysia Cloudflare Worker + private R2 file storage + Images binding
- `apps/images`: private image preview Worker + private R2 + Images binding + Workers Caching
- `apps/agent`: private Mastra Worker。model、skills、tools、workflow、AI SDK streamだけを担当し、DB/R2/Authへ直接触れない
- Database: Turso/libSQL（Cloudflare外の唯一のprimary data store）

設定の正本は `apps/web/wrangler.jsonc`、`apps/web/open-next.config.ts`、`apps/api/wrangler.jsonc`、
`apps/images/wrangler.jsonc`、`apps/agent/wrangler.jsonc` です。通信方向はBrowser→Web/API、
API→Images Service Binding、API→Agent named runtime、Agent→API named private `/internal/agent/*`です。
BrowserはImages WorkerとAgent Workerへ直接接続しません。

## 初回provisioning

```sh
bunx wrangler login
bunx wrangler r2 bucket create enterprise-agentic-saas-web-cache
bunx wrangler r2 bucket create enterprise-agentic-saas-attachments
```

worker名とbucket名はstarterからforkした製品固有名へ変更してください。custom domainは同じ親domainの `app.example.com` / `api.example.com` だけに付け、`AUTH_COOKIE_DOMAIN=example.com`のようにこのapplication専用の親domainへ閉じます。GitHub Environmentの`APP_BASE_URL`と`API_PUBLIC_URL`にはpath、query、末尾slashを含まない完全なHTTPS originを設定します。Agent用public originは作りません。

Custom DomainはCloudflare dashboardまたはIaCで初回に登録し、DNSとTLSのactive状態を確認します。deploy workflowは2 originからhostnameを安全に抽出し、Web/API deployへ`--domain`を毎回渡してroute driftを防ぎます。`--strict`でworkflow外のremote変更との競合をsilent overwriteせず停止します。Images WorkerとAgent Workerは`workers_dev=false`、`preview_urls=false`を維持し、route/custom domainを一つも持ちません。既定のworkflowはImagesをAPIより先にdeployし、APIのhealth/readiness/OpenAPIまで確認します。API認可後のprivate preview routeを通す認証付きprovider smokeは自動実行せず、必要な場合だけ別の明示承認済み実入口検査として行います。

Agent Workerの`AGENT_INTERNAL_API`はAPI Worker `enterprise-agentic-saas-api`のnamed `WorkerEntrypoint` `AgentInternalApi`へのService Bindingです。named entrypointの`fetch`内だけでprivate Elysia `/internal/agent/*`を処理し、public API appやOpenAPIへmountしません。AgentはEden custom fetcherからbindingを呼び、public HTTP fallbackを持ちません。逆方向のAPI `AGENT_RUNTIME`はAgent named `AgentRuntime`だけを指します。fork時は両方の`services[].service`と`entrypoint`を同時に変更します。AgentへTurso、R2、Better Auth、Email bindingを渡しません。

`enterprise-agentic-saas-attachments` は物理bucket名だけを互換性のため維持し、Worker bindingは汎用名
`FILES`を使います。bucketはprivateのままにし、public accessと`r2.dev`を有効化しません。API Workerには
Cloudflare Imagesの`IMAGES`とprivate Images Workerへの`IMAGE_PREVIEWS` Service Bindingが必要です。
APIのWorkers Cachingは本番用と互換デプロイ用の両設定で無効にし、Images Workerだけで有効にします。
設定と障害復旧は[認証付きfile storage](./file-storage-r2.md)を参照してください。

Cloudflare dashboardまたはIaCでAPI Workerへ次を設定します。

- vars: `NODE_ENV=production`, `APP_NAME`, `APP_BASE_URL`, `API_PUBLIC_URL`, `BETTER_AUTH_URL`, `AUTH_COOKIE_DOMAIN`, `TRUSTED_ORIGINS`, `CORS_ORIGIN`, `EMAIL_PROVIDER=cloudflare`, `EMAIL_FROM`, `AGENT_ASSET_UPLOAD_ENABLED`
- secrets: `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`

Agent Workerへはvarsとして`AGENT_RUNS_ENABLED`、`AGENT_VISION_ENABLED`、`AGENT_WRITES_ENABLED`、`NODE_ENV=production`、secretとして`OPENROUTER_API_KEY`を設定します。production remote telemetryは未構成です。

Web buildには`API_PUBLIC_URL`と`NEXT_PUBLIC_API_BASE_URL`を同じAPI originとして渡します。`NEXT_PUBLIC_AGENT_BASE_URL`は設定しません。file preview/download/Agent chatはBetter Auth cookieを使うAPI routeなので、Web/APIは同じregistrable domain配下に置き、`AUTH_COOKIE_DOMAIN`、`TRUSTED_ORIGINS`、credential付き`CORS_ORIGIN`を揃えます。R2、Images Worker、Agent専用domainは不要です。

`keep_vars: true`は既存のdashboard varsを残しますが、GitHub ActionsのdeployはreleaseとAgent feature flagを毎回明示します。環境ごとの全設定一覧はIaC/secret managerでも管理し、dashboardだけを唯一の記録にしません。

## preview Workerのキャッシュ境界

`apps/api/wrangler.jsonc`と`apps/api/wrangler.bootstrap.jsonc`は`cache.enabled=false`を明示し、API
Workerの既定入口へ到達するすべてのリクエストでElysia、Better Auth、テナント認可を実行します。認可後
だけprivate Images WorkerをService Bindingで呼び、同WorkerのWorkers Cachingへ変換結果を保存します。
object keyを含まないopaqueな内部URLをcache keyにし、APIでETag、304、ブラウザー向けの
`private, no-cache`を再構築します。

旧API Cache APIの項目は新経路から参照せず、既存TTLで失効させます。通常のデプロイやPRからremote
cacheを削除しません。

## Agent feature flag

次の4値はGitHub `production` Environmentのvarsへ必ず文字列`0`または`1`で登録します。未設定、空文字、`true`、大文字、小数などは許可せず、runtimeでも`1`だけを有効としてfail closedに扱います。

- `AGENT_ASSET_UPLOAD_ENABLED`: APIのchat画像upload
- `AGENT_RUNS_ENABLED`: Agentのmodel run
- `AGENT_VISION_ENABLED`: Agentの画像入力
- `AGENT_WRITES_ENABLED`: AgentのIssue write tool

初回rolloutは全て`0`で4 Workerとbindingをdeployし、API smoke後にasset upload、run、vision、writeの順で段階的に`1`へ進めます。障害時はまず該当flagを`0`に戻して再deployし、データを削除したりsecretを消したりして停止しません。

Issue添付画像toolのrolloutでは、既存環境の`AGENT_VISION_ENABLED`を一時的に`0`へ戻します。DB migrationやpublic file routeは追加せず、添付metadataを返す互換API/Webを先行し、Agent Workerとprivate model routeのsmoke後に`1`へ戻します。`0`の間も`get_issue`の添付metadataは利用でき、画像toolだけを登録しません。

## GitHub Environmentとsecret注入

GitHub `production` Environmentでは、少なくとも次を登録します。

- vars: `APP_NAME`、`APP_BASE_URL`、`API_PUBLIC_URL`、`AUTH_COOKIE_DOMAIN`、`EMAIL_PROVIDER=cloudflare`、`EMAIL_FROM`、4つのAgent flag
- secrets: `BETTER_AUTH_SECRET`、`OAUTH_GITHUB_CLIENT_ID`、`OAUTH_GITHUB_CLIENT_SECRET`、`TURSO_DATABASE_URL`、`TURSO_AUTH_TOKEN`、`OPENROUTER_API_KEY`、`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`

workflowはsecretをjob全体のenvへ置かず、validation、migration、各deployの必要stepだけへ渡します。runtime
secretを持つWeb/API/Agentの3 Workerは`umask 077`で作った一時JSONへ書き、WebのOpenNext経由を含む
`wrangler deploy --secrets-file`でcodeと同じversionへ加算的に注入し、step終了時に必ず削除します。Images
Workerへruntime secretを渡しません。値をCLI引数、`echo`、`GITHUB_OUTPUT`、artifactへ渡しません。
`--secrets-file`に含めなかった既存secretは保持されるため、secret削除は別の明示手順で行います。

production telemetry backendは未構成です。local OTLP endpointと`DEV_*`をproduction deployへ注入しません。

## Fileとorganization削除のR2 cleanup

API Workerのscheduled handlerは`apps/api/wrangler.jsonc`のcron（既定は毎分）で`file_cleanup_jobs`と`organization_deletion_jobs`を処理します。file削除はquota解放、metadata削除、exact-key job、auditを同じtransactionで確定し、R2 objectをbackgroundで冪等削除します。Issue削除はowner prefix、organization削除は`organizations/<encoded organization id>/` prefixを対象にします。job tableは削除済みresourceへの外部keyを持たないため、cleanupを継続できます。

processorはleaseと指数backoffで再試行します。`pending` / retry可能な`failed` / lease切れ`processing`だけをclaimし、成功を`completed`にします。完了/失敗更新はclaim時の`attempts + locked_at`が一致する場合だけ行うため、時間のかかった旧workerがlease再取得後の状態を上書きしません。batch logは`claimed/completed/failed/stale`の件数、失敗eventはattemptと固定error codeだけを記録します。job ID、organization/user ID、slug、email、filename、object keyをproduction logやremote telemetryへ出しません。運用では`failed`件数、`stale`発生、最古job ageを監視し、`FILES` bindingやbucket権限を解消後、次回cronの冪等retryに任せます。

## Cloudflare Email Sending

Email Service > Email Sendingで送信domainをonboardし、SPF、DKIM、DMARCを確認する。`EMAIL_FROM`にはそのdomainの実addressを指定する。Cloudflare DNSを使うことと、利用plan・Beta提供条件をproduction契約前に確認する。

API Workerの`wrangler.jsonc`はstructured Workers API用の`EMAIL` bindingを持つ。starterでは製品の送信addressが未確定なためbinding restrictionを固定していない。fork後は`allowed_sender_addresses`を`EMAIL_FROM`と一致させ、漏洩や実装ミスで別senderを使えないようにする。

local Bun developmentは既定で`EMAIL_PROVIDER=mailpit`を使い、portlessのlocal inboxへ送る。`mailpit`と`console`はproductionでは起動時に拒否する。Cloudflare Worker productionは`EMAIL_PROVIDER=cloudflare`、検証済み`EMAIL_FROM`、`EMAIL` bindingを必須にする。`noop`はtestまたは明示的な配送停止環境だけに使い、magic linkが必要なproductionでは選ばない。

通常の`wrangler dev`はEmail bindingをlocal simulationし、本文をlocal fileへ保存するが実配送しない。bindingへ`remote: true`を一時指定すると実メールを送るため、共通設定へcommitせず、検証済みtest recipientだけで実行する。送信eventにはtemplate、recipient domain、message ID、Cloudflare error code、retryableだけを残し、URL/token/本文/recipient全文を記録しない。

organization invitationはBetter Authの`sendInvitationEmail`コールバックから既存email packageへ渡します。
配送は自動再試行のないbest-effortで、失敗してもinvitation rowは残ります。再送は利用者がBetter Authの
`invite-member`へ`resend: true`を指定したときだけ行います。`invitation_email_jobs`、配送attempt、lease、
scheduled processorは所有しません。provider raw error、invitation/organization/user ID、email、URLを
production logやremote telemetryへ出さず、固定eventだけを記録します。

## Production observability

production remote backendは未構成です。local用`grafana/otel-lgtm`、fixed endpoint、Portless alias、rich content policyをproductionへ持ち込みません。Grafana Cloudまたはself-hosted LGTMを導入するときはretention、tenant isolation、source map、alert、sampling、費用、Cloudflare native exportとの重複防止を別ADRで決めます。詳細は[Observability](./observability.md)を参照してください。

本番では `AUTH_COOKIE_DOMAIN` が必須です。異なる親domainへapp/APIを分離するとcookie sessionが成立しないため、DNS設計を先に確定します。

## Type生成とdry-run

```sh
bun run --cwd apps/api cf:typegen
bun run --cwd apps/images cf:typegen
bun run --cwd apps/agent cf:typegen
bun run --cwd apps/web cf:typegen
bun run build:cloudflare
```

API/Images/Agentの生成後はtrackedな`apps/api/src/cloudflare-env.d.ts`、
`apps/images/src/cloudflare-env.d.ts`、`apps/agent/src/cloudflare-env.d.ts`に差分がないことを確認します。Webの
package commandは`apps/web/cloudflare-env.d.ts`を生成しますが、production workflowではsource treeを
汚さないよう`RUNNER_TEMP`へ生成して成功とnon-emptyを検証します。特にAPIの`IMAGE_PREVIEWS`と
`AGENT_RUNTIME`、Agentの`AGENT_INTERNAL_API`、3つのAgent feature flagがtypeへ反映されない状態でdeploy
しません。

API WorkerはElysia Cloudflare adapter、Images Workerはmodule Worker、WebはOpenNext、AgentはMastraと
Cloudflare named entrypointを使います。Bun/Next buildだけをrelease判定にせず、4 Worker全ての
Cloudflare dry-runを通します。

## Deploy順序

1. Turso backup/restore pointを確認する。
2. public routeを持たないImages Workerをdeployし、APIが参照するService Binding targetを先に確定する。
3. workflowがAPI/Agent WorkerとAPI/Agentのcross-database secret inventoryをread-only確認する。stale secret、片側Worker欠損、または明示した旧protocol切替が1つでもあればWorkerのcompatibility rolloutを必須にする。データベースのマイグレーション名や適用履歴からこの判定を行わない。
4. 4つのAgent flagが全て`0`であることを確認し、`apps/api/wrangler.bootstrap.jsonc`で`IMAGE_PREVIEWS`を維持しつつ`AGENT_RUNTIME`だけを持たないAPIを`AGENT_MAINTENANCE_MODE=1`としてdeployする。maintenance中はpublic `/agent`、Agent thread/asset file route、named `AgentInternalApi`、scheduled jobを503または停止状態へ閉じる。
5. API health/readiness/OpenAPIとmaintenance smokeを通し、Cloudflare Worker settingsのremote inventoryで`IMAGE_PREVIEWS`が期待するprivate Workerを指し、`AGENT_RUNTIME`が存在せず、`AGENT_MAINTENANCE_MODE`がplain textの`1`であることを確認する。
6. Application DBの1つのaggregate queryでDB clock、live connection/resume ticket、unrevoked grant、`running` / `waiting_approval` runを同時に取得する。最大capability lifetimeを含むbounded deadline内で全件0がgrace window中継続するまでpollingし、途中で1件でも再発したらzero windowを最初から数え直す。partial schema、timeout、query errorでは停止する。
7. 初回inventoryで検出した禁止secretだけをAPI/Agent Workerからexact nameで削除する。削除直前に再inventoryし、初回がcleanだったWorkerへ新たな禁止secretが現れた場合は削除せず停止する。Workerごとの削除と確認を終えた後、migration直前にAPI/Agentのfresh inventoryを全件取り直し、初回後の新規禁止secretと禁止secret残存がどちらもないことを再検査する。
8. production migrationを1回だけ適用し、Agent WorkerをdeployしてAPI named entrypointへのService Binding解決を確認する。
9. final API Workerを`AGENT_RUNTIME` binding付き、`AGENT_MAINTENANCE_MODE=0`でdeployし、health/readiness/OpenAPIを自動smokeする。Cloudflare Worker settingsのremote inventoryでも`IMAGE_PREVIEWS`とAgent bindingの存在、maintenance解除を確認する。
10. Web Workerをbuildしてからdeployし、custom domainのsign-in pageを自動smokeする。
11. sign-in/org/Issue/API→Mastra stream/Agent→private `/internal/*` journeyを認証付きE2Eで確認する。

Workerのcompatibility rolloutはremote inventory、maintenance smoke、drainを伴うため、上記を手動commandへ分解せず`Deploy production` workflowを使います。Workerのbootstrapもstale secretも必要ないreleaseだけがmigration-first順序を取れます。

これは順序の概要です。Service Bindingはtarget Workerが先に存在する必要があるため、Images Workerを
APIより先に置きます。Agentの相互bindingを切り替えるcompatibility rolloutでは、bootstrap APIから
`AGENT_RUNTIME`だけを外し、独立した`IMAGE_PREVIEWS`は維持します。Workerの存在だけではprotocol互換性や
traffic停止を証明できません。remote settings inventory、実API maintenance smoke、Application DBの連続
zero windowを全て通してからsecret削除とdestructive migrationへ進みます。旧Agents SDKからの初回切替は
4 Agent flagを全て`0`にし、`force_agent_protocol_bootstrap=true`を選びます。workflowはこのinput時にflagが
1つでも`0`以外なら停止します。`apps/api/wrangler.bootstrap.jsonc`はfinal configから`AGENT_RUNTIME`だけを
除いた内容とし、この差分はunit contract testで固定します。Cloudflareのauth failure、network error、
429、5xxをWorker不存在と推測せず停止します。runtime secretをCLI引数へ渡さず、flagは検証済みのGitHub
Environment varsから渡し、実際のproduction deployは`Deploy production` workflowだけから実行します。
workflowは`production` Environmentのapprovalとconcurrency lock付きで進め、どのdeploy、inventory、drain、
または自動smokeで失敗しても後続の破壊的操作へ進みません。

Agent Workerの`exports`には旧`IssueAssistant` namespaceを永久削除する一時的な`deleted` tombstoneが
あります。この変更では旧メッセージの書き出し、バックアップ、既存データ補完を行いません。本番
バンドルから対象`class`が消えていることと、同一Cloudflareアカウントの他Workerから対象namespaceへの
`binding`が0件であることをデプロイ直前に再取得します。個別に明示承認された`Deploy production`だけで
適用し、Wranglerのreconciliation出力でnamespace削除とtombstoneの除去可能状態を確認します。削除済み
namespaceはロールバックやTrashから復元できません。reconciliation完了後は#52でtombstoneとこの説明を
除去します。

## Smoke checklist

- `/health` が200。
- `/ready` が200で、Turso障害時はprivate詳細なしの503になる。
- `/openapi/json` が生成でき、protected routeに `sessionCookie` がある。
- Web custom domainの`/auth/sign-in`が200で、Agent Workerにcustom domain、route、preview URL、`workers.dev`公開がない。
- Browserがcookie認証済み`POST /agent/chat`からprivate Agent runtimeのAI SDK streamを受け取れ、同じconnection ticketのreplay、別Origin、別threadは拒否される。
- Agentから`AGENT_INTERNAL_API` named entrypointのprivate Elysia `/internal/agent/*`でread toolを実行でき、API public custom domainの同pathは404になり、public HTTP fallbackがない。
- `get_issue`がready添付metadataをpageで返し、private Issue画像routeはowner/tenant/形式不一致を同じ404へ丸め、WebP・`private, no-store`だけを返す。canonical traceと4 Workerのtelemetryに画像bytes、base64、private URL、object keyがない。
- 4つのAgent flagがGitHub Environmentと各runtimeで完全一致し、`0`時に該当機能がfail closed、`1`時だけ有効になる。
- magic link / OAuth callbackのredirect originがproduction値。
- 新規userが最初のorganizationを作成できる。
- tenant Aからtenant BのIssueが取得できない。
- 同じURLを反復しても未認証、別テナント、組織への所属取消後のリクエストでAPIハンドラーと認可が毎回実行され、別テナントのfile metadata、preview、downloadがキャッシュ経由で表示されない。
- 4つの許可幅だけがpreviewでき、original downloadがattachment、Range/conditional response、`nosniff`を満たす。
- user/org profile imageが512x512 WebPとしてprivate R2から配信され、ETag/304、`private, no-cache`、`nosniff`、same-site CORPを満たす。userは円、organizationは角丸四角で表示される。
- memberがorganization設定やrole elevationを実行できない。
- Web asset、R2 cache、4 Workerのlogにsecret、prompt、raw image、filename、object key、provider raw errorが出ていない。
- production remote telemetryが未構成であり、local endpointとrich telemetry envがdeploy設定へ含まれない。
- Cloudflare Emailのmagic link、verification、organization invitationが検証済みsenderから届き、delivery failureがsanitized eventになる。
- test organization削除でtenant rowとactive sessionが即時に消え、jobが残り、cron後に対象R2 prefixだけが削除される。同一key retryは同じreceipt、別keyは404、別organizationへのkey再利用は409になる。

## Observability

Wrangler configのWorkers Observabilityはplatform診断用です。applicationのproduction remote backendは未構成で、local OTLP envを注入しません。運用とredactionの正本は[Observability](./observability.md)です。

## Rollback

- Agent障害: 影響するflagを`0`にし、Agent→API→Webの互換順で再deployして新規run/upload/writeを先に止める。
- Images障害: `IMAGE_PREVIEWS` targetを残したままprotocol互換なImages versionへ戻す。Images Worker自体を廃止するrollbackでは、先に`IMAGE_PREVIEWS`へ依存しないAPI versionをdeployし、bindingを外したことをremote inventoryで確認してからImages Workerを除去する。
- code: 依存を外すためWeb→Agent→APIの逆順でCloudflare Workersの直前versionへrollbackする。APIを先に戻して新Agentから旧APIへcallさせない。
- migration: destructive downgrade SQLを即実行しない。forward fixを基本とし、必要ならbackupから別DBへrestoreして切り替える。
- web cache: schema/API incompatibilityがある場合はR2 incremental cache prefixを更新して古いcacheと分離する。
- incident後: audit/log/traceの機密情報を確認し、原因と再発防止を関連repo-local skillへ反映する。
