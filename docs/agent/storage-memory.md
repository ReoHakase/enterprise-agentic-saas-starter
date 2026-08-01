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

security projectionはAgentの`outputProcessors`へ置き、`MessageHistory`より前に実行します。公開可能な
reasoning本文、allowlist済み`reasoning_details`、検証済みtool state、公開sourceだけをMemoryへ渡します。
provider metadata、credential、private URL、raw error、raw image dataは保存しません。

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

表示用reasoning本文と、次turnへ再送するOpenRouter `reasoning_details`だけを型、件数、サイズ付き
allowlistで保持します。tool partは既知tool名とnative stateの組合せを検証します。

- call状態は検証済みinputだけ
- result状態は検証済みinput/output
- approval状態はaction IDとboolean decisionだけ
- `output-error`は固定文言
- 未知tool、矛盾したstate、schema不一致は`Tool state unavailable`

成功したWeb検索sourceはpublic URL canonicalizerを通し、userinfo、private/reserved host、provider query、
fragmentを除去します。

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

- processorがMemoryより前にsecurity projectionを実行する
- 複数turnでreasoning detailsを安全に再送できる
- Memory保存失敗がcustom reconciliationを起動しない
- usage、cancel、approval、resume、livenessがMemory commitから独立して収束する
- list/historyがApplication registryのowner/archive境界を越えない
- `LibSQLStore.init()`の反復初期化probeを通す
- E1で送信、reload、cancel、new turnを一巡させる

反復初期化probeは`bun run --cwd apps/agent storage:smoke`で実行します。既存のローカルTurso
起動経路に対して、標準`LibSQLStore.init()`を同一instanceで3回並行実行した後に再実行し、保存と
再接続も確認します。専用の開発launcherは追加しません。
