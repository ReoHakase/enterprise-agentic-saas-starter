---
id: PLAN-2026-030
title: GPT-5.6 Luna有料E2Eの強化
status: active
created: 2026-08-01
owners:
  - repository-maintainers
linked_specs:
  - ../../observability.md
  - ../../agent/testing.md
  - ../../agent/operations.md
  - ../../testing-strategy/e2e.md
  - ../../testing-strategy/common/ci-execution.md
linked_adrs:
  - ../../decisions/ADR-007-workspace-testing-strategy.md
  - ../../decisions/ADR-012-standard-memory-and-auth-delivery.md
  - ../../decisions/ADR-013-local-raw-errors-in-logs-only.md
---

# GPT-5.6 Luna有料E2Eの強化

## 目的

決定的E2Eの成功を前提に、製品と同じ`openai/gpt-5.6-luna`を使う有料E2Eを3本の
全構成カナリアテストへ整えます。実モデルによるWeb検索、非公開Issue読み取り、承認付きIssue作成、
再読み込み後の永続化を確認し、使用量APIから実行provider、model、run数、出力tokenの記録を証明します。
reasoning `xhigh`の送信はtransport test、許可済みOpenRouter `reasoning_details`の標準Memory保存と
存在時の再送はAgent契約testを正本にし、確率的なreasoning本文やtokenの非ゼロをE2の成功条件にしません。

失敗時のPlaywright出力は真偽値、件数、固定識別子、使用量の数値へ限定し、プロンプト全文、モデル出力、
非公開URL、`objectKey`、生のプロバイダーレスポンスをテスト出力や成果物へ残しません。

## 対象外

- プロンプト、tool schema、承認の認可・transaction契約の変更。実測で判明した標準reasoning設定、
  run全体deadline、resume runtime/storage所有権の修正は対象に含める
- ブラウザーなしの有料Agent評価`test:eval:agent`
- 本番配備、リモートDB操作、外部GitHub認証情報、実利用者データ
- video、trace、screenshot、HTMLまたはDOM成果物の有効化
- 画像理解を有料E2のrelease gateにすること。upload、変換、promotion、過去画像reuseは決定的E1、
  実providerのvisionは必要時の診断canaryへ分離する
- 再試行、ワーカー増加、タイムアウト延長による確率的失敗の隠蔽
- 新しい公開スクリプト、費用管理層、開発用ランチャーの追加

## 前提条件

- `409d269`のGitHub Actionsで`Free E2E`が6件、2ワーカーの構成で成功している。
- 利用者がGPT-5.6 Lunaを使う有料E2Eの実行と料金発生を明示承認している。
- `apps/agent/.env.local`はGit管理外であり、`OPENROUTER_API_KEY`の値を出力しない。
- `playwright.full.config.ts`の1ワーカー、再試行0、成果物無効、終了時の一時資源削除を維持する。
- 製品のモデル設定は`openrouter-gpt-5.6-luna-xhigh`、`openai/gpt-5.6-luna`、reasoning `xhigh`、
  max output 4,096 token、run全体270秒である。

## 変更対象path

```text
apps/web/e2e/full/real-agent.spec.ts
apps/web/e2e/fixtures/run-full-e2e.ts
apps/web/agent-e2e-environment.test.ts
apps/web/testing/agent-e2e-projection.ts
apps/agent/src/mastra/runtime/native-stream.ts
apps/agent/src/mastra/runtime/native-stream.test.ts
apps/agent/src/mastra/runtime/native-sse.test.ts
apps/agent/src/mastra/core/model-profile.ts
apps/agent/src/mastra/core/budget/context.test.ts
apps/agent/src/mastra/workflows/approved-issue-action/**
apps/agent/src/mastra/composition/runtime-composition.ts
apps/api/src/modules/agent/runtime-schema.ts
apps/api/src/modules/agent/runtime-schema.test.ts
apps/api/src/modules/agent/service.ts
apps/api/src/modules/agent/service.resume.test.ts
apps/api/src/platform/observability/**
apps/api/src/worker.ts
packages/db/src/schema/agent-runs.ts
packages/db/src/migrations/agent-luna-profile.test.ts
packages/db/src/migrations/upgrades.test.ts
packages/db/drizzle/**
docs/agent/README.md
docs/agent/testing.md
docs/agent/runtime-reliability.md
docs/agent/storage-memory.md
docs/agent/threads-context.md
docs/architecture/agent-runtime-and-mcp.md
docs/testing-strategy/e2e.md
docs/testing-strategy/agent-refactor-mcp.md
docs/observability.md
docs/exec-plans/active/agent-refactor-and-mcp.md
docs/exec-plans/README.md
docs/exec-plans/active/PLAN-2026-030-luna-paid-e2e-hardening.md
```

