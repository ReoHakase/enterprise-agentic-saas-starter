# Cloudflareデプロイと運用

## 対象

- `apps/web`: OpenNext Cloudflare Worker + Assets + R2 incremental cache
- `apps/api`: Elysia Cloudflare Worker + private R2 file storage + Images binding
- `apps/agent`: Cloudflare Agents SDK Worker + Durable Object。model実行とAgent protocolだけを担当し、DB/R2/Authへ直接触れない
- Database: Turso/libSQL（Cloudflare外の唯一のprimary data store）

設定の正本は `apps/web/wrangler.jsonc`、`apps/web/open-next.config.ts`、`apps/api/wrangler.jsonc`、`apps/agent/wrangler.jsonc` です。通信方向はBrowser→Web/API/Agent、Agent→APIだけとし、API→AgentのService Bindingや循環callを作りません。

## 初回provisioning

```sh
bunx wrangler login
bunx wrangler r2 bucket create enterprise-agentic-saas-web-cache
bunx wrangler r2 bucket create enterprise-agentic-saas-attachments
```

worker名とbucket名はstarterからforkした製品固有名へ変更してください。custom domainは同じ親domainの `app.example.com` / `api.example.com` / `agent.example.com` を使い、`AUTH_COOKIE_DOMAIN=example.com`のようにこのapplication専用の親domainへ閉じます。GitHub Environmentの`APP_BASE_URL`、`API_PUBLIC_URL`、`AGENT_PUBLIC_URL`にはpath、query、末尾slashを含まない完全なHTTPS originを設定します。workflowは3 hostnameが`AUTH_COOKIE_DOMAIN`自身またはそのsubdomainであることも検証します。

Custom DomainはCloudflare dashboardまたはIaCで初回に登録し、DNSとTLSのactive状態を確認します。deploy workflowも3 originからhostnameを安全に抽出し、各Wrangler deployへ`--domain`を毎回渡してroute driftを防ぎます。`--strict`でworkflow外のremote変更との競合をsilent overwriteせず停止します。Agent Workerは`workers_dev=false`かつ`preview_urls=false`を維持し、Agent protocol routeだけをcustom domainへ公開します。workflowは`*.workers.dev`をproduction URLとして拒否し、APIとAgentは各deploy直後、Webはdeploy完了後にcustom domainをsmokeします。Web/APIもcustom domain付きdeployにより不要な`workers.dev`公開へ依存しません。

Agent Workerの`AGENT_INTERNAL_API`はAPI Worker `enterprise-agentic-saas-api`のnamed `WorkerEntrypoint` `AgentInternalApi`へのService Bindingです。bindingはpublic URLを経由せず、Agent側の`wrangler.jsonc`だけに定義します。fork時にAPI Worker名を変更したら`services[].service`も同時に変更し、APIを先にdeployしてからAgentをdeployします。AgentへTurso、R2、Better Auth、Email bindingを渡しません。

`enterprise-agentic-saas-attachments` は物理bucket名だけを互換性のため維持し、Worker bindingは汎用名`FILES`を使います。bucketはprivateのままにし、public accessと`r2.dev`を有効化しません。API WorkerにはCloudflare Imagesの`IMAGES` bindingとWorkers Cacheも必要です。設定と障害復旧は[認証付きfile storage](./file-storage-r2.md)を参照してください。

Cloudflare dashboardまたはIaCでAPI Workerへ次を設定します。

- vars: `NODE_ENV=production`, `APP_NAME`, `APP_BASE_URL`, `API_PUBLIC_URL`, `BETTER_AUTH_URL`, `AUTH_COOKIE_DOMAIN`, `TRUSTED_ORIGINS`, `CORS_ORIGIN`, `EMAIL_PROVIDER=cloudflare`, `EMAIL_FROM`, `AGENT_ASSET_UPLOAD_ENABLED`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, sampling rate
- secrets: `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SENTRY_DSN`

Agent Workerへはvarsとして`WEB_ORIGIN`、`AGENT_RUNS_ENABLED`、`AGENT_VISION_ENABLED`、`AGENT_WRITES_ENABLED`、`NODE_ENV=production`、`SENTRY_ENVIRONMENT`、`SENTRY_RELEASE`、secretsとして`OPENROUTER_API_KEY`とAgent専用`SENTRY_DSN`を設定します。`WEB_ORIGIN`は`APP_BASE_URL`と完全一致させます。

