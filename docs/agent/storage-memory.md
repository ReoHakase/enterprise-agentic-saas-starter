---
title: 製品AgentのStorage、Memory、thread整合性
status: proposed
implementation: planned
last_reviewed: 2026-07-28
applies_to:
  - apps/agent/src/mastra/storage.ts
  - apps/agent/src/mastra/agents/**/memory.ts
  - apps/api/src/modules/agent/**
  - packages/db/src/schema/agent-*.ts
related:
  - ../architecture/agent-runtime-and-mcp.md
  - ../decisions/ADR-008-mastra-native-agent-runtime.md
---

# 製品AgentのStorage、Memory、thread整合性

## 目的

Application DBをtenant認可と業務課金の正本、Agent DBをMastra実行状態の正本として分離します。cross-database FKがないことを前提に、認可、作成、履歴、archive、削除、障害時の不変条件を定義します。

## Database topology

```text
Application Turso
  Better Auth
  organization / membership
  Issue / files
  agent thread registry
  run quota / usage ledger
  approval policy / prepared action
  audit / idempotency

Agent Turso
  Mastra thread
  messages
  working memory
  semantic recall
  Workflow snapshot
  suspended run
  observability
  scores
```

同じTurso organization内でよいですが、database URLとtokenを共有しません。

## Thread ID

Application DBとAgent DBで同じUUIDを使います。

```text
Application DB agent_threads.id = thread_123
Agent DB Mastra thread.id        = thread_123
```

これはapplication-level referenceです。SQL FKではありません。

## Application thread registry

最小schema:

```text
agent_threads
  id
  organization_id
  owner_user_id
  status
  created_at
  archived_at
```

保持理由:

- threadがどのtenantに属するか
- 誰が所有するか
- activeかarchivedか
- run、usage、auditをどのthreadへ関連付けるか
- Agent DBにdataが残る場合でもアクセスを拒否するため

保持しない値:

- message body
- reasoning
- tool result
- context summary
- title
- last message preview
- message count

## Agent thread

Mastra threadが次を所有します。

- title
- createdAt
- updatedAt
- metadata
- messages
- Memory settings
- Workflow linkage

`resourceId`はAPIが認証済みcontextから決めます。

```text
resource:{organizationId}:{userId}
```

client、model、tool inputから選択させません。

## Thread作成

```text
1. APIがsession、organization、membershipを検証
2. APIがApplication DBへthread registryを作成
3. APIがthread IDとresource IDをAgentへ渡す
4. Mastraが最初のstreamまたは明示createでthreadを作成
5. user messageをMemoryへ保存
```

Agent thread作成に失敗した場合:

- messageを送信済みと見せない
- Application registryは空threadとして削除してよい
- retry時に同じthread IDを再利用してもよい
- partial Agent DB rowは同じIDへ収束させる

## Thread list

APIが認可の正本です。

```text
1. active organizationとownerのactive registryを取得
2. Agent Memoryへresource IDとpaginationを渡す
3. registryに存在するthreadだけ返す
4. archived、別tenant、orphan threadを除外
```

Agent DBだけを一覧の認可根拠にしません。

## History read

```text
GET /agent/threads/:threadId/messages
  → Application registryでownerとstatusを検証
  → Agent Memory gateway
  → Mastra Memory recall
  → UIMessage projection
```

APIはAgent DBへ直接接続しません。

## History search

初期範囲:

- thread内の履歴取得
- Mastra semantic recall
- resource単位thread list

対象外:

- organization横断全文検索
- 管理者向け全ユーザー検索
- 複雑なsortとaggregate

対象外要件が必要になった場合は専用検索indexを設計します。認可の正本は引き続きApplication registryです。

## 読み取り用projectionを作らない理由

- titleとupdatedAtの正本が二重になる
- user message保存後、assistant message保存後、abort、retryで同期点が増える
- cross-database transactionがない
- stale projectionを認可に誤用する危険がある
- UI要件より先に実装量を増やす

初期thread contractからmessage countを外します。利用者価値が高いと確認された場合だけ、Agent Memory側で集計するか、再構築可能なprojectionを導入します。

## Projection導入時の規則

```text
agent_thread_search_projection
  thread_id
  title
  last_message_at
  last_message_preview
  message_count
  projection_version
```

- authorizationには使用しない
- source event IDで冪等更新する
- rebuild commandを持つ
- assistant message永続化、title変更、archiveの確定点だけ更新する
- stream chunk単位で更新しない
- lagをUIと運用で観測する

## Archive

```text
1. Application DBでstatus = archived
2. ticket、grant、active runを失効
3. 新しいhistory readを拒否
4. Agent thread削除を要求
5. 失敗時は削除jobをretry
```

手順1から3がsecurity boundaryです。Agent DBの物理削除が遅れてもアクセスは復活しません。

## Deleteとretention

- userによるarchiveと法的削除を区別する
- archiveは通常利用不可、retention期間中の復元方針を別途定義できる
- hard deleteはApplication registryとAgent Storageの両方を削除する
- cross-database deleteはoutboxで追跡する
- delete jobはthread IDだけを持ち、credentialやmessage本文をjob payloadへ入れない

## Orphan処理

### Application registryだけ存在

空threadとして扱うか、作成失敗から一定時間後にcleanupします。

### Agent threadだけ存在

認可台帳にないため公開しません。cleanup対象です。

### archived registryとAgent thread

公開しません。物理削除retry対象です。

## Run quota

Application DBが所有します。

```text
agent_runs
  id
  thread_id
  organization_id
  user_id
  status
  model_route
  client_message_id
  started_at
  finished_at
```

必要な値だけを残し、Mastra observabilityと重複するstep count、tool count、debug metadataは削減します。

quota reservationはrun開始前にtransactionで確保し、completed、failed、canceled、expiredで一度だけsettleします。

## Usage

### Agent側

- provider usageを観測する
- input、output、reasoning、cache、imageをnormalizeする
- provider request IDとrun event IDを付ける
- APIへ一度だけsettleする

### API側

- pricing versionを適用する
- billable ledgerへ記録する
- organization planとcreditを反映する
- daily/monthly aggregateを更新する
- duplicate settlementを拒否または既存receiptへ収束する

Mastra traceを課金の正本にしません。

## Approval

### APIが所有

- thread approval policy
- prepared action payload
- DBから生成したpreview
- expected revision
- actor、organization、thread、run
- current permission
- idempotency
- auditとbusiness receipt

### Mastraが所有

- workflow run ID
- suspension state
- resume point
- workflow snapshot
- Agent tool callとUI state

Mastra snapshotへaccess token、grant、session cookie、presigned URLを保存しません。

## Failure behavior

| failure                        | behavior                                                   |
| ------------------------------ | ---------------------------------------------------------- |
| Agent Storage unavailable      | 新しいrunとhistory readを503。業務DBを推測でfallbackしない |
| Application DB unavailable     | 認可不能のためfail closed                                  |
| registry作成後にAgent作成失敗  | 空registryを削除または同ID retry                           |
| Memory保存後にusage settle失敗 | messageは保持し、usage settlementを冪等retry               |
| archive後にAgent delete失敗    | 認可は失効済み。delete jobをretry                          |
| Workflow snapshot復元失敗      | business actionを実行せず、明示的なrecoverable error       |

## 検証

- G3でMemory、list、recall、process再生成
- G4でregistryとMemoryの積、archive、orphan、quota、usage
- A3でregistry、run、usage、outboxのDB constraint
- E1で送信、reload、archive、削除retry
