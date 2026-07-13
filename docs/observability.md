# Observability

このrepoではSentryをapplication observabilityの正本、Cloudflare Workers Observabilityをplatform runtimeの補助、Spotlightをlocal Sentry envelopeの確認先にする。productionで同じWorkerのlogs/tracesをSentry SDKとCloudflare OTLP destinationの両方から送ると重複するため、初期構成ではapplication codeからSentry SDKへ送る経路だけを有効にする。

## Runtime構成

| Runtime | Integration | 主な対象 |
|---|---|---|
| Next.js browser | `@sentry/nextjs` client instrumentation | render/navigation error、Web Vitalsに連なるtrace、frontend log |
| Next.js server/edge | `@sentry/nextjs` instrumentation | Server Component、route、request error、server trace |
| Elysia on Cloudflare | `@sentry/cloudflare` Worker wrapper | request error、Worker trace、structured log |
| Elysia on Bun | `@sentry/bun` preload | local/test entrypointのerror、trace、structured log |
| Cloudflare platform | Workers Observability | invocation、CPU/wall time、platform log、deployment単位の運用確認 |
| Local | Spotlight sidecar | Sentryへ外送しないerror、trace、logの確認 |

WebとAPIはSentry projectを分け、同じ`SENTRY_RELEASE`とenvironmentを付ける。browserからAPI originへのtrace propagationを許可し、1 requestを両projectで追跡できるようにする。

## Data境界

SDKは`sendDefaultPii: false`を固定し、送信直前のscrubberをerror、transaction、breadcrumb、logへ共通適用する。次をevent、span、log、breadcrumbへ入れない。

- `cookie`、`authorization`、request/response body、form data
- session、magic link、invitation、verification token
- email address、IP address、user/organization/member/resource ID
- Turso URL/token、Cloudflare/Sentry secret、providerのraw error
- URL query/hashと動的なtenant/resource path segment
- React EmailのHTML/textと`renderProps`の値

相関には`request_id`、正規化したroute、HTTP method/status、duration、service、runtime、environment、release、error codeを使う。自由文へcontextを埋めず、allowlistした低cardinality fieldをstructured attributesにする。

## Sampling

- Spotlight: error/log/traceを100%。local machine外のendpointは受け付けない。
- Production error: 初期値100%。容量が問題になった場合もsecurity/auth/email failureは落とさず、noiseの原因を先に直す。
- Production trace: 初期値10%。trafficとSentry usageを見てenvで調整する。
- Session Replay: このstarterでは無効。認証・tenant管理画面を含むため、導入時は別のprivacy reviewとmask testを必須にする。

sampling rateは0から1の範囲だけを受け付け、範囲外は安全な既定値へ戻す。release後にrateを変える場合はWeb browser、Web server、APIの値を意図的に揃える。

## Healthとalert

APIの`GET /health`はprocess/Workerのliveness endpointで、認証不要、side effectなし、200 JSONを返す。Sentry Uptime monitorはproduction APIのこのURLを監視し、Webは公開rootまたは専用の軽量pageを別monitorにする。Turso疎通はlivenessへ混ぜず、DB span latency/error rateのmonitorで検知する。

production開始時の最小monitorは次の通り。

- API/Web uptime failure
- unhandled errorまたは5xx率の急増
- p95/p99 transaction durationの悪化
- auth failure、permission denial、CSRF failureの急増
- `email_failed`、特にrate limit/internal errorの継続
- Turso request latency/error

Monitorは検知条件、Alertは通知先として分離する。production high priorityはSlackとemailへ通知し、test notificationを実行する。閾値、owner、runbook URL、通知抑制時間を設定し、staging eventでproduction alertを鳴らさない。

## Incident確認順

1. Sentry issue/monitorでservice、environment、release、route、request IDを確認する。
2. 同じrelease/request IDをCloudflare Workers logsとtraceで確認し、CPU/wall time/platform failureを分離する。
3. deploy直後なら直前versionとのevent rateとperformance差分を確認する。
4. email failureはtemplate、Cloudflare error code、retryableだけを確認し、recipientや本文をlogから探さない。
5. secret/PII混入を見つけたらevent削除だけで終えず、credential rotation、scrubber test、repo-local skill更新まで行う。

## Release前の確認

```sh
bun run dev:spotlight
bun run check
bun run build:cloudflare
```

Spotlightでbrowser、Next server、APIのtest error/log/traceが見え、token/PIIが含まれないことを確認する。production deploy後はSentry release/source map、API/Web Uptime monitor、Slack/email test notification、Cloudflare Worker invocation metricsを確認する。