Web buildには`API_PUBLIC_URL`と`NEXT_PUBLIC_API_BASE_URL`を同じAPI origin、`NEXT_PUBLIC_AGENT_BASE_URL`をAgent originとして渡します。file preview/downloadもBetter Auth cookieを使うため、Web/APIは同じregistrable domain配下に置き、`AUTH_COOKIE_DOMAIN`、`TRUSTED_ORIGINS`、credential付き`CORS_ORIGIN`を揃えます。Agent接続はAPIのone-time ticketを使うためcookieを共有しません。R2またはImages専用domainは不要です。

`keep_vars: true`は既存のdashboard varsを残しますが、GitHub ActionsのdeployはreleaseとAgent feature flagを毎回明示します。環境ごとの全設定一覧はIaC/secret managerでも管理し、dashboardだけを唯一の記録にしません。

## Agent feature flag

次の4値はGitHub `production` Environmentのvarsへ必ず文字列`0`または`1`で登録します。未設定、空文字、`true`、大文字、小数などは許可せず、runtimeでも`1`だけを有効としてfail closedに扱います。

- `AGENT_ASSET_UPLOAD_ENABLED`: APIのchat画像upload
- `AGENT_RUNS_ENABLED`: Agentのmodel run
- `AGENT_VISION_ENABLED`: Agentの画像入力
- `AGENT_WRITES_ENABLED`: AgentのIssue write tool

初回rolloutは全て`0`で3 Workerとbindingをdeployし、API smoke後にasset upload、run、vision、writeの順で段階的に`1`へ進めます。`0011_file_activity_backfill`の互換deployが必要な場合も、migration完了までは4値を全て`0`に固定し、workflowは1つでも`1`ならWorkerを変更する前に停止します。障害時はまず該当flagを`0`に戻して再deployし、データを削除したりsecretを消したりして停止しません。

## GitHub Environmentとsecret注入

GitHub `production` Environmentでは、少なくとも次を登録します。

- vars: `APP_NAME`、`APP_BASE_URL`、`API_PUBLIC_URL`、`AGENT_PUBLIC_URL`、`AUTH_COOKIE_DOMAIN`、`EMAIL_PROVIDER=cloudflare`、`EMAIL_FROM`、4つのAgent flag、`SENTRY_ORG`、`SENTRY_API_PROJECT`、`SENTRY_AGENT_PROJECT`、`SENTRY_WEB_PROJECT`
- secrets: `BETTER_AUTH_SECRET`、`OAUTH_GITHUB_CLIENT_ID`、`OAUTH_GITHUB_CLIENT_SECRET`、`TURSO_DATABASE_URL`、`TURSO_AUTH_TOKEN`、`OPENROUTER_API_KEY`、`SENTRY_API_DSN`、`SENTRY_AGENT_DSN`、`SENTRY_WEB_DSN`、`SENTRY_AUTH_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`

workflowはsecretをjob全体のenvへ置かず、validation、migration、各deployの必要stepだけへ渡します。3 Workerとも`umask 077`で作った一時JSONへruntime secretを書き、WebのOpenNext経由を含む`wrangler deploy --secrets-file`でcodeと同じversionへ加算的に注入し、step終了時に必ず削除します。値をCLI引数、`echo`、`GITHUB_OUTPUT`、artifactへ渡しません。`--secrets-file`に含めなかった既存secretは保持されるため、secret削除は別の明示手順で行います。

workflowはcommit SHAを3 Worker共通の`SENTRY_RELEASE`に使います。API/Agent/Web server runtimeのDSNはdeploy versionへsecretとして注入し、Web buildには公開可能なbrowser用`NEXT_PUBLIC_SENTRY_DSN`として同じWeb project値を渡します。`SENTRY_AUTH_TOKEN`はmigration前のpreflight validationとsource map upload stepだけで使い、Worker runtimeへ保存しません。

## Fileとorganization削除のR2 cleanup

API Workerのscheduled handlerは`apps/api/wrangler.jsonc`のcron（既定は毎分）で`file_cleanup_jobs`と`organization_deletion_jobs`を処理します。file削除はquota解放、metadata削除、exact-key job、auditを同じtransactionで確定し、R2 objectをbackgroundで冪等削除します。Issue削除はowner prefix、organization削除は`organizations/<encoded organization id>/` prefixを対象にします。job tableは削除済みresourceへの外部keyを持たないため、cleanupを継続できます。

