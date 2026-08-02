---
id: ADR-012
title: Mastra MemoryとBetter Authの標準機能を独自耐久化より優先する
status: accepted
date: 2026-08-01
owners:
  - repository-maintainers
related:
  - ADR-006-migration-history-append-only.md
  - ADR-008-mastra-native-agent-runtime.md
---

# ADR-012 Mastra MemoryとBetter Authの標準機能を独自耐久化より優先する

## 背景

Agentの応答保存では、Mastra Workflowを回復記録として使い、Memory保存、業務DBの`run`精算、
スナップショット削除を独自に調停しています。招待メールでは、Better Authの招待処理の外側に配送用`outbox`、
再試行、定期処理、独自の一括招待と再送APIを実装しています。どちらもプロセス停止に対する強い
耐久性を得られる一方、フレームワークが持つ標準の保存・招待経路と同じ状態を別の層でも管理します。

このリポジトリでは、仕様を調整できる場合は保守するコード量を減らし、ライブラリやフレームワークの
標準的な利用方法を優先します。Agentの履歴を厳密に確定することや、招待メールを再試行によって必ず
配送することよりも、標準経路へ委譲して二重実装をなくすことを優先します。

## 決定

### Mastra Memory

- Product AgentのMemoryを読み取り専用にせず、Mastra標準の履歴保存とスレッド名生成を有効にする。
- ストリームは`@mastra/ai-sdk`の`handleChatStream`と
  `toAISdkMessages(..., { version: "v6" })`を標準境界にする。`v6`はAI SDKの導入版ではなく、
  Mastraが公開するUIMessage互換形式であり、AI SDK 7向けの独自変換を追加しない。
- `run` IDは`messageMetadata`、使用量と手順の精算はストリームの`onFinish`で伝える。
- 独自`memory-commit` Workflow、`canonical commit`、`reconciliation`、`drain`、独自のスレッド名Agentを
  削除する。通常のストリーム完了はMemory保存の厳密な完了を待たない。
- Memory内部で保存失敗が例外として返らない場合は、固定エラーコードを持つtraceで観測し、
  保存処理を横取りする独自処理を追加しない。
- message全体をアプリ独自スキーマへ写し替える全面的なsecurity projectionは置かない。Mastraと
  プロバイダーSDKが作る有効なreasoning、ツール入力・出力、approval、型付きprovider metadataを
  `MessageHistory`へ保存し、次のturnで使う。
- 例外として、標準`MessageHistory`で実測した`providerMetadata.mastra.modelOutput`だけを
  `memory-persistence-guard`で除去する。これはtoolの`toModelOutput`が現在のturnへ渡した生のメディアを
  Mastraがmetadataへ複製する値であり、次turnに不要な副本である。
- reasoning detailを含むprovider metadata、検証失敗を含むツール入力・出力、`file`、`source`、
  `source-document`、live streamは標準形式のまま保持する。保存前のcredential scannerや独自allowlistを
  追加しない。
- private URLやraw bytesは保存直前の一括変換ではなく、toolの返却値と一時的なmodel contextを作る
  境界で除外する。providerの生Errorとcauseは失敗したstreamからMemoryへ保存しない。
- browserへ返すhistoryだけをAI SDK v6互換messageから公開schemaへ変換し、provider metadata、
  `skill`本文、生のtool errorを除外する。この表示用変換をMemoryへ逆流させない。
- approval Workflow、opaque resume ticket、APIの認可・トランザクション・`run`精算は維持する。
- `AgentLibSQLStore`の独自回避処理は、標準`LibSQLStore.init()`を繰り返す試験で同じ初期化契約を
  満たすことを確認できた場合だけ削除する。

この決定は、ADR-008のうちWorkflowの`durable stage`を生成済み応答の線形化点とし、独自回復処理を
正しさの境界とした判断を置き換えます。専用Agent DB、Mastra Memoryを履歴の正本にする判断、業務DBの
認可台帳、DB認証情報の分離、読み取り時のAPI認可は置き換えません。

### Better Auth organization

- organizationのロールをBetter Auth標準の`owner`、`admin`、`member`へ統一し、`super_admin`を
  `owner`へ移行する。
