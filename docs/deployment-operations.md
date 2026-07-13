# Cloudflareデプロイと運用

## 対象

- `apps/web`: OpenNext Cloudflare Worker + Assets + R2 incremental cache
- `apps/api`: Elysia Cloudflare Worker + 将来の添付機能用R2予約binding
- Database: Turso/libSQL（Cloudflare外の唯一のprimary data store）

設定の正本は `apps/web/wrangler.jsonc`、`apps/web/open-next.config.ts`、`apps/api/wrangler.jsonc` です。

## 初回provisioning

```sh
bunx wrangler login
bunx wrangler r2 bucket create enterprise-agentic-saas-web-cache
bunx wrangler r2 bucket create enterprise-agentic-saas-attachments
```

worker名とbucket名はstarterからforkした製品固有名へ変更してください。custom domainは同じ親domainの `app.example.com` / `api.example.com` を推奨します。

`enterprise-agentic-saas-attachments` は将来の添付機能用にbindingだけを予約しています。現時点ではupload/download endpointやstorage moduleを提供しないため、不要ならbindingとbucket作成を削除してください。

Cloudflare dashboardまたはIaCでAPI Workerへ次を設定します。

- vars: `NODE_ENV=production`, `APP_NAME`, `APP_BASE_URL`, `API_PUBLIC_URL`, `BETTER_AUTH_URL`, `AUTH_COOKIE_DOMAIN`, `TRUSTED_ORIGINS`, `CORS_ORIGIN`, `EMAIL_PROVIDER=cloudflare`, `EMAIL_FROM`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, sampling rate
- secrets: `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SENTRY_DSN`

Web buildには `API_PUBLIC_URL` と `NEXT_PUBLIC_API_BASE_URL` を同じAPI originで渡します。`keep_vars: true` によりdashboard管理値を通常deployで消さない構成ですが、環境ごとの設定一覧は別途IaC/secret managerで管理してください。

GitHub `production` Environmentでは、少なくともvarsに`APP_NAME`、`APP_BASE_URL`、`API_PUBLIC_URL`、`AUTH_COOKIE_DOMAIN`、`EMAIL_PROVIDER=cloudflare`、`EMAIL_FROM`、`SENTRY_ORG`、`SENTRY_API_PROJECT`、`SENTRY_WEB_PROJECT`、secretsに`SENTRY_API_DSN`、`SENTRY_WEB_DSN`、`SENTRY_AUTH_TOKEN`と既存のBetter Auth/Turso/Cloudflare credentialを登録する。workflowはcommit SHAを両serviceの`SENTRY_RELEASE`へ使う。各Worker runtime側の`SENTRY_DSN` secretもprojectごとに別値で事前登録する。

## Cloudflare Email Sending

Email Service > Email Sendingで送信domainをonboardし、SPF、DKIM、DMARCを確認する。`EMAIL_FROM`にはそのdomainの実addressを指定する。Cloudflare DNSを使うことと、利用plan・Beta提供条件をproduction契約前に確認する。

API Workerの`wrangler.jsonc`はstructured Workers API用の`EMAIL` bindingを持つ。starterでは製品の送信addressが未確定なためbinding restrictionを固定していない。fork後は`allowed_sender_addresses`を`EMAIL_FROM`と一致させ、漏洩や実装ミスで別senderを使えないようにする。

`EMAIL_PROVIDER=console`はlocal Bun development専用で、productionでは起動時に拒否する。Cloudflare Worker productionは`EMAIL_PROVIDER=cloudflare`、検証済み`EMAIL_FROM`、`EMAIL` bindingを必須にする。`noop`はtestまたは明示的な配送停止環境だけに使い、magic linkが必要なproductionでは選ばない。

通常の`wrangler dev`はEmail bindingをlocal simulationし、本文をlocal fileへ保存するが実配送しない。bindingへ`remote: true`を一時指定すると実メールを送るため、共通設定へcommitせず、検証済みtest recipientだけで実行する。送信eventにはtemplate、recipient domain、message ID、Cloudflare error code、retryableだけを残し、URL/token/本文/recipient全文を記録しない。

## Sentry

