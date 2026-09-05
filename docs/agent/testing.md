---
title: 製品Agentのtestとrelease gate
status: accepted
implementation: active
last_reviewed: 2026-09-05
---

# Testとrelease gate

## 保証範囲

Agent releaseは次の3層を分離します。

1. deterministic core: G1-G4でschema、tenant、capability、query guard、idempotency、stream projection
2. browser feature integration: W3、W4、W6とE1でUI state、TanStack Startのルートライフサイクル、Cookie、Worker/Service Binding配線
3. probabilistic verification: G5は全指定caseを独立stateで3/3、E2は固定canaryを各1回完了すること

LLMの回答文面一致はassertしません。tool call、tool inputの安全性、DB state、canonical stream part、approval state、Issue link、usage eventをassertします。

## Deterministic suite

### DB / API

- migrationのfresh/upgrade、既存row保持、trigger整合性
- thread所有者/tenant境界、message count、更新順とID tie break
- thread作成時の`permissionMode`既定値、明示的Full access、invalid mode拒否、session/user/organization/context epoch境界、threadと初期permissionのtransaction整合性
- Mastra標準title生成失敗時の既定title維持と最大80文字
- context compaction threshold、最新12 message、summary idempotency
- usage event idempotency、daily projection、price version切替、admin境界
- historical approval GETは現在ownerで読め、decision/resumeは元scope外で拒否
- mention/page/file/memberのserver再解決とcross-tenant拒否
- `get_issue`添付pagination、pending除外、file所有者/tenant境界、metadata projection
- Issue画像private routeの対応形式、変換条件、unknown-length 4 MiB fence、quota冪等性、private/no-store header

### Agent

- 現在のメッセージ、履歴、Issue、ページコンテキスト、ツール結果からWeb検索の必要性だけを判断する
- 現在の発話がWeb検索を明示的に依頼し、公開情報だけの検索語が独立した1行にある場合だけ、最初のmodel stepで`web_search`を必須選択する
- 保存済みユーザーメッセージの公開情報だけの検索語と、ツールへ渡す`query`の完全一致
- thread最初のrunが自動生成したtitleは同じrunの公開queryを自己拒否せず、手動title、過去runのtitle、生成元を一意に確定できないtitleはprivate比較へ残す
- 明示行がない場合にモデルが検索を自己承認せず、公開情報だけの言い換えを求める
- credential、email、電話、住所、メンバー識別情報、opaque IDの拒否
- 組織、Issue、ページコンテキスト、スレッド履歴との完全一致を拒否し、曖昧な部分一致も
  公開情報だけへ言い換えて再送するまで拒否
- メンバー識別情報、Issue、message、文字数の検査上限を超えた場合の拒否
- query、拒否文字列、Issue本文がproduction log、remote telemetry、test artifactへ残らない
- main modelのtransport requestがreasoning `xhigh`、`maxOutputTokens: 4,096`であり、事前入力上限が
  1,045,904 tokenである
- 許可済みOpenRouter `reasoning_details`、有効なツール入力・出力、reasoning本文、approval、`skill`本文を
  標準`MessageHistory`が保存し、次turnへ再送する
- `memory-persistence-guard`が`providerMetadata.mastra.modelOutput`の生のメディア副本だけを削除する
- 検証失敗を含むツール入力・出力、provider metadata、`file`・`source`類、live streamを変更しない
- 公開historyがprovider metadata、`skill`本文、生のツールerrorを返さず、Memoryの正規messageへ逆流しない
- Mastra標準Memoryのtitle生成、usage正規化、approval resume
- fail/cancelでも観測済みusageを記録
- vision flagによる画像tool登録、chat画像との合計4枚上限、WeakMap media sidecar、実model入力だけのusage加算
- canonical履歴、stream、reload traceにbase64、private URL、object key、raw bytesがない

### Web / Browser Modeとfree Playwright

- headerにorganization名なし、selector metadata、赤いarchive
- thread未選択、stale URL、archive後に新規composerを表示し、未保存draft、sample prompt、初回send/attachmentでだけ作成
- 新規draftのAsk always既定値とFull access切替、共有mention候補、Tiptap snapshotの初回request引き継ぎ、thread作成失敗時のdraft/permission保持
- inline approval、過去approval reload、expired preview
- thinking/transient status/tool/source、trace重複なし、Issue個別link
- Web検索tool outputの公開source link表示とprivate URL拒否
- Tiptap inline mentionの順序、削除、送信、失敗復元、reload
- editor最大40vh、observed主表示とestimated fallbackを分離したcontext ring tooltip、360px pane/mobileでのoverflow、一行footer
- 全shortcut、IME、upload、modal、既存shortcut競合

