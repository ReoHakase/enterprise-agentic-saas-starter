---
id: ADR-013
title: 固定ローカル環境の生エラーをLogsだけへ保存する
status: accepted
date: 2026-08-01
owners:
  - repository-maintainers
related:
  - ADR-010-local-opentelemetry-lgtm.md
---

# ADR-013 固定ローカル環境の生エラーをLogsだけへ保存する

## 背景

ADR-010は、ローカル開発の詳細なテレメトリーを共有LGTMへ集約する一方、生のプロバイダー`Error`と
`cause`連鎖をAgentの端末だけへ限定しました。この制約では、Elysia、Mastra、Webの失敗をtrace IDから
調べるときに、Lokiへ原因がなく、例外変換後の固定文言しか残らない場合があります。逆にTempoへ
生エラーを記録すると、traceの属性、event、`status.message`へ認証情報が複製され、保存面が広がります。

## 決定

固定ローカル開発環境では、認証情報を除去した生のエラー詳細を端末またはブラウザー`console`と、
OpenTelemetry Logs経由のLokiだけへ保存します。Tempoには固定エラーコード、失敗状態、HTTP情報、
リクエスト・trace・spanの識別子だけを残します。Memory、テスト・評価の出力や成果物、本番、任意の
リモートテレメトリーには生のエラー詳細を保存しません。

この決定はADR-010のうち、生のプロバイダー`Error`をAgent端末だけに出し、OTLPとGrafanaへ保存しない
判断を置き換えます。共有LGTM、固定endpoint、`worktree`・セッション属性、`bun run dev`を準備完了確認だけに
する判断、開発専用の汎用パッケージを作らない制約は維持します。

### 出力条件と保存面

- サーバーでは`NODE_ENV=development`、OTLP HTTP endpointが`http://127.0.0.1:4318`と完全一致し、
  `worktree` IDとセッションIDがある場合だけ生エラーを出す。
- ブラウザーでは固定Portless OTLP aliasと公開された`worktree` ID・セッションIDが完全に揃う場合だけ出す。
- テスト・評価のランナーから生エラー報告処理を呼ばず、環境変数を設定しても無効にする。
- サーバーは端末とLoki、ブラウザーはブラウザー`console`とLokiへ出す。片方への出力失敗で、もう片方や
  アプリケーション処理を失敗させない。
- トランスポート完了ログと例外詳細はそれぞれ1回だけ記録する。同じ情報をログと`span event`へ重複して
  送らない。

### ログ契約

`level`は次の基準へ揃えます。

| level   | 対象                                                                         |
| ------- | ---------------------------------------------------------------------------- |
| `debug` | 2xx・3xxのHTTP完了、振り分け、レスポンスヘッダー、最初のbyte、上限付きの進捗 |
| `info`  | 業務操作の成功、状態遷移、ストリーム完了                                     |
| `warn`  | 4xx、想定した拒否、再試行、縮退動作                                          |
| `error` | 5xx、最終失敗、ストリーム失敗                                                |

共通属性は`timestamp`、`severityText`、`service.name`、`logger.scope`、`event.name`、
`app.operation`、`app.outcome`、`trace_id`、`span_id`、`request_id`、HTTP method・route・status、
`duration_ms`とします。動的なIDやURLを`event.name`へ埋め込みません。

生エラーは各ランタイムの既存可観測性境界に置く`reportDevelopmentCauseChain`だけが扱います。Lokiは起点を
含む最大5件を1つの`cause`につき1件の構造化ログへし、`exception.type`、`exception.message`、
`exception.stacktrace`、`exception.depth`、`exception.cause_truncated`を使います。`message`は8 KiB、
`stack`は32 KiBへ制限します。循環参照、例外を投げるgetterやProxy、`BigInt`、`Symbol`、非`Error`を
受けても報告処理が失敗しない、上限付きの単純な`record`へ変換します。

端末またはブラウザー`console`には、同じrecordから再構築した認証情報除去済みの`Error.cause`ツリーを
起点ごとに1回だけ`console.error(error, safeContext)`で渡します。`name`、`message`、元のstack、最大5段の
causeを保持し、reporter自身のstackを生成しません。`safeContext`は固定error code、operation、service、
HTTP method・route・status、リクエスト・trace・span IDだけに限定します。元の生`Error`はconsoleへ直接
渡しません。

`Authorization`、Cookie、Bearer・Basic認証、API key、token、secret、password、JWT、URL userinfo、
OAuth・署名付きURLの認証queryを、アプリケーション側で端末出力前に除去し、Collectorでも
再度除去します。通常のURL、メールアドレス、プロバイダー応答本文は、認証情報に該当しない限り
ローカルの原因調査用に保持します。

### signal分離

- Logs: アプリケーション側の認証情報除去、Collector側の認証情報除去、`batch`、Lokiの順に処理する。
- Traces: 認証情報除去、生例外のevent・`exception.*`・生の`error.*`・`status.message`除去、`batch`、
  Tempoおよび`spanmetrics`の順に処理する。