processorはleaseと指数backoffで再試行します。`pending` / retry可能な`failed` / lease切れ`processing`だけをclaimし、成功を`completed`にします。完了/失敗更新はclaim時の`attempts + locked_at`が一致する場合だけ行うため、時間のかかった旧workerがlease再取得後の状態を上書きしません。batch logは`claimed/completed/failed/stale`の件数、失敗eventはattemptと固定error codeだけを記録します。job ID、organization/user ID、slug、email、filename、object keyをconsoleやSentryへ出しません。運用では`failed`件数、`stale`発生、最古job ageを監視し、`FILES` bindingやbucket権限を解消後、次回cronの冪等retryに任せます。

## Cloudflare Email Sending

Email Service > Email Sendingで送信domainをonboardし、SPF、DKIM、DMARCを確認する。`EMAIL_FROM`にはそのdomainの実addressを指定する。Cloudflare DNSを使うことと、利用plan・Beta提供条件をproduction契約前に確認する。

API Workerの`wrangler.jsonc`はstructured Workers API用の`EMAIL` bindingを持つ。starterでは製品の送信addressが未確定なためbinding restrictionを固定していない。fork後は`allowed_sender_addresses`を`EMAIL_FROM`と一致させ、漏洩や実装ミスで別senderを使えないようにする。

local Bun developmentは既定で`EMAIL_PROVIDER=mailpit`を使い、portlessのlocal inboxへ送る。`mailpit`と`console`はproductionでは起動時に拒否する。Cloudflare Worker productionは`EMAIL_PROVIDER=cloudflare`、検証済み`EMAIL_FROM`、`EMAIL` bindingを必須にする。`noop`はtestまたは明示的な配送停止環境だけに使い、magic linkが必要なproductionでは選ばない。

通常の`wrangler dev`はEmail bindingをlocal simulationし、本文をlocal fileへ保存するが実配送しない。bindingへ`remote: true`を一時指定すると実メールを送るため、共通設定へcommitせず、検証済みtest recipientだけで実行する。送信eventにはtemplate、recipient domain、message ID、Cloudflare error code、retryableだけを残し、URL/token/本文/recipient全文を記録しない。

organization invitationは`invitation_email_jobs`から配送します。jobはrecipient、token、URL、organization/user IDを持たず、送信時にinvitation・organization・inviterをjoinします。API request後の`waitUntil`と毎分scheduled handlerは同じprocessorを呼び、1回25件、5分lease、30秒から最大1時間の指数backoffで処理します。`attempts + locked_at`をfencing tokenにするため、lease切れ後の旧workerは新しい結果を上書きできません。

招待再送/期限切れ復活ではinvitationごとに一意な同じjobを`pending`へ戻し、error、lock、next attempt、completed時刻をclearします。`attempts`はresetせず単調増加させるため、再送直前まで動いていた旧workerの完了/失敗更新はfencing条件に一致せずstaleになります。job欠損時だけ同じtransactionで再作成します。

監視対象はbatchの`claimed/completed/failed/canceled/stale`件数、失敗時のattempt・固定error code・retryableだけです。job/invitation/organization/user ID、email、URL、provider raw errorをlog/Sentryへ出しません。`failed`増加、`stale`、最古pending ageをalertにし、bindingやsender domainを修復後はcronの再試行へ任せます。provider受付とjob完了の間でWorkerが停止すると重複配送の可能性が残るため、運用上はat-least-onceとして扱います。

## Sentry

Web、API、Agentに別projectを作り、projectごとにDSNを設定します。Web browserは`NEXT_PUBLIC_SENTRY_DSN`、Web server/API/Agentは各Workerの`SENTRY_DSN`を使います。同じcommit SHAを3 projectの`SENTRY_RELEASE`、deploy先を`SENTRY_ENVIRONMENT`へ設定し、browser→APIとAgent→APIのtrace境界を確認します。

source mapは実際にdeployするartifactと一致させます。

