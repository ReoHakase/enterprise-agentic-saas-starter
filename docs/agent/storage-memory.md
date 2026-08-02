---
title: 製品AgentのStorage、Memory、thread整合性
status: accepted
implementation: active
last_reviewed: 2026-08-01
applies_to:
  - apps/agent/src/mastra/storage.ts
  - apps/agent/src/mastra/agents/**/memory.ts
  - apps/api/src/modules/agent/**
  - packages/db/src/schema/agent-*.ts
related:
  - ../architecture/agent-runtime-and-mcp.md
  - ../decisions/ADR-008-mastra-native-agent-runtime.md
  - ../decisions/ADR-012-standard-memory-and-auth-delivery.md
---

# 製品AgentのStorage、Memory、thread整合性

## 目的

Application DBをtenant認可、run、usage、approvalの正本、Agent DBをMastra実行状態の正本として
分離します。message履歴とtitleはMastra標準Memoryへ委譲し、独自の耐久化層を作りません。

## Database topology

```text
Application Turso
  Better Auth / organization / membership
  Issue / files
  agent thread registry
  run / quota / usage ledger
  approval policy / prepared action / audit

Agent Turso
  Mastra thread / messages / working memory
  workflow snapshot / suspended run
  observability / scores
```

database URLとtokenは共有しません。Agent WorkerへApplication DB credentialを渡さず、APIへAgent DB
credentialを渡しません。Mastra tableはDrizzle migrationで管理しません。

## Threadと認可

Application DBとAgent DBで同じUUIDを使いますが、SQL FKはありません。

```text
Application DB agent_threads.id = thread_123
Agent DB Mastra thread.id        = thread_123
```

Application registryは`organization_id`、`owner_user_id`、active/archive状態を所有します。message、
reasoning、title、preview、message countは保持しません。`resourceId`はAPIの認証済みcontextから
`resource:{organizationId}:{userId}`として決め、client、model、tool inputから選択させません。

thread listとhistoryは次の順序を守ります。

1. APIがlive session、active organization、membership、owner、registry状態を検証する
2. one-time connection ticketでAgent Workerへ接続する
3. Mastra Storage/Memoryからthreadまたはmessageを読む
4. Application registryに存在するactive threadだけを返す

Agent DBだけを認可根拠にせず、APIはAgent DBへ直接接続しません。archive後はticket、grant、active runを
失効し、新しいreadを拒否します。Agent DBへmessageが残っていても認可は復活しません。

## Mastra標準Memory

Product Agentは`Memory`をread/write可能な標準設定で使います。

- requestの`memory` optionへ認可済み`thread`と`resource`を渡す
- `@mastra/ai-sdk`の`handleChatStream`へMemoryを渡し、標準保存処理を使う
- historyはMastraのAI SDK v6互換projectionを使う
- titleはMemoryの`generateTitle`と補助model設定へ委譲する
- streamとtitle補助処理のraw input/outputをtraceへ残さない

message全体をアプリ独自スキーマへ写し替える全面的なsecurity projectionは置かず、Mastraの
`MessageHistory`へ標準messageを渡します。有効なreasoning、ツール入力・出力、approval、Mastraの
`skill`本文、プロバイダーSDKが検証した型付きmetadataは次turnのcontextとして保持します。
プロバイダーが追加した正規fieldをアプリ独自スキーマの不一致で黙って削除しません。

例外は、標準保存経路で実測した`providerMetadata.mastra.modelOutput`だけです。toolの`toModelOutput`が
現在のmodel turnへ渡した生のメディアをMastraがpart metadataへ複製するため、36行の
`memory-persistence-guard`がこの副本だけを保存前に除去します。reasoning detailを含むprovider metadata、
検証失敗を含むツール入力・出力、`file`、`source`、`source-document`、live streamは変更しません。
このguardへcredential scanner、一般的なmessage変換、公開履歴用の投影を追加しません。

標準`generateTitle`は同じユーザーメッセージからtitleを生成し、独自sanitizerを追加しません。そのため、
利用者がcredentialを本文へ入力した場合は、modelがtitleへ復唱してMastra Storageへ残す可能性があります。
これは標準機能を優先する残余riskとして受容し、titleをlog、trace、テスト成果物へ出しません。

保存してはいけない値は、Memory直前の一括変換ではなく値を作る境界で除外します。

- 現在messageとIssue添付の画像bytesは`context`またはtoolの`toModelOutput`だけへ渡し、
  `providerMetadata.mastra.modelOutput`の副本はMemoryへ保存しない
- accountとmemberの画像URLはAgent tool outputで`null`へする
- Web検索sourceとcredentialを含み得るURLはtool executorでpublic URLへ正規化する
- providerの生Error、cause、response bodyは失敗したstreamからmessageへ変換しない

history APIは`MessageList`のAI SDK v6互換messageを公開schemaへ薄く変換し、provider metadata、
`skill`本文、生のtool errorをbrowserへ返しません。この表示用変換はMemoryへ逆流させません。

## Streamと保存耐久性

streamはAI SDK標準responseを返し、最初のassistant message metadataへrun IDを付けます。usageと
Application run settlementはMastra/AI SDKの`onFinish`で行います。

Memory保存はMastra内部のbest-effortです。

- stream完了は独自Memory commitを待たない
- 独自`memory-commit` Workflow、canonical batch、reconciliation、drainを作らない
- Memory commit専用APIとApplication DB message副本を作らない
- Worker eviction、OOM、`SIGKILL`時の未保存messageを独自journalから復元しない
- Mastra内部で非throwとなる保存失敗は固定error codeのtraceで観測し、custom interceptを追加しない

この選択により、生成済みresponseがbrowserへ届いてもWorker停止前にMemoryへ保存されない場合が
あります。強いcommit耐久性より、framework標準経路と保守対象の少なさを優先します。

## Run、usage、approval

Application DBはrun quotaを開始前に予約し、completed、failed、canceled、expiredへ冪等にsettleします。
main model usageはprovider観測値を正規化して記録します。Memory保存の成否をusage ledgerの条件にせず、
同じrun event IDのretryは既存receiptへ収束させます。title補助modelの厳密usage課金は行いません。

approvalはsecurity境界なので次を維持します。

- APIがapproval policy、prepared action、expected revision、current permission、auditを所有する
- Mastraがworkflow suspension、resume point、tool/UI stateを所有する
- opaque resume ticketはAPI再認可後に発行し、即時consumeする
- snapshotへgrant、API client、provider key、cookie、private URLを置かない

## Reasoningとtool state

OpenRouter `reasoning_details`を含むprovider metadata、reasoning本文、Mastraのnative tool stateは
標準messageのまま保存します。ツール入力・出力のスキーマ検証と認可はツール実行時の境界が所有し、
Memory保存時に有効な呼び出しを重ねて検証しません。検証に失敗したツール入力・出力もMastraの標準partを
変更せず保持します。tool call ID、approval IDはプロバイダーが所有するopaque文字列として扱い、
アプリ固有の文字種へ制限しません。source URLの正規化はtool executorと公開historyの境界が所有し、
`memory-persistence-guard`はsource IDを再生成しません。

公開historyでは、公開schemaに合うnative partだけを返し、`output-error`を固定文言へ置き換えます。
成功したWeb検索sourceはtool executorと公開historyの両方でpublic URL canonicalizerを通し、userinfo、
private/reserved host、provider query、fragmentを除去します。

## Thread lifecycle

### 作成

1. APIがsession、organization、membershipを検証する
2. Application registryへthread IDを作る
3. Agentへ同じthread IDとresource IDを渡す
4. 最初のMemory利用時にMastra threadとmessageを作る

Agent作成に失敗した空registryは削除または同じIDでretryできます。

### Archiveとdelete

archiveはApplication registryの認可を同期的に失効します。通常のarchiveでAgent dataを物理削除しません。
hard deleteはApplication registryとAgent Storageの両方を対象にしますが、Agent側削除失敗で認可を
復活させません。法的削除にretry jobが必要になった場合だけ、本文を含まないthread ID単位のoutboxを
別判断で追加します。

### Orphan

- Application registryだけ: 空threadとして扱うか一定時間後にcleanupする
- Agent threadだけ: 認可台帳にないため公開せずcleanup対象にする
- archived registryとAgent thread: 公開せずretention中は保持する

## Failure behavior

| failure                      | behavior                                                             |
| ---------------------------- | -------------------------------------------------------------------- |
| Agent Storage unavailable    | 新しいrunとhistory readを503にし、Application DBから履歴を捏造しない |
| Application DB unavailable   | 認可不能のためfail closed                                            |
| Memory保存失敗               | streamを独自retry barrierへ変えず、固定codeで観測する                |
| title生成失敗                | 既定titleを維持し、main responseを失敗させない                       |
| cancel/archiveと保存が競合   | Application側terminal状態とread認可を優先する                        |
| hard delete時にAgent削除失敗 | 認可は失効したまま、必要な削除だけretryする                          |
| approval snapshot復元失敗    | business actionを実行せずrecoverable errorにする                     |

## 検証

- 標準`MessageHistory`がreasoning、tool、approvalを欠落させず保存する
- 複数turnで許可済みOpenRouter `reasoning_details`を再送できる
- 有効なツール入力・出力、reasoning本文、approval、`skill`本文を保持する
- `providerMetadata.mastra.modelOutput`の生のメディア副本だけを保存しない
- 検証失敗を含むツール入力・出力、provider metadata、`file`・`source`類、live streamを変更しない
- 標準title生成へ独自sanitizerを追加せず、credential復唱の残余riskを文書化する
- provider失敗の生Error、cause、response bodyをMemoryへ保存しない
- 公開historyがprovider metadata、`skill`本文、生のtool errorを返さない
- Memory保存失敗がcustom reconciliationを起動しない
- usage、cancel、approval、resume、model境界のliveness再検証がbest-effortのMemory保存から独立して収束する
- approval resumeがrequest専用のMastraと`LibSQLStore`を使い、isolate storageを再登録しない
- APIの50秒deadlineまたはcaller abort後はticket消費とbusiness writeへ進まず、公開応答を
  `service_unavailable`と`Retry-After: 30`へ固定する
- request専用Storageのcloseをresponseから分離した`waitUntil`で実行し、rejectまたは2秒timeoutを
  raw causeなしの`resume_storage_close_failed`として観測する
- list/historyがApplication registryのowner/archive境界を越えない
- `LibSQLStore.init()`の反復初期化probeを通す
- E1で送信、reload、cancel、new turnを一巡させる

反復初期化probeは`bun run --cwd apps/agent storage:smoke`で実行します。既存のローカルTurso
起動経路に対して、標準`LibSQLStore.init()`を同一instanceで3回並行実行した後に再実行し、保存と
再接続も確認します。専用の開発launcherは追加しません。
