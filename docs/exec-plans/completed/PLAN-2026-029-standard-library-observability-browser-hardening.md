---
id: PLAN-2026-029
title: 標準機能優先のAgent・エラー・可観測性・ブラウザーテスト整理
status: completed
created: 2026-08-01
owners:
  - repository-maintainers
linked_specs:
  - ../../observability.md
  - ../../api-openapi.md
  - ../../auth-tenancy-security.md
  - ../../architecture/apps/agent.md
  - ../../architecture/apps/api.md
  - ../../architecture/apps/emulate.md
  - ../../architecture/apps/web.md
  - ../../agent/runtime-reliability.md
  - ../../agent/storage-memory.md
  - ../../testing-strategy/common/browser-test-writing.md
  - ../../testing-strategy/common/storybook.md
  - ../../testing-strategy/e2e.md
linked_adrs:
  - ../../decisions/ADR-006-migration-history-append-only.md
  - ../../decisions/ADR-007-workspace-testing-strategy.md
  - ../../decisions/ADR-008-mastra-native-agent-runtime.md
  - ../../decisions/ADR-010-local-opentelemetry-lgtm.md
  - ../../decisions/ADR-012-standard-memory-and-auth-delivery.md
  - ../../decisions/ADR-013-local-raw-errors-in-logs-only.md
---

# 標準機能優先のAgent・エラー・可観測性・ブラウザーテスト整理

## 目的

Mastra、AI SDK、Better Auth、Elysia、Next.js、Storybook、Playwrightの標準機能へ処理を委譲し、
独自のMemory確定、招待配送、エラー変換、OpenAPI結合、開発用Emulator起動、ブラウザーテストの
時間依存を削除します。Webの見た目と`bun run dev`の利用方法を維持しながら、固定ローカル環境では
trace IDからLokiの原因詳細へ到達でき、Tempoへ生エラーを保存しない観測契約へ切り替えます。

最終差分では、テストと生成マイグレーションを除く手書きの本番TypeScript・TSXについて、追加行より
削除行を多くします。新しいロガー、汎用エラーパッケージ、開発用ランチャーは追加しません。

## 対象外

- リポジトリルートの`bun run dev`、Portless hostname、起動するプロセス構成の変更
- DB・R2の開発用初期データ投入の設計、コマンド、フィクスチャ拡張
- Webのclass、レイアウト、テーマ、Lunaのreasoning表示とturn minimapの再設計
- 本番のログ出力先、Cloudflare Workers LogsとOpenTelemetry exportの選定
- Vercel対応、本番配備、PR merge、リモートDB変更
- 本番Memoryと招待メールに独自の厳密耐久性を残すこと
- 明示承認のない有料Agent評価と有料E2E
- ADR-009とPLAN-2026-010が所有するリモートMCP、OAuth、MCP個人アクセストークン

ロール移行に伴う既存フィクスチャの文字列置換は許可しますが、開発用初期データ投入処理そのものは
整理しません。

## 前提条件

- 調査基準は`a416b67`、`ai@7.0.40`、`@ai-sdk/react@4.0.43`、
  `@mastra/ai-sdk@1.6.3`、`@mastra/core@1.53.0`とする。
- Mastra `adapter`の`version: "v6"`はUIMessage互換形式であり、AI SDK 6を示さない。利用可能な
  Mastra標準形式を1つの`adapter`境界へ閉じ、AI SDK 7向けの独自`mapper`を作らない。
- リリース前のため、公開エラーレスポンス、organizationのロール、招待API、Issue URLの旧クエリは
  後方互換層なしで変更できる。
- 既存のLuna reasoning本文、allowlist済み`reasoning_details`、approval、opaque ticket、
  API認可・トランザクションは維持する。
- マイグレーション履歴は追記専用とし、`main`に存在するマイグレーションを変更しない。
- 新しい外部依存はEmulateのNext.js `adapter`・GitHub Emulatorと、WebのStorybook静的検査プラグイン
  だけを許可する。lockfileはBunの所有コマンドだけで更新する。

## 変更対象path

```text
apps/agent/**
apps/api/**
apps/emulate/**
apps/web/**
packages/auth/**
packages/db/**
packages/email/**
packages/ui/**
compose.observability.yaml
otelcol.observability.yaml
turbo.json
oxlint.config.ts
.github/workflows/**
docs/**
.agents/local-skills/**
```