## 作業単位

1. `@diagnostic-qwen`と`PAID_E2E_DIAGNOSTIC`を削除し、3本を標準の有料カナリアテストにする。
2. API応答を安全な真偽値、件数、固定値へ変換してから検証し、失敗出力へ非公開本文を含めない。
3. 読み取り経路へ再読み込み、Lunaのprovider、model、run数、出力token記録の検証を追加する。
   標準`MessageHistory`のreasoning detail再送と、`memory-persistence-guard`による
   `providerMetadata.mastra.modelOutput`の生のメディア副本除去はAgent契約テストで保証し、Mastraの
   内部DBは直接読みません。
4. 承認付き書き込み経路で承認前後のDB状態とreceipt由来Issueの永続化を確認する。
5. 無料の単体・設定検査を先に実行し、明示承認済みの有料E2EをPlaywrightの再試行なしで実行する。
   実測で配線不具合が判明した場合は原因を決定的テストへ固定してから再実行する。
6. context上限、新規run snapshot、API入力上限を4,096 tokenのreserved output契約へ揃え、
   Lunaの標準reasoning `xhigh`と270秒の総deadlineを使用する。
7. 承認resumeはrequestごとに専有の標準`LibSQLStore`とMastraを作り、同じDB snapshotをresumeする。
   APIの50秒deadlineとcaller signalをticket消費前・write直前に検査し、timeoutは
   `service_unavailable`と`Retry-After: 30`へ固定する。Storage closeはresponseから分離して
   `waitUntil`で実行し、rejectまたは2秒timeoutをraw causeなしの`resume_storage_close_failed`で記録する。
8. 仕様と旧計画の一時的なQwen例外を現在のLuna契約へ揃え、検証証跡を残す。
9. `AGENT_E2E_OBSERVABILITY=1`のときだけAPIと実Agentを固定local OTLPへ接続し、E2 markerでraw causeを
   抑止したままLokiのrequest/trace IDからTempoへ辿れることを確認する。
10. テスト実装と文書を論理的なコミットへ分け、既存PRを更新して最新HEADのCI成功を確認する。

## 進捗

- [x] 修正後HEADで決定的`Free E2E`の成功を確認した。
- [x] 現行の有料E2E、モデル設定、成果物、シークレット、終了処理を読み取り専用で監査した。
- [x] 3本のLunaカナリアテストを機密情報を含まない検証へ更新する。
- [x] 無料の単体・設定検査を成功させる。
- [x] 明示承認済みの有料E2Eを1回成功させる。
- [ ] 正本文書、既存PR、最終CIを現在の実行結果へ揃える。

## 判断記録

| 日付       | 判断                                                                  | 理由                                                                                                        |
| ---------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 2026-08-01 | Qwen向け診断用除外を削除し、Lunaだけの3本へ揃える                     | 製品とE2のprovider、model、version、reasoningを一致させるため                                               |
| 2026-08-01 | 画像のrelease gateはE1/APIへ置き、有料visionは診断canaryへ分離する    | 実Luna visionは同じ入力でもno-token timeoutが再現し、tool・approvalとの直積を安定したgateにできないため     |
| 2026-08-02 | 全面的なsecurity projectionを36行のpersistence guardへ縮小する        | 認証済みMemoryへ標準messageを保ち、Mastraが複製する生のメディア副本だけを除去するため                       |
| 2026-08-02 | 標準`generateTitle`へ独自sanitizerを追加しない                        | 同じuser message由来のtitleへcredentialが復唱され得る残余riskより、標準Memory経路と保守量削減を優先するため |
| 2026-08-01 | API本文を文字列化せず、安全な表示用変換だけをPlaywrightの検証値へ渡す | 検証失敗時にもプロンプト、モデル出力、非公開データを標準出力へ出さないため                                  |
| 2026-08-01 | 使用量APIでprovider、model、run数、出力token記録を検証する            | providerはreasoningを返さないrunも正規であり、非ゼロreasoningをモデル配線の証明にしないため                 |
| 2026-08-01 | 有料E2は1 suite、3本、1ワーカー、再試行0で実行する                    | 代表配線を確認しつつ、費用と確率的失敗をretryで隠さないため                                                 |
| 2026-08-01 | HTTP stream開始ではなく`Send`再有効化を終了状態として待つ             | UIが観測できるterminal stateまで正規runを切断しないため                                                     |
| 2026-08-01 | 独自useful-output watchdogを削除し、270秒の総deadlineだけを残す       | reasoning/text/toolの分類をframework標準streamへ委譲するため                                                |
| 2026-08-02 | Lunaを基準commitどおりreasoning `xhigh`、max output 4,096 tokenへ戻す | E2安定化のために製品profileを弱めず、既存のreasoning表示契約を維持するため                                  |
| 2026-08-01 | approval resumeは専有のMastraとfresh `LibSQLStore`を使う              | isolate runtime再利用はWorkers request scopeで失敗し、storage共有は所有者を上書きするため                   |
| 2026-08-01 | Memory履歴を承認前の同期barrierにしない                               | Mastra標準のbest-effort保存を維持し、UI承認とDB非mutationの重複assertionを避けるため                        |
| 2026-08-01 | E2のOTLPは明示opt-inにし、raw causeはE2 markerで常に止める            | 通常CIをLGTMへ依存させず、local調査では固定code/statusと相関IDだけを安全に保存するため                      |