WebとAPIに別projectを作り、projectごとにDSNを設定する。Web browserは`NEXT_PUBLIC_SENTRY_DSN`、Web server/APIは`SENTRY_DSN`を使う。同じcommit SHAを`SENTRY_RELEASE`、deploy先を`SENTRY_ENVIRONMENT`へ設定し、browserからAPIへのdistributed traceをつなぐ。

Next buildとAPI source map uploadを行うdeploy jobだけに`SENTRY_AUTH_TOKEN`、`SENTRY_ORG`、対象serviceの`SENTRY_PROJECT`を渡す。auth tokenはWorker runtimeへ配置しない。public DSN以外のsecretへ`NEXT_PUBLIC_`を付けない。APIはWranglerでbundle/mapを生成し、Sentry CLIでdebug IDを注入・uploadしてから、その同一bundleを`--no-bundle`でdeployする。Cloudflareの`upload_source_maps`だけではSentry側のartifact uploadを代替しない。deploy後は両projectのtest errorでframeが元sourceへ解決できることを確認する。

application error/log/traceはSentry SDKから直接送る。Cloudflare Workers Observabilityはplatform metricsとCloudflare側の調査用に残すが、同じWorkerへSentry OTLP log/trace destinationを追加すると二重計上になるため、この構成と併用しない。切り替える場合はrelease単位で送信経路を一つにし、dashboard/event countを検証する。

初期samplingはproduction error 100%、trace 10%、Spotlight 100%。trafficと契約量に応じてenvで変更する。Sentry Uptime monitorはAPIの`/health`とWeb公開URLを別々に作り、5xx/error rate、p95/p99 duration、Turso latency、auth/permission failure、`email_failed`のmetric monitorを追加する。Monitorからproduction用Alertへ接続し、Slackとemailのtest notificationを実行する。詳細は [Observability](./observability.md) を参照する。

本番では `AUTH_COOKIE_DOMAIN` が必須です。異なる親domainへapp/APIを分離するとcookie sessionが成立しないため、DNS設計を先に確定します。

## Type生成とdry-run

```sh
bun run --cwd apps/api cf:typegen
bun run --cwd apps/web cf:typegen
bun run build:cloudflare
```

API WorkerはElysia Cloudflare adapterを使います。adapterがexperimentalであることを前提に、Bun entrypointだけのtestでrelease判定しません。

## Deploy順序

1. Turso backup/restore pointを確認する。
2. production migrationを1回だけ適用する。
3. API Workerをdeployし、health/OpenAPI/authをsmoke testする。
4. Web Workerをdeployし、sign-in/org/Issue journeyをsmoke testする。

```sh
bun run --cwd packages/db db:migrate
bun run --cwd apps/api deploy
bun run --cwd apps/web deploy
```

GitHub Actionsの `Deploy production` workflowは同じ順序を `production` environmentのapprovalとconcurrency lock付きで実行します。

## Smoke checklist

- `/health` が200。
- `/openapi/json` が生成でき、protected routeに `sessionCookie` がある。
- magic link / OAuth callbackのredirect originがproduction値。
- 新規userが最初のorganizationを作成できる。
- tenant Aからtenant BのIssueが取得できない。
- memberがorganization設定やrole elevationを実行できない。
- web asset、R2 cache、API logにsecretが出ていない。
- Sentry release/source mapとWeb/API trace propagationが成立し、event/logにPII、tenant ID、tokenがない。
- Sentry Uptime monitorとSlack/email notificationのtestが成功する。
- Cloudflare Emailのmagic link、verification、organization invitationが検証済みsenderから届き、delivery failureがsanitized eventになる。

## Observability

Wrangler configでWorkers Observabilityを有効にし、application telemetryはSentryへ集約する。相関にはrequest ID、正規化route、status、duration、releaseを使い、session cookie、token、magic link、raw body、email、tenant/user/resource IDをlogへ出さない。運用とredactionの正本は [Observability](./observability.md)。

## Rollback

- code: Cloudflare Workersの直前versionへrollbackする。
- migration: destructive downgrade SQLを即実行しない。forward fixを基本とし、必要ならbackupから別DBへrestoreして切り替える。
- web cache: schema/API incompatibilityがある場合はR2 incremental cache prefixを更新して古いcacheと分離する。
- incident後: audit/log/traceの機密情報を確認し、原因と再発防止を関連repo-local skillへ反映する。