`.agents/skills/**`は手編集せず、`.agents/local-skills/**`の変更後に
`nix run .#sync-agent-config`で同期します。

## 作業単位

### 1. 判断と正本文書

- [x] 最新Agent、AI SDK・Mastra版、エラー経路、可観測性、Storybook・Playwright、Emulatorを再調査する。
- [x] ADR-012でMastra MemoryとBetter Auth標準機能を独自耐久化より優先する。
- [x] ADR-013で固定ローカル環境の生エラーをLogsだけへ保存する。
- [x] ADR-007へブラウザーテストの安定性契約を追記する。
- [x] PLAN-2026-010からMemoryと独自耐久確定処理の今後の変更を本計画へ移管する。
- [x] Observability、Agent、Auth、API、Web、Emulate、テスト戦略と運用文書を実装後の契約へ揃える。
- [x] `AGENTS.md`と関連local skillを、本番・リモート・テスト禁止と固定ローカル例外へ揃えて同期する。

### 2. 薄いエラー境界と公開レスポンス

- [x] APIの`AppError`、エラー登録、公開用変換群を、小さな
      `HttpError { code, cause?, retryAfter?, publicMessage?, fieldErrors? }`と固定status対応表へ置き換える。
- [x] アプリケーション所有のエラーレスポンスを有限な`error`、安全な`message`、任意の`fieldErrors`へ
      限定する。contextは返さず、リクエストIDは`x-request-id`、再試行情報は`Retry-After`へ出す。
      Better Authのルートは標準レスポンスを維持する。
- [x] 未知の例外を再生成せず、Elysiaの最外側まで元の値を運ぶ。既知のドメイン失敗だけを
      `cause`付き`HttpError`へ1回変換し、4xxは記録せず、5xxの原因を1回だけ記録する。
- [x] WebはEdenの`throwHttpError: true`とBetter Authの標準throwへ寄せ、
      `ConsoleApiError`、`SecurityMutationError`、招待・セッション用の再包装を削除する。
- [x] XHR uploadだけに薄い`FileUploadError`を残す。成功DTOのValibot検証は維持し、エラー本文の
      再解析を削除する。
- [x] TanStack Queryの全体observer、命令的操作の最外側、AI SDKの`useChat.onError`が元の
      エラーを1回だけ報告する。UIは4xxの公開`message`と`fieldErrors`だけを表示し、5xxや未知の
      Errorには既存レイアウトで固定文言を示す。
- [x] OpenAPIの有限エラースキーマとWebのテストを新しい本文へ一括で切り替え、互換`adapter`を作らない。

固定コードと`status`は次の対応にします。

| status | `error`                                                                    |
| ------ | -------------------------------------------------------------------------- |
| 400    | `validation_error`, `confirmation_required`                                |
| 401    | `unauthorized`                                                             |
| 403    | `forbidden`, `csrf_origin_forbidden`, `step_up_required`                   |
| 404    | `not_found`                                                                |
| 409    | `conflict`, `active_organization_required`, `active_organization_mismatch` |
| 415    | `unsupported_media_type`                                                   |
| 429    | `rate_limited`                                                             |
| 503    | `service_unavailable`                                                      |
| 500    | `internal_error`                                                           |

### 3. Logsだけに生エラーを置く可観測性

- [x] API・Agent・Webの通常ログから`span.addEvent`複製、生の`recordException`、生の`status.message`を
      除去し、ElysiaのHTTP完了を`afterResponse`だけへ集約する。
- [x] 各ランタイムの既存可観測性境界へ`reportDevelopmentCauseChain`を置き、新しい共通パッケージを
      作らずADR-013の出力条件、5段上限、文字数制限、安全な変換、認証情報除去を実装する。
- [x] 共通属性、`level`、`event.name`、`app.operation`、`app.outcome`、HTTPとtrace相関を固定し、
      トランスポート完了と例外詳細を各1回だけ記録する。
- [x] CollectorをLogsとTracesの処理列へ分離し、Tempoからexception event、`exception.*`、生の
      `error.*`、`status.message`を除去する。`app.error.code`と失敗状態は保持する。
- [x] Mastraを`logger: false`、`logging.enabled: false`にし、OtelBridge前の
      `AgentTraceErrorNormalizer`で`errorInfo`を固定値へ変換する。ロガー接続では元の`context`、`timestamp`、
      `severityNumber`を保持する。