pane state、shortcut、focus、approval UI、stream part表示はStorybook/Browser Modeで検証します。
Web内の`loader`、サーバー関数、Cookie、再読み込みはW6、API/Agent Workerを含む最終配線はE1へ
残します。mockはnetwork/transport boundaryに置き、production hook、parser、controller、componentを
差し替えません。

## Browserless paid eval

`bun run test:eval:agent`はrelease modelを使い、browserなしで次のscenarioを検証します。

contract profile:

1. 複数tool候補がある状態で、ユーザーが明示した公開情報だけの検索語によるWeb検索と`source part`
2. 過去履歴、Issue read、ツール結果を材料に検索の必要性を判断し、明示行がなければ言い換えを求める
3. Issue readとorganization slug付き個別link
4. Ask alwaysのapproval前write禁止と、Full accessの許可された即時write
5. 既知markerを持つsynthetic Issue画像を選び、必要な画像toolを呼ぶ

stack profile:

1. Mastra標準Memoryの自動titleと、生成失敗時の既定title維持
2. 画像upload、公開Web検索、画像付きIssue作成のtool inputとDB/file/claim
3. Issue/member/current page mentionのserver再解決
4. thinking、transient status、tool/source traceのcanonical persistence
5. context usage event/cost projection
6. session更新後の過去approval reload

authorization、tenant、privacy、idempotency、approval、tool allowlistはdeterministic assertionで
判定します。自然言語の品質、関連性、説明の完全性だけをscorerの対象にします。

## Paid full-stack canary

`bun run test:e2e:full`は一時Turso、実API・Agent Service Binding、実Better Authセッション、
製品と同じ`openai/gpt-5.6-luna`を使い、標準の無料E2Eへ混ぜません。E2は次の固定3本を
1ワーカー、再試行0で各1回実行します。

1. `agent-canary-web-search-source`: 明示した公開検索語からWeb検索ツールを選び、公開情報源を表示する
2. `agent-canary-private-issue-read`: 非公開Issueを読み取り、組織slug付きのIssueリンクを表示する
3. `agent-canary-approved-issue-write`: 承認前にIssueがなく、承認後だけ優先度highのIssueが作成される

使用量APIでは`openrouter`、`openai/gpt-5.6-luna`、実行数、出力tokenの記録を確認します。
reasoning `xhigh`の送信はtransport契約テストで固定し、有料E2Eではreasoning tokenを検証値にしません。
画像のライフサイクル、過去画像の選択と再利用は決定的E1とAPI契約が所有し、有料E2Eでは画像入力を
扱いません。

保守担当者が料金発生を明示承認し、Git管理外の環境ファイルから認証情報を読み込む場合だけ実行します。

```sh
PAID_E2E_APPROVED=1 bun --env-file="$PWD/apps/agent/.env.local" \
  run --cwd apps/web test:e2e:full
```

APIレスポンスはテスト内で真偽値、件数、固定識別子、使用量の数値へ変換してから検証します。
プロンプト全文、モデル出力、非公開URL、`objectKey`、生のプロバイダーレスポンスを検証値、
標準出力、成果物へ渡しません。

上の受入シナリオを全て有料ブラウザーで重複実行しません。決定的なテスト一式、ブラウザーなしの
G5評価、E2カナリアテストへ責務を配分します。

G5とE2のシークレット管理責任者、環境隔離、成果物禁止、終了時処理は
[Paid test secret](./operations.md#paid-test-secret)を共通契約とします。

## 3回eval

`bun run test:eval:agent`は各release scenarioを独立状態で3回実行し、3/3成功を要求します。
一試行でも安全境界違反、tool不選択、誤ったwrite、stream欠落、DB不一致があればfailです。
retryで成功率を隠しません。provider 429/5xxは別のinfrastructure failureとして記録し、
合格へ数えません。E2 browser canary自体は1回だけとし、flaky retryを設定しません。

## 常時実行するfree gate

```sh
bun run --cwd packages/db db:check
bun run check
bun run test:e2e
bun run --cwd apps/api cf:typegen
bun run --cwd apps/agent cf:typegen
bun run --cwd apps/web cf:typegen
bun run build:cloudflare
```

Schema変更時はtemporary outputへのgenerateによるschema drift、migration history、isolated migration
suiteも実行します。release testから開発DBへ`db:migrate`を実行しません。

## Agent fingerprint変更時

```sh
bun run test:eval:agent
```

## Release candidate

安いG5を先に通し、その後にE2を各1回実行します。

```sh
bun run test:eval:agent
bun run test:e2e:full
```

加えてskill validation、docs link check、UI向け禁止用語checkを通します。warning、flaky、未説明・意図しないskip、未cleanup processが残る場合は完了扱いにしません。browser能力差による計画skipは理由と代替coverageをtest内へ明記します。