- 招待は1回の送信につき1つのメールアドレスを受け取り、再送はBetter Auth標準の`resend` optionを使う。
- `sendInvitationEmail`コールバックから既存emailパッケージを呼ぶ。配送失敗によって招待作成を
  巻き戻さず、自動再試行もしない。
- 独自の一括招待・再送API、招待配送用`outbox`、定期処理、配送試行回数と配送状態を削除する。
- organizationの即時削除、テナント認可、監査、再認証済みセッション、冪等性は維持する。
- ロール変換、`owner`の一意制約、`outbox`テーブル削除は追記専用マイグレーションで行う。

## 理由

- Mastra MemoryとBetter Auth organizationの更新に追従する独自状態機械を減らせる。
- providerやAI SDKが正規に追加したmessage fieldを独自schema不一致で黙って失わず、次turnのcontextと
  調査可能性を維持できる。
- 標準保存で確認したprovider metadata、生のメディア、未検証ツール入力、model生成file、sourceの経路だけを
  閉じ、filterの保守範囲を固定できる。
- 書き込みの正本と失敗時の挙動が、それぞれのフレームワークの標準契約へ揃う。
- 独自の回復・配送経路に必要だったAPI、DB行、定期処理、テストを削除できる。
- approval、認可、テナント境界など製品固有の安全境界は、標準機能へ誤って委譲せず維持できる。

## 検討した代替案

- 独自durable commitを維持する: `SIGKILL`後の回復は強いが、Mastra Memoryと同じ保存状態を継続して
  調停する必要があるため採用しない。
- Memory保存を独自に横取りして失敗を例外化する: フレームワーク内部の実装へ依存し、更新時の
  保守範囲が再び広がるため採用しない。
- 招待`outbox`だけを維持する: Better Authの招待状態と配送状態の二重管理が残るため採用しない。
- 一括招待を単件招待のクライアント側反復として残す: 一部成功の新しい公開契約と再試行UIが必要に
  なるため、公開操作自体を単件へ変更する。

## 結果

- Agent履歴保存と招待メールは最善努力型になり、プロセス停止や一時的な配送障害で失われる場合がある。
- Memory保存前後の`SIGKILL`回復と、招待メールのat-least-once配送は受入条件から外れる。
- 独自スレッド名Agentの使用量を`run`単位で厳密に精算しない。
- 招待APIとroleは破壊的に変わる。後方互換層は作らず、公開前の契約を直接切り替える。
- 削除する本番コードが新規の接続コードより多いことを、実行計画の完了条件にする。

## 強制方法

- Product AgentのMemory設定、Mastra標準ストリーム境界、限定的な`outputProcessor`の不変条件を
  契約テストで固定する。
- `apps/agent`から独自`memory-commit`、回復journal、独自スレッド名Agentの実行入口を除去する。
- Better Auth organizationの標準クライアント・サーバーAPIだけをWebとAuthの接続境界にする。
- `super_admin`、招待配送`outbox`、独自一括招待・再送ルートの残存を静的検査とテストで検出する。
- 既存マイグレーションを変更せず、roleとテーブル変更を新しいマイグレーションへ閉じる。

## 検証

- 複数ターンのMemory保存・再読み込みと、許可済みOpenRouter `reasoning_details`の再送
- 有効なツール入力・出力、reasoning本文、approval、`skill`本文を保持すること
- `providerMetadata.mastra.modelOutput`の生のメディア副本だけを保存しないこと
- 検証失敗を含むツール入力・出力、provider metadata、`file`・`source`類、live streamを変更しないこと
- Memory保存失敗時のbest-effort動作と固定エラーコード付きtrace
- approvalの中断・再開、opaque ticket、API認可、使用量とrun精算
- ローカルTursoに対する`LibSQLStore.init()`の3並行呼び出しと同一instanceの反復初期化試験
- `owner`移行、一意制約、単件招待、標準再送、メールコールバック失敗、即時削除
- 新規DBと更新用フィクスチャに対するマイグレーション、`foreign_key_check`、`db:check`
- `bun run check`、`bun run test:browser`、`bun run test:e2e`、`bun run build:cloudflare`