- [x] Loki全`stream`へ168時間の保持期間と物理削除を設定し、Tempo・Prometheusの保持期間は
      変更しない。
- [x] LogTape、Pino、本番の出力先、Next.js relayを追加しない。

### 4. Mastra標準Memoryへの切替

- [x] Product AgentのMemoryから読み取り専用設定を外し、標準の履歴保存とスレッド名生成を使う。
- [x] セキュリティ用の表示変換をMastraの`outputProcessors`へ移し、MessageHistoryより前に適用する。
- [x] `handleChatStream`、`toAISdkMessages(..., { version: "v6" })`、`messageMetadata`、`onFinish`を
      ストリーム・履歴・`run`精算の標準境界にする。
- [x] 独自`memory-commit` Workflow、`canonical commit`、`reconciliation`、`drain`、API精算の
      調停、独自スレッド名Agentを削除し、ストリーム終了をMemoryの厳密な確定待ちから外す。
- [x] 保存失敗を固定エラーコード付きtraceで観測するが、Mastra内部処理を横取りしない。
- [x] 標準`LibSQLStore.init()`の反復試験が成功した場合だけ`AgentLibSQLStore`の回避処理を削除する。
- [x] reasoning本文、`reasoning_details`、turn minimap、approval Workflow、opaque resume ticket、
      API認可、`run`精算を維持する。

### 5. Better Auth、OpenAPI、Issue URL、Emulator

- [x] `super_admin`を`owner`へ変換する追記専用マイグレーションを作り、
      `owner`、`admin`、`member`と`owner`一意制約へ統一する。
- [x] 招待UIと呼び出しを1メールアドレスずつにし、Better Auth標準の作成・`resend`と
      `sendInvitationEmail`コールバックへ接続する。
- [x] 招待配送用`outbox`、定期処理、配送状態、独自一括招待・再送APIを削除する。メール失敗は
      最善努力型とし、organizationの即時削除・監査・テナント認可は維持する。
- [x] OpenAPIはアプリケーション所有のElysiaスキーマとBetter Auth生成スキーマを別の情報源として公開し、Scalarから
      両方を参照する。独自結合、OpenAPI 3.1から3.0への変換、メタデータ補正を削除する。
- [x] Issue URLの旧`priority`と`dueOffset`を削除し、現在の正規keyだけを読む。
- [x] `apps/emulate`を`@emulators/adapter-next`とGitHub EmulatorだけのNodeランタイムのNext.js appへ
      置き換え、`/emulate/github/**`へ固定する。
- [x] GitHub OAuth用に決定的な2利用者を用意し、独自サービス登録、ライフサイクル、終了処理、
      設定検証処理、独自起動処理を削除する。リポジトリルートの起動方法とプロセス構成は変えない。

### 6. Storybook、Playwright、CI

- [x] `docs/testing-strategy/common/browser-test-writing.md`を正本にし、ARIA roleと`accessible name`を
      優先するロケーター、ポータル、フォーカス、非同期処理、限定CSS利用の規則を実装へ反映する。
- [x] 固定時間の待機、`networkidle`、非公開のフォーカス防護処理、Tailwind class assertionを、リクエスト、DOM、
      フォーカス、コールバックなど観測可能な状態へ置き換える。
- [x] UI Storybookも`fileParallelism: false`、`maxWorkers: 1`とし、`light`と`dark`を別コマンドで
      順次実行する。WebへStorybook、W6へPlaywrightの静的検査ルールを追加する。
- [x] Storybookの自動的に解決しない遅延とIssueの古いレスポンス競合を、後処理付きの制御可能な
      遅延へ置き換える。W6は名前空間付き`RequestGate`を使い、全て`finally`で解除する。
- [x] E1 Agentテストを`cancel`、Issue承認・書き込み、Web検索、添付ライフサイクルへ分割し、
      2 Emulator利用者とワーカー別の認証状態、organization、threadで隔離する。
- [x] E1を`--workers=2 --repeat-each=3`で3回成功させた後に通常値を2 workerへ上げる。検証に失敗した
      場合は1 workerを維持して原因を記録し、再試行や待機延長で隠さない。
- [x] CIをWebコンポーネント、UIコンポーネント、W6の3検査と集約`Browser`へ分割する。無料E1はUbuntuと
      Chromium、代表WebKitはW6だけにし、失敗時だけレポートを保存する。