- API: Wrangler dry-runでbundle/mapを生成し、Sentry CLIでdebug IDをinject・uploadしてから同じ`dist/worker/worker.js`を`--no-bundle`でdeployする
- Agent: APIと同様に`apps/agent/dist/worker`へdebug IDをinject・Agent projectへuploadし、同じartifactを`--no-bundle`でdeployする
- Web: `opennextjs-cloudflare build`中のSentry Next.js pluginでuploadを完了してから、生成済み`.open-next`を`opennextjs-cloudflare deploy`する。buildを省略してdeployしない

preflight validationとsource map uploadを行うstepだけに`SENTRY_AUTH_TOKEN`を渡し、対象serviceの`SENTRY_PROJECT`はupload stepだけへ渡します。非secretの`SENTRY_ORG`とservice別project名はGitHub Environment varsとして検証します。auth tokenはWorker runtimeへ配置せず、public DSN以外の値へ`NEXT_PUBLIC_`を付けません。Wranglerの`upload_source_maps=true`はCloudflare側でstackを復号するためにも維持しますが、Sentry側のartifact uploadを代替しません。Sentry uploadが失敗したartifactはdeployせず、deploy後は3 projectのtest eventでrelease、debug ID、元sourceのfile/lineを確認します。

application error/log/traceはSentry SDKから直接送る。Cloudflare Workers Observabilityはplatform metricsとCloudflare側の調査用に残すが、同じWorkerへSentry OTLP log/trace destinationを追加すると二重計上になるため、この構成と併用しない。切り替える場合はrelease単位で送信経路を一つにし、dashboard/event countを検証する。

初期samplingはproduction error 100%、trace 10%、Spotlight 100%。trafficと契約量に応じてenvで変更します。Sentry Uptime monitorはAPIの`/health`（Worker liveness）、`/ready`（Tursoを含むreadiness）、Web公開URLを別々に作ります。Agentは通常HTTP health routeを公開しないため、custom domainのHTTP rejectionだけを外形監視にし、実ticketを使うWebSocket smokeをrelease checklistで行います。5xx/error rate、p95/p99 duration、Turso latency、auth/permission failure、Agent provider failure、`email_failed`、R2 cleanup failure/backlogのmetric monitorを追加します。Monitorからproduction用Alertへ接続し、Slackとemailのtest notificationを実行します。詳細は [Observability](./observability.md) を参照してください。

本番では `AUTH_COOKIE_DOMAIN` が必須です。異なる親domainへapp/APIを分離するとcookie sessionが成立しないため、DNS設計を先に確定します。

## Type生成とdry-run

```sh
bun run --cwd apps/api cf:typegen
bun run --cwd apps/agent cf:typegen
bun run --cwd apps/web cf:typegen
bun run build:cloudflare
```

API/Agentの生成後はtrackedな`apps/api/src/cloudflare-env.d.ts`と`apps/agent/src/cloudflare-env.d.ts`に差分がないことを確認します。Webのpackage commandは`apps/web/cloudflare-env.d.ts`を生成しますが、production workflowではsource treeを汚さないよう`RUNNER_TEMP`へ生成して成功とnon-emptyを検証します。特にAgentの`AGENT_INTERNAL_API`、Durable Object、3つのfeature flagがtypeへ反映されない状態でdeployしません。

API WorkerはElysia Cloudflare adapter、WebはOpenNext、AgentはAgents SDKとDurable Objectを使います。Bun/Next buildだけをrelease判定にせず、3 Worker全てのCloudflare dry-runを通します。

## Deploy順序

1. Turso backup/restore pointを確認する。
2. production migrationを1回だけ適用する。
3. API Workerをdeployし、custom domainのhealth/readiness/OpenAPIを自動smokeする。失敗時はAgentを変更しない。
4. Agent Workerをdeployする。APIのnamed entrypointまたはService Bindingを解決できなければdeployで停止し、custom domainのHTTP rejection smokeに失敗した場合もWebを変更しない。
5. Web Workerをbuildしてからdeployし、custom domainのsign-in pageを自動smokeする。
6. sign-in/org/Issue/Agent WebSocket journeyをrelease checklistとして手動または認証付きE2Eで確認する。

```sh
bun run --cwd packages/db db:migrate
bun run --cwd apps/api deploy
bun run --cwd apps/agent deploy
bun run --cwd apps/web build:cloudflare
bun run --cwd apps/web deploy
```

