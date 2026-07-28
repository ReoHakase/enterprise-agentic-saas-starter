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

Mastra Storageは完全なthread metadata、message履歴、Workflow snapshotの正本です。Mastra Memoryは
同じStorage上のthreadからモデルへ渡す文脈を構成し、thread-scopedを既定にします。Memoryを別の履歴
正本、認可台帳、別threadからの暗黙共有に使いません。

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

Phase 1では`agent_runs`を縮小しません。approval、grant、quotaと子FKが現役のためです。
削除対象は`agent_threads`のtitle系列、`updated_at`、API側message/summary tableに限定します。
新しいappend-only migrationで6列tableへ再構築し、既存`status = archived`行だけ旧`updated_at`を
`archived_at`へ移します。旧migration、snapshot、journalは変更しません。

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
4. retention期間中はAgent threadと履歴を保持する
```

手順1から3がsecurity boundaryです。archiveは将来のreopen方針を許す論理状態であり、物理削除jobを
開始しません。

## Deleteとretention

- userによるarchiveと法的削除を区別する
- archiveは通常利用不可、retention期間中の復元方針を別途定義できる
- hard deleteはApplication registryとAgent Storageの両方を削除する
- cross-database deleteはoutboxで追跡する
- delete jobはthread IDだけを持ち、credentialやmessage本文をjob payloadへ入れない
- outboxを追加する場合はorganization/thread ownership、unique event、lease expiry、fencing tokenを
  schemaで固定する。Phase 1で追加しない場合は既存hard-delete use caseの境界へ閉じる

## Orphan処理

### Application registryだけ存在

空threadとして扱うか、作成失敗から一定時間後にcleanupします。

### Agent threadだけ存在

認可台帳にないため公開しません。cleanup対象です。

### archived registryとAgent thread

公開しません。retention期間中は保持し、hard delete時だけ物理削除対象です。

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
Mastra 1.53.0では`RequestContext.toJSON()`もsnapshotへ保存されるため、関数、API client、settlement
callback、resume ticket、provider keyも置きません。resume capabilityはAPI再認可後に再発行し、
永続化せず即時consumeします。

## 応答messageのdurable commit

chat応答の正本はMastra Storageです。Application DBへmessage副本やcommit可否の判断を持たせません。
workflow run IDはApplication run IDから決定的に導出し、snapshotは`applicationRunId`、
`threadId`、`resourceId`、`desiredOutcome`と、`drainUnsavedMessages()`で一度だけ取得した
canonical message batchを持ちます。message IDはMastra native IDを変更せず、重複と上限を検査します。

正常系の順序は次です。

1. main model usageをApplication DBへ冪等記録する
2. `memory-commit` workflowをsuspendし、応答batchをAgent DBへdurable stageする
3. workflowをresumeし、`Memory.saveMessages`を同じmessage IDで冪等実行する
4. `desiredOutcome=completed`だけ、private named Service Bindingの
   `POST /internal/agent/memory/commit-settlement`でApplication runを精算する
5. settlement acknowledgement後にworkflow snapshotを削除する
6. background title taskを開始する

2のdurable stageを、生成済み応答をcanonical historyへ採用する線形化点とします。通常のstreamは
2から5の完了を待って閉じ、`waitUntil`はclient disconnect時の継続手段に限定します。
`waiting_approval`はbusiness action transactionがApplication runを既に遷移させているため、
Memory保存後の追加Application DB callを行いません。

通常streamはAI SDK 7の`createUIMessageStream`にある`onEnd`を最終化barrierとして使います。
commitは同じrequest内で最大4回、5ms、10ms、20msの間隔で試行します。それでも完了しない場合は
`memory_commit_deferred`を記録し、runを`failed`へ上書きせず、snapshotを保持したままstreamを
generic persistence errorで閉じます。後続のreconciliationがMemory保存、Application settlement、
snapshot削除を同じIDで再実行します。

settlement routeはpublic APIへmountせず、grantなしのService Binding callだけを受けます。入力は
`applicationRunId`だけです。runが`running`なら`completed`へのCASとrun grant失効を同じ
Application DB transactionで行い、missingまたは既存terminalなら状態を変えずacknowledgeします。
stage後にsession、membership、thread、context epoch、expiryを再判定してmessageをdiscardしません。
公開可否は各readのApplication registry認可で決めます。stageと同時にcancelまたはarchiveが先に
terminal化した場合、Application ledgerはそのterminal状態を維持し、生成済みmessageはAgent DBへ
残り得ますが、認可を失ったreadからは公開しません。

保存失敗はpayloadを保ったまま再suspendします。Memory保存後にprocessが停止した場合は`success`
snapshotを残し、次の同thread chat、history read、thread list、またはrequest時reconciliationが
Application settlementとsnapshot削除を再試行します。recovery対象は`suspended | running | success`
です。回復後もpending commitが残る場合は部分的な200を返さず、bounded recoverable unavailableを
返します。process-local lockは正しさの根拠にしません。

history readは対象thread、thread listはApplication registryが渡した最大1,000件のthreadすべてを
reconciliation対象にします。最大1秒待ってpending有無を確認してからone-time connection ticketを
consumeし、consume直後にも再確認します。最初の確認でpendingが残る場合はticketを消費せず503を
返します。選択threadの探索はstatusごとに100件ずつpaginationし、総run数10,000件を上限として
超過時はfail closedにします。request外のopportunistic sweepはstatusごとに先頭25件へ限定します。

snapshotへgrant、resume ticket、API client、provider credential、provider metadata、
private URL、provider raw errorを入れない。user-authored text自体をkeywordで拒否せず、
runtime専用fieldを構造的に除外する。tool partはallowlist済みtool名とnative stateごとの
strict schemaで投影し、検証済みinput/output、`step`、approval、attachment receiptだけを保持する。
provider固有field、raw input、raw error、非公開URLはcanonical historyへ保存しない。

projectionはtool名とstateの積をfail closedで検証します。`partial-call | call`はinputだけ、
`result`はinputと検証済みoutput、`approval-requested`は未決定approval、`approval-responded`は
boolean decision、`output-denied`は拒否decisionだけを許可します。`output-error`はraw causeを捨てて
固定文言へ置き換えます。矛盾する組合せ、未知tool、schema不一致はraw値を残さず
`Tool state unavailable`へ置き換えます。attachment receiptもshared bounded schemaで
action ID、operation、Issue ID/number/revision、file IDだけを保持します。

title taskのusageは`title_<attempt>`で別eventにし、
terminal transitionでrun grantが失効した後もusage専用APIだけが同じgrantの冪等記録を許可します。
title完了を待ってterminal transitionや次turnのconcurrency releaseを遅らせません。

成功した`web_search` tool resultのsourceはstable ID付き`source-url` partへ昇格します。既存のnative
source partと合わせてshared public URL canonicalizerを通し、同一message内でcanonical URL単位に
重複排除します。provider由来queryとfragmentは名前に依存せず全体を除去し、userinfo、
private/reserved hostを含むURLは保存しません。

## Failure behavior

| failure                          | behavior                                                   |
| -------------------------------- | ---------------------------------------------------------- |
| Agent Storage unavailable        | 新しいrunとhistory readを503。業務DBを推測でfallbackしない |
| Application DB unavailable       | 認可不能のためfail closed                                  |
| registry作成後にAgent作成失敗    | 空registryを削除または同ID retry                           |
| durable stage前にAgent DB失敗    | runをfailedにし、streamをerrorで閉じる                     |
| Memory保存後にApp settlement失敗 | success snapshotを保持し、同thread境界で冪等retry          |
| cancel/archiveとcommitが競合     | App terminalを維持し、read認可でmessageを非公開にする      |
| hard delete時にAgent削除失敗     | 認可は失効済み。delete jobをretry                          |
| Workflow snapshot復元失敗        | business actionを実行せず、明示的なrecoverable error       |

## 検証

- G3でMemory、list、recall、process再生成
- G4でregistryとMemoryの積、archive、orphan、quota、usage
- A3でregistry、run、usage、outboxのDB constraint
- E1で送信、reload、archive、hard delete retry

Application migrationのupgrade testでは子FKを保持したままtable rebuildできることと
`foreign_key_check`が空であることを確認します。適用前にclone/dumpを作り、適用後のrollbackは
new run停止、backup connectionへの切替、token rotateで行います。単純なmigration revertはしません。