- [x] `test:browser`のTurborepoキャッシュを無効化する。有料E2は1 worker、再試行0、成果物無効を維持する。

### 7. 統合、削減量、完了検査

- [x] 変更した仕様、architecture、テスト戦略、運用、local skillを実装へ一致させる。
- [x] `nix run .#sync-agent-config`で生成先を同期し、生成先を手編集していないことを確認する。
- [x] テスト・生成マイグレーションを除く手書き本番TS・TSXの差分が純減であることを確認する。
- [x] 最小のワークスペース検査からrootの必須検査へ広げる。
- [x] 現在の差分を仕様、セキュリティ、テスト、二重記録、未使用コードの観点でレビューし、修正後に
      必須検査を再実行する。

## 進捗

- [x] 承認済み計画をリポジトリのADRと実行計画へ記録した。
- [x] 最新Agent変更と現行エラー・可観測性・ブラウザーテスト・Emulator構成を再調査した。
- [x] 薄いエラー契約と固定ローカルLogs契約を実装した。
- [x] Mastra MemoryとBetter Authの標準経路へ切り替えた。
- [x] Next.js EmulatorとOpenAPI・Issue URL整理を実装した。
- [x] Storybook・Playwright・CIを安定性契約へ揃えた。
- [x] 必須検査、手動LGTM確認、差分レビューを完了した。

## 判断記録

| 日付       | 判断                                                            | 理由                                                                        |
| ---------- | --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 2026-08-01 | 厳密な履歴・招待配送よりMastraとBetter Authの標準経路を優先する | 保守する独自状態機械と接続コードを減らすため                                |
| 2026-08-01 | Mastra `adapter`の`version: "v6"`を維持する                     | AI SDK 7の版ではなく、導入済み`adapter`が提供するUIMessage形式であるため    |
| 2026-08-01 | 公開エラーをcode、安全なmessage、field errorだけにする          | UIへ理由を示しつつ、contextと生のErrorを公開面から除外するため              |
| 2026-08-01 | 生エラーは固定ローカルの端末・`console`とLokiだけに残す         | 原因をtrace IDから調べつつTempo、本番、テスト成果物への複製を防ぐため       |
| 2026-08-01 | リポジトリルートの`bun run dev`とプロセス構成を変更しない       | 利用者の統一起動経路を維持し、Emulator内部だけを標準Next.js appへ替えるため |
| 2026-08-01 | DB・R2の開発用初期データ投入を対象外にする                      | 今回の標準機能移行と独立しており、変更範囲を広げないため                    |
| 2026-08-01 | E1は状態分離と3回反復が成功した場合だけ2 workerへ上げる         | 競合を再試行やタイムアウトで隠さず、測定して並列化するため                  |
| 2026-08-01 | 手書き本番コードの差分を純減にする                              | 抽象層の置換ではなく保守対象の削除を完了条件にするため                      |

## 検証証跡

| command                                                                | 結果 | 証跡                                                                           |
| ---------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------ |
| API・Agent・Web・UI・Auth・Email・Emulateの`lint`、`typecheck`、`test` | 成功 | `bun run check`で全workspaceを検査。API 338、Agent 296、Web 460 testを含む     |
| `bun run test:browser`                                                 | 成功 | 2分13秒。Storybook、Web Browser Mode 9、W6 Chromium 17、代表WebKit 1           |
| Storybook shuffle seed 17、83、101                                     | 成功 | Web/UIのlight/darkを12回実行し、合計1,140 test                                 |
| W6 `--repeat-each=3`                                                   | 成功 | 51 scenario                                                                    |
| `bun run test:e2e`                                                     | 成功 | 通常6/6、`--workers=2 --repeat-each=3`は18/18                                  |
| `bun run build:storybook`                                              | 成功 | Web/UI 3/3                                                                     |
| 追記専用マイグレーション生成・新規DB・更新用フィクスチャ・`db:check`   | 成功 | 追加schema差分なし。fresh/upgradeを含むmigration 30/30、history・drift検査成功 |
| `bun run check`                                                        | 成功 | lint、Knip full/strict、jscpd、format、typecheck、無料unit/integration         |
| `bun run build:cloudflare`                                             | 成功 | Web、API、Agent 3/3のdry-run。配備なし                                         |
| `nix flake check`                                                      | 成功 | 現行systemの4 check                                                            |
| `nix run .#sync-agent-config`                                          | 成功 | 生成先に追加差分なし                                                           |
| `docker compose --file compose.observability.yaml config --quiet`      | 成功 | Collector、Loki、Tempo、Prometheus構成                                         |
| 固定Lokiイメージの`-verify-config`                                     | 成功 | `config is valid`                                                              |
| `git diff --check`                                                     | 成功 | 最終差分                                                                       |

