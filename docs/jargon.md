---
title: 日本語技術文書の用語・表記基準
status: accepted
implementation: active
last_reviewed: 2026-08-01
applies_to:
  - AGENTS.md
  - docs/**/*.md
  - .agents/local-skills/**/*.md
---

# 日本語技術文書の用語・表記基準

## 目次

- [目的](#目的)
- [対象範囲](#対象範囲)
- [適用状態](#適用状態)
- [表記の原則](#表記の原則)
- [英語表記を維持する語](#英語表記を維持する語)
- [日本語表記へ統一する語](#日本語表記へ統一する語)
- [文脈で表記を変える語](#文脈で表記を変える語)
- [書き換え例](#書き換え例)
- [Codex向け確認手順](#codex向け確認手順)
- [機械検査を追加する場合](#機械検査を追加する場合)
- [受入条件](#受入条件)

## 目的

日本語の技術文書へ必要性のない英単語が混ざり、意味、責任範囲、操作条件が不明瞭になることを防ぎます。

避ける例:

```text
P2 findingはwaiver ownerとexpiryをrequiredにする。
```

推奨例:

```text
P2の指摘を例外承認する場合は、承認者と有効期限を必須にする。
```

英語表記を全面的に禁止するものではありません。次の場合は英語を維持します。

- コード、設定値、パスと一致させた方が理解しやすい
- 製品や標準の正式名称である
- 新しい概念で日本語訳が定着していない

判断基準は、英語の方が見栄えがよいかではなく、英語表記によって技術的な精度や検索性が上がるかです。

## 対象範囲

適用対象:

- `AGENTS.md`
- `docs/**/*.md`
- `.agents/local-skills/**/*.md`
- PR、GitHub issue、レビューコメントの日本語技術説明

適用対象外:

- 変数名、型名、関数名、クラス名
- ファイル名、ディレクトリ名、パッケージ名
- コマンド、オプション、設定キー、設定値
- コードコメント
- API、HTTPヘッダー、JSONフィールド
- 外部文書からの引用

コードコメントの言語はこの文書では規定しません。この文書は日本語技術文書だけを対象にします。

## 適用状態

この文書の`status: accepted`はリポジトリ管理者が最終内容を承認済みであること、
`implementation: active`は文書、skill、機械検査へ反映済みであることを表します。
[知識管理](architecture/knowledge-management.md)の切替手順に従い、この状態を含む変更が`main`へ
マージされた時点でリポジトリの正本として有効になります。未マージのブランチでは、現在の`main`に
ある承認済み仕様を通常変更の正本として優先します。

## 表記の原則

### 判断順序

英単語を書こうとした場合は、次の順序で判断します。

1. コード識別子、パス、コマンド、設定値そのものか
   - 原文を維持し、原則としてインラインコードにする
2. 製品名、標準名、正式な機能名か
   - 正式表記を維持する
3. コード上の概念と一対一で対応するか
   - 英語表記を維持できるが、初出で意味を日本語で説明する
4. 定着したカタカナ表記があるか
   - カタカナ表記を使う
5. 自然な日本語へ置き換えられるか
   - 日本語へ置き換える
6. 日本語訳が定着していない新しい概念か
   - 英語表記を維持し、初出で意味を説明する
7. 判断できない場合
   - 日本語を優先する

逆に、漢数字は漢字熟語内のもの以外は原則、算用数字に置き換える。

### 用語定義と文章表記の優先順位

[命名とlayer](architecture/naming-and-layers.md)は、アーキテクチャ用語の意味、責務、依存方向を
定義します。この文書は、その用語を日本語文章の中でどう表記し、どう説明するかを定義します。

命名とlayerで固定した`port`、`adapter`、`scripted model`などの技術用語は、別の日本語名へ
置き換えません。原文をインラインコードで維持し、初出で意味を日本語で説明します。固定された
技術用語ではない一般語だけを、この文書の対照表に従って日本語または定着したカタカナ表記へ
置き換えます。

### 書式

コードと対応する英語概念は、原則としてインラインコードにします。

```md
`port`は、アプリケーションが外部機能へ要求する契約です。
`adapter`は、その契約を特定技術へ接続する実装です。
```

製品名にはインラインコードを使いません。

```md
VitestのBrowser Modeを使う。
```

日本語の文章へ英語の動詞や形容詞を混ぜません。

```text
避ける: current diffをreviewする
推奨: 現在の差分をレビューする
```

英単語を`/`で連結しません。

```text
避ける: lint/typecheck/test gate
推奨: lint、型検査、テストによる必須検査
```

## 英語表記を維持する語

### コードと対応する概念

| 表記               | 維持する条件                                        | 意味                                                            |
| ------------------ | --------------------------------------------------- | --------------------------------------------------------------- |
| `port`             | `ports.ts`、型、引数と対応する                      | 内側の層が外部機能へ要求する契約                                |
| `adapter`          | `adapters/`、実装型と対応する                       | `port`を特定技術へ接続する実装                                  |
| `composition root` | 依存を組み立てる場所を指す                          | `port`と`adapter`を接続する合成起点                             |
| `View`             | コンポーネント名や接尾辞と対応する                  | 状態と操作を受け取って表示するコンポーネント                    |
| `controller`       | `use-*-controller.ts`などと対応する                 | 副作用と`View`を接続する制御処理                                |
| `mock`             | テストコード上のmockを指す                          | 呼び出しや戻り値を制御するテストダブル                          |
| `fake`             | 動作する軽量実装を指す                              | 本物より単純だが実際に動作する代替実装                          |
| `stub`             | 固定応答を返す実装を指す                            | 決められた値を返すテストダブル                                  |
| `spy`              | 呼び出し観測用の実装を指す                          | 処理を変えず呼び出しを記録する観測手段                          |
| `scripted model`   | Agentのテスト設計と`scripted-model.ts`を指す        | 指定されたモデル出力を順番に返す決定的な`LanguageModel`の`fake` |
| `light`            | テーマ値やプロジェクト名と対応する                  | `light`テーマ                                                   |
| `dark`             | テーマ値やプロジェクト名と対応する                  | `dark`テーマ                                                    |
| `dialog`           | ARIA `role`、コンポーネント名、ロケーターと対応する | `dialog` roleまたは`Dialog`コンポーネント                       |
| `hook`             | Reactの`hook`、設定名と対応する                     | 対象製品の正式な`hook`概念                                      |
| `play`             | Storybookの`play`関数を指す                         | story上で実行する操作テスト                                     |
| `query`            | TanStack Queryの概念や識別子を指す                  | 取得処理としての`query`                                         |
| `mutation`         | TanStack Queryの概念や識別子を指す                  | 更新処理としての`mutation`                                      |

一般的な説明では日本語へ戻します。

```text
`dialog` roleを検証する。
確認ダイアログを表示する。

`query`を無効化する。
データベースへクエリを送る。
```

### 日本語訳が定着していない概念

| 表記            | 使用条件                                           | 初出での説明                                           |
| --------------- | -------------------------------------------------- | ------------------------------------------------------ |
| `harness`       | エージェントの実行環境、制約、検証機構の集合を指す | エージェントの行動を外側から制御する実行・検証機構     |
| `outbox`        | `outbox`パターンを指す                             | 業務更新と配送予約を同じトランザクションへ保存する方式 |
| `fencing token` | 古いワーカーの更新拒否に使う                       | 古い実行主体による上書きを防ぐ識別値                   |
| `capability`    | オブジェクトケイパビリティ方式の権限証票を指す     | 保有者へ限定的な権限を与える証票                       |
| `worktree`      | Gitの`worktree`そのものを指す                      | 同一リポジトリから作る別作業ツリー                     |
| `skill`         | Codexの仕組みと`SKILL.md`を指す                    | 必要時に読み込む作業手順と知識                         |

一般的な能力を`capability`、一般的な技能を`skill`と書きません。

### 正式名称

次は正式表記を維持します。

- Codex
- GitHub Actions
- Cloudflare Workers
- Service Binding
- Next.js
- React
- Server Component
- Client Component
- App Router
- Error Boundary
- Vitest
- Browser Mode
- Playwright
- Storybook
- Elysia
- Eden
- Drizzle
- Turso
- Better Auth
- Mastra
- OpenRouter
- Oxlint
- Oxfmt
- Knip
- jscpd
- Sentry
- Spotlight

### 略語

次は一般に定着した略語として維持できます。

```text
API  DB  CI  E2E  VRT  RSC  LLM  MCP  ADR  PR
HTTP  SQL  FK  PII  CORS  CSRF  OAuth
```

APIやHTTPのように対象読者へ十分定着している略語を除き、各文書の初出で正式名称と役割を説明します。
特にRSC、VRT、MCP、ADRは、略語だけで意味を推測させません。

## 日本語表記へ統一する語

### 一般的な判断・運用語

| 避ける表記             | 推奨表記               |
| ---------------------- | ---------------------- |
| `waiver`               | 例外承認               |
| `waive`                | 例外として承認する     |
| `mitigate`             | 緩和する               |
| `mitigation`           | 緩和策                 |
| `finding`              | 指摘                   |
| `severity`             | 重大度                 |
| `rationale`            | 理由、根拠             |
| `scope`                | 対象範囲               |
| `goal`                 | 目的                   |
| `non-goal`             | 対象外                 |
| `evidence`             | 検証結果、実行証跡     |
| `enforcement`          | 強制方法、強制手段     |
| `owner`                | 担当者、責任者、承認者 |
| `required`             | 必須                   |
| `optional`             | 任意                   |
| `fallback`             | 代替経路、縮退手順     |
| `rollout`              | 導入                   |
| `cutover`              | 切替                   |
| `one-shot`             | 一括                   |
| `checkpoint`           | 中間確認、中間コミット |
| `baseline`             | 基準値、基準画像       |
| `threshold`            | 閾値                   |
| `budget`               | 上限、予算             |
| `drift`                | 不整合、ずれ           |
| `flaky`                | 不安定、再現性が低い   |
| `current`              | 現在の                 |
| `fresh`                | 新しい、新規           |
| `read-only`            | 読み取り専用           |
| `write`                | 書き込み               |
| `sole writer`          | 単一書き込み担当       |
| `independent review`   | 独立レビュー           |
| `policy`               | 方針、規則             |
| `gate`                 | 必須検査、判定         |
| `guardrail`            | 安全策、制約           |
| `artifact`             | 成果物                 |
| `bundle`               | 一式、バンドル         |
| `deliverable`          | 成果物                 |
| `attestation`          | 実行証跡、証明         |
| `probe write`          | 試験書き込み           |
| `compensating control` | 代替安全策             |
| `failure path`         | 失敗経路               |
| `missing test`         | 不足しているテスト     |
| `required fix`         | 必須修正               |
| `compatibility`        | 互換性                 |
| `proposed`             | 提案中                 |
| `accepted`             | 承認済み               |
| `superseded`           | 置換済み               |
| `planned`              | 計画済み               |
| `deferred`             | 延期                   |
| `active`               | 有効、実施中           |

前付けメタデータや設定値に使う`proposed`、`accepted`、`deferred`などは原文を維持します。本文中の状態説明だけを日本語にします。

### 定着したカタカナ/漢字表記

次の表は一般説明で使う表記です。ディレクトリ、型、レイヤー名などコード上の概念を正確に指す場合は、
原文をインラインコードにし、初出で日本語の意味を説明します。例えば`domain`ディレクトリを説明する
場合は`domain`を維持できますが、一般的な説明では「ドメイン層」と書きます。

| 避ける表記        | 推奨表記         | 避ける表記      | 推奨表記               |
| ----------------- | ---------------- | --------------- | ---------------------- |
| `tenant`          | テナント         | `database`      | データベース           |
| `application`     | アプリケーション | `domain`        | ドメイン               |
| `repository`      | リポジトリ       | `service`       | サービス               |
| `component`       | コンポーネント   | `workspace`     | ワークスペース         |
| `package`         | パッケージ       | `module`        | モジュール             |
| `model`           | モデル           | `schema`        | スキーマ               |
| `framework`       | フレームワーク   | `runtime`       | ランタイム             |
| `browser`         | ブラウザー       | `server`        | サーバー               |
| `client`          | クライアント     | `provider`      | プロバイダー           |
| `plugin`          | プラグイン       | `callback`      | コールバック           |
| `handler`         | ハンドラー       | `session`       | セッション             |
| `token`           | トークン         | `cache`         | キャッシュ             |
| `thread`          | スレッド         | `context`       | コンテキスト           |
| `prompt`          | プロンプト       | `tool`          | ツール                 |
| `stream`          | ストリーム       | `route`         | ルート                 |
| `layout`          | レイアウト       | `focus`         | フォーカス             |
| `theme`           | テーマ           | `error`         | エラー                 |
| `request`         | リクエスト       | `response`      | レスポンス             |
| `contract`        | 契約             | `fixture`       | フィクスチャ           |
| `runner`          | ランナー         | `coverage`      | カバレッジ             |
| `query`           | クエリ           | `migration`     | マイグレーション       |
| `transaction`     | トランザクション | `rollback`      | ロールバック           |
| `index`           | インデックス     | `trigger`       | トリガー               |
| `snapshot`        | スナップショット | `journal`       | ジャーナル             |
| `manifest`        | マニフェスト     | `branch`        | ブランチ               |
| `commit`          | コミット         | `merge`         | マージ                 |
| `review`          | レビュー         | `reviewer`      | レビュアー             |
| `sandbox`         | サンドボックス   | `agent`         | エージェント           |
| `subagent`        | サブエージェント | `workflow`      | ワークフロー           |
| `release`         | リリース         | `production`    | 本番                   |
| `development`     | 開発             | `staging`       | ステージング           |
| `temporary`       | 一時             | `generated`     | 生成済み、生成ファイル |
| `duplicate`       | 重複             | `unused`        | 未使用                 |
| `behaviour`       | 振る舞い         | `validation`    | 検証                   |
| `normalisation`   | 正規化           | `serialisation` | 直列化                 |
| `deserialisation` | 逆直列化         | `sanitisation`  | 無害化                 |

### コード品質とテスト

| 避ける表記               | 推奨表記               |
| ------------------------ | ---------------------- |
| `dead code`              | 未使用コード           |
| `duplicate code`         | 重複コード             |
| `complexity`             | 複雑度                 |
| `cyclomatic complexity`  | 循環的複雑度           |
| `nesting depth`          | ネスト深度             |
| `line length`            | 行長                   |
| `function size`          | 関数の大きさ           |
| `quality gate`           | 必須品質検査           |
| `unit test`              | 単体テスト             |
| `integration test`       | 統合テスト             |
| `browser test`           | ブラウザーテスト       |
| `contract test`          | 契約テスト             |
| `migration test`         | マイグレーションテスト |
| `visual regression test` | 視覚回帰テスト         |
| `smoke test`             | スモークテスト         |
| `canary test`            | カナリアテスト         |
| `test matrix`            | テスト対応表           |
| `test suite`             | テスト一式             |
| `test case`              | テストケース           |
| `dataset`                | データセット           |
| `eval`                   | 評価                   |
| `scorer`                 | 評価器                 |
| `retry`                  | 再試行                 |
| `timeout`                | タイムアウト           |
| `skip`                   | 省略                   |
| `real model`             | 実モデル               |
| `free E2E`               | 無料E2E                |
| `paid E2E`               | 有料E2E                |
| `full-stack E2E`         | 全構成E2E              |
| `provider contract eval` | プロバイダー契約評価   |

スクリプト名、ファイル接尾辞、設定プロジェクト名に含まれる`test`、`eval`、`browser`などは原文を維持します。

`scripted model`は実LLMではなく、テスト専用の決定的な`LanguageModel`の`fake`です。
各テストが指定する順序付きイベント列に従い、テキスト、ツール呼び出し、ストリーム断片、遅延、
中断、使用量、壊れたイベント、エラーを返します。プロンプト、ツールスキーマ、ツール実行器は
本番と同じコードを通し、モデル応答だけを制御します。

VitestではAgent factoryへ直接注入し、全構成E2Eではテスト専用の別Workerだけへ注入します。
本番Worker、本番バンドル、環境変数による切替からは到達不能にします。これは全面移行で
`apps/agent/src/mastra/test-support/scripted-model.ts`へ追加する計画であり、現時点では
未実装です。`scripted model`という固定名称と、ファイル名や型名は原文を維持します。

### セキュリティ、API、データベース

| 避ける表記              | 推奨表記                           |
| ----------------------- | ---------------------------------- |
| `authentication`        | 認証                               |
| `authorisation`         | 認可                               |
| `permission`            | 権限                               |
| `tenant isolation`      | テナント分離                       |
| `cross-tenant`          | テナント横断                       |
| `multi-tenant`          | マルチテナント                     |
| `secret`                | 機密情報、シークレット             |
| `credential`            | 認証情報                           |
| `redaction`             | マスキング、除去                   |
| `trusted`               | 信頼済み                           |
| `untrusted`             | 未信頼                             |
| `unsafe`                | 危険、未検証                       |
| `fail-closed`           | 失敗時は拒否する                   |
| `fail-fast`             | 早期に失敗させる                   |
| `replay`                | 再利用、再実行攻撃                 |
| `destructive operation` | 破壊的操作                         |
| `idempotency`           | 冪等性                             |
| `race condition`        | 競合状態                           |
| `monitoring`            | 監視                               |
| `observability`         | 可観測性                           |
| `telemetry`             | テレメトリー                       |
| `metric`                | メトリクス                         |
| `sampling`              | サンプリング                       |
| `row`                   | 行                                 |
| `column`                | 列                                 |
| `table`                 | テーブル                           |
| `foreign key`           | 外部キー                           |
| `unique constraint`     | 一意制約                           |
| `check constraint`      | 検査制約                           |
| `backfill`              | 既存データ補完                     |
| `fresh database`        | 新規データベース                   |
| `legacy data`           | 旧形式データ                       |
| `migration ledger`      | マイグレーション台帳               |
| `append-only`           | 追記専用                           |
| `schema drift`          | スキーマとマイグレーションの不整合 |
| `migration behaviour`   | マイグレーションの動作             |
| `upgrade path`          | 更新経路                           |
| `seed`                  | 開発用初期データ投入               |
| `reset`                 | リセット、作り直し                 |

コマンド名は原文を維持します。

```text
`db:seed`で開発用初期データを投入する。
`db:reset`でローカルデータベースを作り直す。
```

## 文脈で表記を変える語

| 語           | コードや正式概念を指す場合         | 一般説明の場合                           |
| ------------ | ---------------------------------- | ---------------------------------------- |
| `feature`    | `features/`、`feature`単位         | 機能                                     |
| `module`     | `modules/`、ES module              | モジュール                               |
| `test`       | スクリプト、接尾辞、プロジェクト名 | テスト                                   |
| `lint`       | コマンド、ルール、スクリプト名     | 静的検査                                 |
| `import`     | JavaScript構文、Oxlintルール       | `import`と表記し、インラインコードにする |
| `public`     | 修飾子、`export`、フィールド名     | 公開                                     |
| `private`    | 修飾子、フィールド名               | 非公開                                   |
| `source`     | フィールド名、`stream part`        | ソースコード、情報源                     |
| `root`       | オプション、識別子                 | リポジトリルート                         |
| `strict`     | モード、オプション、設定値         | 厳格、厳しい                             |
| `raw`        | フィールド名、型名                 | 生の、未加工の                           |
| `live`       | コード名                           | 現在有効な                               |
| `canonical`  | コード名                           | 正規、正本、標準                         |
| `projection` | コード名                           | 表示用変換、集計、API形式への変換        |

例:

```text
`features/issues/`はIssue機能を所有する。
別ワークスペースの内部パスから直接`import`しない。
現在有効なセッションを再検証する。
生のプロバイダー応答をログへ保存しない。
```

## 書き換え例

### Codexと文書運用

| 避ける文章                                  | 推奨文章                                   |
| ------------------------------------------- | ------------------------------------------ |
| implementationとreviewを別contextへ分離する | 実装とレビューを別のコンテキストへ分離する |
| deterministic gateを通す                    | 決定的な必須検査を通す                     |
| findingをseverity順にまとめる               | 指摘を重大度順にまとめる                   |
| P2だけwaiver可能                            | P2だけ例外承認できる                       |
| compensating testまたはmonitoringを要求する | 代替テストまたは監視を要求する             |
| current diffをreviewする                    | 現在の差分をレビューする                   |
| review evidenceをplanへ残す                 | レビュー実行証跡を実行計画へ残す           |

### コード構成

| 避ける文章                                       | 推奨文章                                                   |
| ------------------------------------------------ | ---------------------------------------------------------- |
| application serviceはrepository portをinjectする | アプリケーションサービスは`repository port`を受け取る      |
| domain layerはframework-independentにする        | ドメイン層をフレームワーク非依存にする                     |
| transportからrepository adapterを直接callしない  | トランスポート層から`repository adapter`を直接呼び出さない |
| component boundaryでside effectをisolateする     | コンポーネント境界で副作用を隔離する                       |
| workspace間のdeep importをbanする                | ワークスペース間の内部パスへの直接`import`を禁止する       |
| public surfaceをminimiseする                     | 公開APIを最小限にする                                      |
| legacy zoneをexcludeしない                       | 旧配置領域を検査対象から除外しない                         |

### 品質、テスト、データベース

| 避ける文章                               | 推奨文章                                         |
| ---------------------------------------- | ------------------------------------------------ |
| production codeのcomplexity budget       | 本番コードの複雑度上限                           |
| pure layerはstrictにする                 | 純粋なレイヤーにはより厳しい上限を適用する       |
| baseline fileやwarning ratchetを作らない | 基準値ファイルや警告数の悪化禁止方式を採用しない |
| full suiteをrunする                      | 全テストを実行する                               |
| flaky timingをreviewする                 | 不安定な時間依存をレビューする                   |
| real-model provider eval                 | 実モデルを使うプロバイダー契約評価               |
| free full-stack E2E                      | 無料の全構成E2E                                  |
| paid browser canary                      | 有料ブラウザーカナリアテスト                     |
| migration behaviourを検証する            | マイグレーションの動作を検証する                 |
| schema driftを検出する                   | スキーマとマイグレーションの不整合を検出する     |
| fresh DBへmigrationをapplyする           | 新規DBへマイグレーションを適用する               |
| legacy fixtureをloadする                 | 旧形式のフィクスチャを読み込む                   |
| backfill後にconstraintをaddする          | 既存データを補完した後に制約を追加する           |

### Web

| 避ける文章                           | 推奨文章                                              |
| ------------------------------------ | ----------------------------------------------------- |
| light/darkで同じinteractionをrunする | `light`テーマと`dark`テーマで同じ操作テストを実行する |
| dialogのfocus behaviourをtestする    | `dialog`のフォーカス動作をテストする                  |
| component stateをmockする            | コンポーネント状態を`mock`する                        |
| query invalidation後にrefetchする    | `query`の無効化後に再取得する                         |
| stale propでformをresetしない        | 古い`props`でフォームをリセットしない                 |
| browser-only APIをuseする            | ブラウザー固有APIを使う                               |

## Codex向け確認手順

### 作成前

1. コード識別子、設定値、製品名として維持する語を確認する
2. コード概念として英語を維持する語を確認する
3. それ以外は日本語で書く前提にする

### 作成中

1. 英語の動詞と形容詞を日本語文へ混ぜない
2. コードと対応する英語概念はインラインコードにする
3. 定着したカタカナ表記を生の英語に戻さない
4. 一般語を英語にして文章を短く見せない
5. 同じ概念へ複数の表記を使わない
6. `/`で英単語を連結しない

### 完了前

次の語を検索し、コード、正式名、引用以外の使用を見直します。

```text
waiver mitigate mitigation finding severity rationale scope evidence
 enforcement rollout cutover checkpoint fallback drift flaky current fresh
 read-only sole-writer full free paid real production temporary required
 optional generated duplicate unused behaviour validation
```

次の語も、生の英語ではなくカタカナまたは日本語になっていることを確認します。

```text
tenant database application domain repository service component workspace
 package module runtime browser provider session token cache thread context
 prompt tool migration transaction
```

検索結果がコードブロック、インラインコード、前付けメタデータの値、パス、コマンド、製品名に含まれる場合は変更しません。

## 機械検査を追加する場合

単純な`grep`だけで禁止すると、コードブロック、パス、設定値、この用語集の対照表を誤検出します。

機械検査を追加する場合はMarkdownを構文解析し、次を除外します。

- フェンス付きコードブロック
- インラインコード
- リンクURL
- 前付けメタデータの列挙値
- 正式名称の許可リスト
- ファイルパスとコマンド
- この用語集の対照表

最初は候補の報告だけにし、誤検出率を確認してから必須検査へ昇格します。

## 受入条件

- 一般語を不必要に英語表記しない
- `tenant`、`database`、`application`などを生の英語で書かない
- `port`、`adapter`、`mock`など、コードと一致させる語だけを英語で維持する
- 英語を維持する新しい概念は、初出で日本語による意味を説明する
- コード識別子、製品名、設定値を誤って翻訳しない
- 同じ概念の表記を文書全体で統一する
- `AGENTS.md`または関連`skill`からこの文書を参照する
