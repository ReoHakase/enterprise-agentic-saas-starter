---
title: Observability
status: accepted
implementation: active
last_reviewed: 2026-08-01
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

## ログの責務

HTTPの開始と終了だけを並べても、処理内容や業務上の結果は分かりません。spanを時間軸の正本にし、
ログは「何を判断し、何件を返し、どの状態へ移したか」を補足します。同じ事実を複数の層から
重複して記録しません。

| 層                               | 記録する内容                                                                                              | 記録しない内容                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| トランスポート、Elysiaプラグイン | 完了時のルート、HTTP method、status、所要時間、request ID。開始時刻はspanで確認する                       | 成功した全リクエストの開始ログ、業務結果の推測                                |
| ルート                           | 入力形式により処理分岐が変わる場合の受付種別、入力要素数                                                  | サービスと同じ成功結果、認可済み利用者やテナントのID                          |
| サービス                         | `app.operation`、`app.outcome`、返却件数、総件数、ページ、適用したフィルター種別、権限モード、状態遷移    | HTTP status、SQL、認証情報、本文や名前などの業務データ                        |
| ドメイン                         | ロガーを`import`しない。純粋関数は判定結果を型として返し、サービスが必要な結果だけを記録する              | 副作用、環境依存の属性、成功・失敗の二重記録                                  |
| リポジトリ                       | 通常はDB spanへ委ねる。DB spanだけで不足する低速処理では、固定したクエリ分類と行数だけを`debug`で記録する | 生のSQL、bind値、各行の内容、サービスと同じ業務結果                           |
| 外部`adapter`                    | 外部操作の固定名、所要時間、status、再試行回数、正規化済み失敗分類                                        | Authorization、Cookie、ticket、grant、生のプロバイダー応答                    |
| Agent Worker、Mastra             | chat、Memory、action、model、toolの段階、件数、使用量、停止理由、正規化済み結果                           | 認証情報、private URL、binary bytes、通常log・traceへ送る生のprovider `Error` |

ロガー名は`<service.name>.<module>.<operation>`の階層にします。例えば
`enterprise-agentic-saas-api.agent.threads`と
`enterprise-agentic-saas-agent.runtime.memory-history`です。動的なIDやURLをロガー名へ含めません。

levelは次の基準で使います。

- `debug`: HTTP完了、外部呼び出しの途中経過、ページやフィルターの診断情報
- `info`: 利用者が開始した業務操作の成功結果、重要な状態遷移、ストリーム完了
- `warn`: 想定内だが調査対象になる拒否、再試行、縮退動作
- `error`: 処理を完了できなかった失敗。例外の記録は最外側のerror処理と重複させない

業務操作ログには可能な範囲で`app.operation`と`app.outcome`を付けます。件数は
`*.result_count`、全件数は`*.total_count`、条件の有無はbooleanまたは条件数で記録します。
同じtrace IDからspanとログを相互に辿れるため、ログ本文へrouteやIDを埋め込みません。

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

localではprompt、completion、Issue本文、business payload、tool input/output、run/thread/request IDをsamplingなしで残します。provider raw `Error`とbounded cause chainはADR-013の固定条件を満たす場合だけ、認証情報を除去してAPI・Agentの端末またはWebのブラウザーconsoleとlocal Lokiへ出します。Tempo、Memory、test・evalの出力やartifact、production、remote telemetryには保存しません。

生エラーの所有者は各ランタイムの`reportDevelopmentCauseChain`だけです。Lokiでは起点を含む最大5件を
1 causeにつき1 structured recordにし、messageを8 KiB、stackを32 KiBへ制限します。端末または
ブラウザーconsoleには同じrecordから再構築した認証情報除去済みの`Error.cause`ツリーを起点ごとに1回、
元stackと固定した相関contextだけで渡します。reporter自身のstackや元の生`Error`をconsoleへ渡さず、
通常logやspan eventへ複製しません。consoleとLokiの一方が失敗しても他方とアプリケーション処理を
止めません。

常時除去するのは認証materialだけです。

CollectorはLogsを認証情報除去、`batch`、Lokiの順に処理します。Tracesは認証情報除去、生の
`error.*`・`exception.*`・status messageとexception eventの除去、`batch`、Tempo・spanmetricsの順です。
Lokiの全streamは168時間保持し、compactorとdelete delay後に物理削除します。

- `Authorization`、Cookie
- API key、token、secret、password、credential
- run grant、connection ticket、authorization/verification code
- signed URLのcredential、signature、token query

collectorはflat attribute、span event、string log bodyの既知の認証key/valueを保存前に除去します。通常のURL path/query、`errorCode`、`statusCode`は残します。Mastraのnested model/tool eventにはframework標準の`SensitiveDataFilter`を認証fieldだけに指定します。独自の共通redactorやexporter wrapperは作りません。

詳細telemetryは`NODE_ENV=development`、固定local endpoint、worktree/session IDが揃う場合だけ初期化します。productionや任意のremote endpointでは無効です。

E2Eでは通常の実行とCIを既定で無効にします。ローカルLGTMへ非rawのAPI trace・logと、有料E2Eの
Agent trace・logを送る場合だけ次の明示的なopt-inを使います。

```sh
AGENT_E2E_OBSERVABILITY=1 PAID_E2E_APPROVED=1 \
  bun --env-file="$PWD/apps/agent/.env.local" run --cwd apps/web test:e2e:full
```

ランナーは`http://127.0.0.1:4318`、実行ごとの`DEV_SESSION_ID`、E2E用`DEV_WORKTREE_ID`、
`AGENT_E2E_RUN_ID`を一組でWorkerへ渡します。`AGENT_E2E_RUN_ID`がある場合、通常のtrace・log exportは
有効なまま、APIとAgentの`reportDevelopmentCauseChain`は生のmessage、stack、causeを端末やLokiへ
出しません。固定error code、失敗status、HTTP・request・trace属性だけを残し、E2Eの標準出力や
Playwright成果物へLGTMデータを添付しません。

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