手書きproduction TS・TSXは、テスト、Story、E2E、migration、fixture、development補助を除き、
`+7,101 / -10,685`で3,584行の純減です。`apps/agent`は618行、`apps/api`は2,601行、
`apps/emulate`は506行の純減でした。

ローカルLGTMでは起動中Collectorと実装済みproduction moduleを使い、200・404・500、Agent成功、
モデル開始失敗・Web検索失敗を発生させました。生エラー`sentinel`は端末とLokiにだけあり、認証情報は
`[REDACTED]`、Tempo、Memory、テスト成果物にはありませんでした。Tempoには`app.error.code`、失敗状態、
HTTP route、request・trace・span IDが残りました。この確認はin-processと手動OTLPを含みますが、
PortlessからWrangler、実ブラウザーまでを通すfull-stack確認ではありません。

有料Agent評価と有料E2Eは明示承認がないため実行していません。本番配備とリモートDB操作も行っていません。

## リスクとrollback

### リスク

- Mastra標準Memoryの保存失敗が呼び出し元へ通知されず、完了表示後に履歴を失う場合がある。
- 招待メールのコールバック失敗やプロセス停止で、招待行だけが作成されメールが届かない場合がある。
- 公開エラー本文とorganizationのロールの破壊的変更が、Webやテストに部分的に残る可能性がある。
- Collectorの除去順序を誤るとTempoへ生エラーが残るか、調査に必要な固定属性まで失われる。
- 2ワーカーのE1が共有Emulator、認証、organization、threadを競合させる可能性がある。
- Lokiの保持期間を有効化した後、既存ボリュームの7日を超えるログが不可逆に削除される。

### rollback

後方互換層は作りません。公開契約と削除対象が相互依存するため、1つの協調したbreaking commitとして
まとめ、必要な場合はcommit全体を戻します。

- エラー契約はAPIとWebを同じ単位で戻し、旧本文だけを一時的に復活させる`adapter`は作らない。
- Memory切替は独自Workflowを削除する単位全体を戻す。標準Memoryと独自確定処理を同時に有効にしない。
- ロール・`outbox`マイグレーション適用前はコードとマイグレーションを戻す。適用後は既存履歴を編集せず、
  新しい前進マイグレーションまたは事前のDB `clone`から復元する。リモートDB変更は別承認を必要とする。
- Emulatorは`apps/emulate#dev`の実装単位を戻し、リポジトリルートの起動構成には触れない。
- ブラウザーテストの2ワーカー化で競合が残る場合は1ワーカーを維持し、分離不足を未完了として記録する。
- Lokiの保持期間は削除済みログを復元できない。変更前に共有ボリュームが開発用機密データであり、保持対象が
  ないことを確認する。

## 完了条件

- ADR-012、ADR-013と関連する正本文書、local skill、実装、テストが同じ契約を示す。
- アプリケーション所有の公開エラーが`error`、安全な`message`、任意の`fieldErrors`へ統一され、context、
  元エラーを失う再包装、二重`capture`がない。
- 生エラーが固定ローカルの端末・ブラウザー`console`とLokiだけにあり、Tempo、本番、リモート、Memory、
  テスト成果物にない。
- 独自Memory commit・スレッド名Agentと招待配送`outbox`が削除され、Mastra MemoryとBetter Authの
  標準経路が有効である。
- Luna reasoning、approval、認可、テナント境界、organization即時削除、Webの見た目が維持される。
- EmulatorがNext.js `adapter`のGitHubだけになり、リポジトリルートの`bun run dev`とプロセス構成が変わらない。
- Storybook・W6・E1が観測可能な状態で同期し、E1の2ワーカー反復または記録済みの未完了理由がある。
- テストと生成マイグレーションを除く手書き本番TS・TSXが差分全体で純減する。
- 必須検査に失敗がなく、差分レビュー後の再実行結果を検証証跡へ記録する。
- 本番配備、リモートDB変更、有料テストを実行していない。Git pushとPR作成は利用者の明示依頼に従う。