これは順序の概要です。runtime secretをCLI引数へ渡さず、flagは検証済みのGitHub Environment varsから渡し、実際のproduction deployは`Deploy production` workflowだけから実行します。workflowは`production` Environmentのapprovalとconcurrency lock付きでAPI→API smoke→Agent→Agent smoke→Web→Web smokeを直列に実行し、どのdeployまたは自動smokeで失敗しても後続Workerを変更しません。

`0011_file_activity_backfill`だけは、migration適用とAPI切替の間に旧Workerがfileを確定・削除するとactivityを復元できないdata migrationです。workflowはmigration ledgerが`0010`適用済みかつ`0011`未適用の環境だけを検出し、既存schemaと互換な新APIを先にdeployします。このpredeployでは4つのAgent flagを全て`0`に固定し、旧schemaのままAPI smokeを通してからbackfillへ進みます。migration後のAPI smokeが完了するまでAgent/Webを変更しません。fresh環境、`0011`適用済み環境、今後の通常migrationではmigration-first順序を維持します。この互換deployを手動運用で省略せず、file writeを止めないままone-shot SQLだけを先行適用しないでください。

## Smoke checklist

- `/health` が200。
- `/ready` が200で、Turso障害時はprivate詳細なしの503になる。
- `/openapi/json` が生成でき、protected routeに `sessionCookie` がある。
- Web custom domainの`/auth/sign-in`が200、Agent custom domainへの通常HTTP GETが426で拒否され、production URLが`*.workers.dev`でない。
- Web UIで発行した一回限りticketからAgent WebSocketへ接続でき、同じticketのreplay、別Origin、別threadは拒否される。
- Agentから`AGENT_INTERNAL_API`のnamed RPCでread toolを実行でき、API public URLへの内部HTTP fallbackやAPI→Agent bindingがない。
- 4つのAgent flagがGitHub Environmentと各runtimeで完全一致し、`0`時に該当機能がfail closed、`1`時だけ有効になる。
- magic link / OAuth callbackのredirect originがproduction値。
- 新規userが最初のorganizationを作成できる。
- tenant Aからtenant BのIssueが取得できない。
- tenant Aからtenant Bのfile metadata、preview、downloadが取得できず、membership取消後もcache経由で表示されない。
- 4つの許可幅だけがpreviewでき、original downloadがattachment、Range/conditional response、`nosniff`を満たす。
- user/org profile imageが512x512 WebPとしてprivate R2から配信され、ETag/304、`private, no-cache`、`nosniff`、same-site CORPを満たす。userは円、organizationは角丸四角で表示される。
- memberがorganization設定やrole elevationを実行できない。
- Web asset、Durable Object、R2 cache、3 Workerのlogにsecret、prompt、raw image、filename、object key、provider raw errorが出ていない。
- 3 Sentry projectで同じreleaseとsource mapが成立し、Web→APIとAgent→APIのtraceを確認でき、event/logにPII、tenant ID、ticket、grant、tokenがない。
- Sentry Uptime monitorとSlack/email notificationのtestが成功する。
- Cloudflare Emailのmagic link、verification、organization invitationが検証済みsenderから届き、delivery failureがsanitized eventになる。
- test organization削除でtenant rowとactive sessionが即時に消え、jobが残り、cron後に対象R2 prefixだけが削除される。同一key retryは同じreceipt、別keyは404、別organizationへのkey再利用は409になる。

## Observability

Wrangler configでWorkers Observabilityを有効にし、application telemetryはSentryへ集約する。相関にはrequest ID、正規化route、status、duration、releaseを使い、session cookie、token、magic link、raw body、email、tenant/user/resource IDをlogへ出さない。運用とredactionの正本は [Observability](./observability.md)。

## Rollback

- Agent障害: 影響するflagを`0`にしてAPI→Agent→Web順に再deployし、新規run/upload/writeを先に止める。
- code: 依存を外すためWeb→Agent→APIの逆順でCloudflare Workersの直前versionへrollbackする。APIを先に戻して新Agentから旧APIへcallさせない。
- migration: destructive downgrade SQLを即実行しない。forward fixを基本とし、必要ならbackupから別DBへrestoreして切り替える。
- web cache: schema/API incompatibilityがある場合はR2 incremental cache prefixを更新して古いcacheと分離する。
- incident後: audit/log/traceの機密情報を確認し、原因と再発防止を関連repo-local skillへ反映する。