- `app.error.code`、失敗状態、HTTP・リクエスト・resource属性、認証情報を含まないAgentの
  `input`・`output`は保持する。
- ElysiaのHTTP完了判定は`afterResponse`だけが所有する。
- Mastraの暗黙ロガーを`logger: false`と`logging.enabled: false`で止め、OtelBridgeより前の
  `AgentTraceErrorNormalizer`で`errorInfo`を固定値へ変換する。

### 公開レスポンスとの分離

アプリケーション所有のHTTPエラー本文は有限な`error`、アプリケーションが所有する500文字以下の
`message`、任意の`fieldErrors`だけとします。`message`と`fieldErrors`は4xxの理由を画面へ示すための
公開データであり、生の`Error.message`、provider応答、入力値から生成しません。5xxは固定文言だけを返し、
context、stack、cause、request ID、retry情報を本文へ含めません。request IDとretry情報はそれぞれ
`x-request-id`と`Retry-After`へ分離します。

この公開データは生エラーを保存するLogs契約とは別の面です。WebはEdenが投げた元のErrorを再包装せず、
表示時だけ4xxの`message`と`fieldErrors`を読み取ります。

TanStack Startのサーバー関数はglobal function middlewareで失敗原因を報告した後、redirect、not found、
`Response`以外をcauseのない固定5xx `Error`へ置換します。framework標準handlerが行うconsole出力と
Seroval直列化へproviderのmessage、stack、causeを渡しません。`src/start.ts`を置くとframeworkの暗黙CSRF
middlewareが外れるため、同じglobal設定でserver functionだけを対象に公式`createCsrfMiddleware`を
明示します。

署名済みOAuth queryをloader dataへ保持する認証routeは`Cache-Control: no-store`を返し、期限内の署名、
state、redirect先をbrowser cacheへ保存しません。

Lokiの全`stream`は168時間の保持期間とします。compactorによる物理削除には遅延があるため、168時間を
超えた直後の削除は保証しません。既存の永続ボリュームでは、7日を超えたログが不可逆に削除される場合が
あります。TempoとPrometheusの保持期間は変更しません。

## 理由

- trace IDからLokiの原因詳細へ移動でき、変換層で失われたエラー原因をローカルで調査できる。
- 生エラーをLogsへ限定すると、Tempo内の複数の属性・eventへの複製を防げる。
- 固定endpointと開発IDの一致を必須にし、本番や任意の収集先へ同じ設定を流用できない。
- 既存の`ObservedLogger`、OpenTelemetry Logs API、Mastra Observabilityで実現でき、LogTapeやPinoを
  追加する必要がない。

## 検討した代替案

- 生エラーを端末だけへ出す: 既存ADR-010の方式ではtrace IDから原因へ到達できないため採用しない。
- 生エラーをTempoのexception eventへ残す: 保存面と重複が増えるため採用しない。
- LogTapeまたはPinoを追加する: 既存ロガーとOpenTelemetry Logs APIで分類と出力先を表現できるため
  採用しない。
- 本番の出力先も同時に決める: Cloudflare Workers LogsとOpenTelemetry exportの比較が必要なため、別ADRへ
  延期する。Vercelは現在の配備先ではないため対象にしない。

## 結果

- ローカルLokiボリュームは認証情報を除去した開発用機密データを保持し、`worktree`間の安全境界にはならない。
- ボリュームの共有、外部への書き出し、テスト成果物への添付を禁止する。
- 各ランタイムには小さな報告処理が必要になるが、共通パッケージと新しいロガー依存は追加しない。
- 本番の出力先、`run` IDのAI Gateway伝播、追加の時間メトリクス、trace量最適化は未決定のまま残る。

## 強制方法

- ランタイムごとの固定endpoint・開発ID・テスト禁止条件を単体テストで固定する。
- CollectorでLogsとTracesのprocessor chainを分離し、traceから生例外を除去する。
- 通常ログから`span.addEvent`複製と生の`recordException`を除去する。
- Lokiへ168時間の保持期間と物理削除を有効にする引数を設定する。
- 本番・リモート・Memory・テスト成果物に生エラーの`sentinel`がないことを検査する。

## 検証

- 5段の`cause`、循環参照、例外を投げるgetter・Proxy、`BigInt`、文字数制限、出力条件、
  console 1回とLokiのcause別record
- 端末・ブラウザー`console`とLokiの生エラー`sentinel`、認証情報`sentinel`の`[REDACTED]`
- Tempoのattribute・event・`status.message`、Memory、テスト出力に生エラー`sentinel`がないこと
- `app.error.code`、失敗状態、HTTP route、リクエスト・trace・span IDが残ること
- Mastra `errorInfo`とCloudflare SDKの自動例外をcollectorが除去すること
- `docker compose --file compose.observability.yaml config`と固定Lokiイメージの`-verify-config`
- 実LGTMで200・404・500、Agent成功、モデル・ツール失敗を発生させる手動確認
- `bun run check`、`bun run build:cloudflare`、`nix flake check`
