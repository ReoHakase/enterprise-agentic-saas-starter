---
title: Observability
status: accepted
implementation: active
last_reviewed: 2026-07-29
---

# Observability

local developmentではOpenTelemetryをsignal contract、`grafana/otel-lgtm`をquery backendにします。SentryとSpotlightは併用しません。長期判断と実装を小さく保つ制約は[ADR-010](./decisions/ADR-010-local-opentelemetry-lgtm.md)が正本です。

## 最小構成

repository固有の基盤はrootの3 fileだけです。

- `compose.observability.yaml`: 固定container、loopback port、persistent named volume
- `otelcol.observability.yaml`: OTLP、Loki、Tempo、Prometheus、spanmetrics、認証material除去
- `scripts/observability.ts`: `check`、`up`、`down`

`tooling`やobservability専用packageは作りません。runtimeは既存のNext.js instrumentation、API Worker、Agent Worker、Mastra compositionへ直接設定します。

| Runtime         | integration                                       | signal                             |
| --------------- | ------------------------------------------------- | ---------------------------------- |
| Next.js browser | OpenTelemetry Web SDK                             | navigation/fetch trace、log        |
| Next.js server  | OpenTelemetry Node SDK                            | server trace、log                  |
| Elysia Worker   | `@inference-net/otel-cf-workers`                  | HTTP trace、structured log         |
| Agent Worker    | Worker OTel + Mastra `Observability`/`OtelBridge` | Agent/model/tool trace、log        |
| collector       | `spanmetrics` connector                           | span count、duration、error metric |

`packages/portless-topology`は最上位の起動で`DEV_SESSION_ID`を生成し、入れ子の`exec -> run`では同じIDを継承します。全runtimeへ`service.name`、`dev.worktree.id`、`dev.session.id`を付けます。LGTMはworktreeごとに分けず、全checkoutで一つを共有します。この絞り込みはsecurity isolationではありません。

Elysiaは全レスポンスについてルート、HTTP method、status、所要時間、request IDを構造化ログへ出し、例外は有効なspanと同じtrace IDへ関連付けます。チャットではWebがrequest、response header、first byte、stream完了を、APIがrequest準備とAgent Worker呼び出しを、Agent Workerがresponse streamを記録します。Mastraの計測は自動検出任せではなく、Agent Workerで`Observability`と`OtelBridge`を明示的に組み込み、Agent、モデル、ツールのspanを外側のWorker spanへ接続します。

## endpointとlifecycle

- Grafana: `http://127.0.0.1:3000` / `https://grafana.enterprise-agentic-saas.localhost`
- OTLP gRPC: `http://127.0.0.1:4317`
- OTLP HTTP: `http://127.0.0.1:4318`
- browser OTLP: `https://otel.enterprise-agentic-saas.localhost`
- collector health: `http://127.0.0.1:13133/ready`

browserはPortless HTTPS aliasへ直接送信し、Next.js relayを作りません。

```sh
# Docker/OrbStackとPortless proxyは利用者が先に起動する
bun run observability:up
bun run dev

# named volumeを残して停止する
bun run observability:down
```

`bun run dev`はloopback endpointとbrowser用Portless aliasのreadiness確認だけを行います。Docker daemon、OrbStack、Portless proxyを起動せず、`sudo`、`open`、`osascript`、`docker compose up`を呼びません。停止中またはalias欠落時は`bun run observability:up`を案内してapplication processの起動前に失敗します。

`observability:up`は`docker compose up --wait`でimage標準healthcheckを待ち、固定Grafana/OTLP aliasを登録します。`observability:down`はcontainerを停止してaliasを外しますが、`enterprise-agentic-saas-observability-data` volumeは削除しません。

## local data境界

localではprompt、completion、Issue本文、business payload、tool input/output、run/thread/request IDをsamplingなしで残します。provider raw `Error`とbounded cause chainは`NODE_ENV=development`のAgent consoleだけへ出し、OTLP、Grafana、共有artifactには保存しません。

常時除去するのは認証materialだけです。

- `Authorization`、Cookie
- API key、token、secret、password、credential
- run grant、connection ticket、authorization/verification code
- signed URLのcredential、signature、token query

collectorはflat attribute、span event、string log bodyの既知の認証key/valueを保存前に除去します。通常のURL path/query、`errorCode`、`statusCode`は残します。Mastraのnested model/tool eventにはframework標準の`SensitiveDataFilter`を認証fieldだけに指定します。独自の共通redactorやexporter wrapperは作りません。

詳細telemetryは`NODE_ENV=development`、固定local endpoint、worktree/session IDが揃う場合だけ初期化します。productionや任意のremote endpointでは無効です。

## Codexでの調査

1. in-app browserで対象導線を再現する。
2. 遅い場合は`service.name`、`dev.worktree.id`、`dev.session.id`でTraceQLを絞る。
3. 失敗した場合はtrace IDと同じ属性でLokiのlogを読む。
4. regressionはspanmetricsをPromQLで比較する。
5. 修正後に同じ導線とqueryを繰り返す。

生成MCPは固定Grafanaへ接続するread-only `mcp-grafana`です。write toolは無効です。

GrafanaはExploreでTempo、Loki、Prometheusを選び、次の最小クエリから調査します。初期画面に専用ダッシュボードはありません。

```text
# TraceQL: 現在のbun run devに属するtrace
{ resource.dev.worktree.id = "main" && resource.dev.session.id = "<DEV_SESSION_ID>" }

# LogQL: API log。dev.*はLokiのstructured metadataではunderscoreへ正規化される
{service_name="enterprise-agentic-saas-api"} | dev_worktree_id="main" | dev_session_id="<DEV_SESSION_ID>"

# PromQL: ランタイムごとのspan数
sum by (service_name) (local_calls_total{dev_worktree_id="main", dev_session_id="<DEV_SESSION_ID>"})
```

チャットの一貫したtraceは、TempoでAPIの`POST /agent/chat`を起点に開き、同じtrace内の`enterprise-agentic-saas-web-browser`、`enterprise-agentic-saas-api`、`enterprise-agentic-saas-agent`を確認します。collectorはWorker SDKが最初のHTTP spanへ付けた`dev.*`をresource attributeへ昇格し、同じResourceSpansに含まれるMastra spanでも同じ絞り込みを使えるようにします。

実containerを使うacceptanceは自動smokeにしません。利用者がstackを起動した状態で、Web/API/Agentの各導線を一度実行し、GrafanaまたはCodex MCPからLogQL、TraceQL、PromQLを確認します。volume永続性が必要なときだけ保守時間に`down -> up`して同じqueryを手動確認します。Docker singletonを`bun run check`やCIへ含めません。

## production

production backendは未構成です。同じquery modelを使う場合はGrafana Cloudのmanaged Loki、Tempo、Mimir、Grafanaが第一候補です。self-hostする場合はAlloy、Loki、Tempo、Mimir、Grafana、object storageを別serviceとして運用します。localのone-container image、固定endpoint、rich-content設定はproductionへ持ち込みません。retention、tenant isolation、sampling、alert、費用、Cloudflare native exportとの重複は別ADRで決めます。

## 検証

```sh
bun run check
bun run build:cloudflare
nix flake check
docker compose --file compose.observability.yaml config
```

deterministic testはPortlessのID継承、固定endpoint gate、薄いlifecycle command、collector配線だけを対象にします。live query、MCP、volume再起動の自動smokeは追加しません。