## 検証証跡

| commandまたは検査                        | 結果   | 証跡                                                                                                                                                  |
| ---------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Actions `Free E2E` at `409d269`   | 成功   | 4分38秒。決定的E2E 6件、2ワーカー                                                                                                                     |
| GitHub Actions `Browser · UI components` | 成功   | Playwright 1.61.1へ揃えた修正後HEADで2分3秒                                                                                                           |
| Agent runtimeの全検査                    | 成功   | 41 files、308 tests。標準Memoryのpersistence guardと実Storage再読込を含む                                                                             |
| 修正後`bun run test:e2e`                 | 成功   | 58.1秒。6件、2ワーカー。approval、画像lifecycle、OAuth、WebAuthnを含む                                                                                |
| Luna `medium` 有料E2 第1回               | 要修正 | 読取29.1秒、write13.6秒。画像は46.1秒でMemory同期assertionだけ失敗                                                                                    |
| Luna `medium` 有料E2 第2回               | 要修正 | 読取23.6秒、write17.7秒。画像reasoningが270秒の固定総deadlineへ到達                                                                                   |
| Luna `low` 診断用有料E2                  | 成功   | Web検索19.1秒、Issue read 9.7秒、承認write 11.6秒。製品profileの完了証跡には使わない                                                                  |
| E1 local LGTM相関                        | 成功   | session `agent-e2e-880114`。404の`not_found` 3件以外にERRORなし、raw detail 0件                                                                       |
| Luna `xhigh` 有料E2 + local LGTM         | 成功   | session `agent-e2e-880116`。3件を60秒、1ワーカー、再試行0で完了。Loki 2,294件とTempo 145 tracesでERROR・raw detail・credential 0件、API/Agent相関23本 |
| `bun run check`                          | 成功   | sandboxのlistener制限を除いた通常環境で12 workspace全検査が成功                                                                                       |
| `bun run build:cloudflare`               | 成功   | Web、API、Agentの3 dry-run bundle                                                                                                                     |
| DB generate/check                        | 成功   | `db:generate`はschema変更なし、migration history・snapshot・schema drift成功                                                                          |
| 更新後HEADのGitHub Actions               | 未実施 | 無料の全検査を再実行する                                                                                                                              |

## リスクと切り戻し

実モデルのtool選択、OpenRouter障害、rate limitは確率的です。失敗時は同じコマンドを即時再実行せず、
固定コード、ツール状態、DB件数、使用量の範囲で原因を分類します。安全境界または配線の不具合は下位の
決定的テストへ回帰させ、モデル挙動はブラウザーなしのG5へ小さく移します。

差分は有料E2のテスト、ランナー選択処理、Agentのlivenessと出力予算、文書です。
切り戻しは対応するruntime、テスト、文書コミットを個別にrevertします。検討中だった`low` default用の
未commit migrationはDrizzleの所有commandで破棄し、schemaと既存runを変更していません。本番データ、
リモート資源へ切り戻し操作を行いません。

## 完了条件

- 3本のカナリアテストがLunaの標準有料E2として列挙され、診断用の省略条件が残らない。
- 検証失敗時の値へプロンプト、モデル出力、非公開URL、`objectKey`、生レスポンスを渡さない。
- 無料の単体・設定検査と、明示承認済み有料E2 3件が再試行なしで成功する。
- 正本文書と既存の実行計画がWeb検索、非公開Issue read、承認付きIssue writeの3件へ一致する。
- opt-inした有料E2のAPI/Agent logをLokiで絞り、trace IDをTempoで確認でき、E2 sessionにraw causeがない。
- 論理的な複数コミットで既存PRを更新し、最新HEADの無料CIが全件成功する。
- 本計画の検証証跡を更新し、`completed/`へ移す。
