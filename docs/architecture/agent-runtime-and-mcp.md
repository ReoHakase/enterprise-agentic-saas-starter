---
title: Agent runtimeとMCPの目標architecture
status: proposed
implementation: planned
last_reviewed: 2026-07-28
applies_to:
  - apps/agent/**
  - apps/api/src/modules/agent/**
  - apps/api/src/mcp/**
  - apps/web/src/features/agent/**
  - packages/agent-contracts/**
  - packages/agent-tools/**
  - packages/auth/**
  - packages/db/**
related:
  - ../agent/runtime-reliability.md
  - ../agent/storage-memory.md
  - ../agent/mcp-integration.md
  - ../testing-strategy/agent-refactor-mcp.md
  - ../decisions/ADR-008-mastra-native-agent-runtime.md
  - ../decisions/ADR-009-mcp-authentication-and-direct-tools.md
---

# Agent runtimeとMCPの目標architecture

## 目的

MastraをAgent定義だけでなく、Memory、Storage、Approval、Workflow、observability、MCPServerまで一貫して利用します。同時に、認証、マルチテナント認可、課金、業務transaction、R2 ACLはSaaS固有の責務としてAPIへ残します。

現在発生しているtool state誤表示、Stop後のrun詰まり、reasoning-only生成、Web検索失敗は、Mastra stream、AI SDK stream、独自canonical message、API永続化、Web UI stateを多段変換する構造が原因になり得ます。最初に構造を切り替え、その後に同じ症状を再現して残存する不具合だけを修正します。

## 目標

- Mastraの標準機能を優先し、独自Memory、独自Workflow snapshot、独自MCP protocolを作らない
- browser、API、Agent、MCPの実行主体と認可境界を分離する
- Agent WorkerへApplication DBとR2のcredentialを渡さない
- `apps/api`から`apps/agent`へのcompile-time dependencyを作らない
- AgentとMCPで同じbusiness tool定義を再利用する
- tool inputへtenant ID、user ID、session ID、grant、access tokenを含めない
- OAuthとMCP writeを初期MCP範囲に含める
- PATはOAuth実装後の独立phaseにする
- release前のため旧Agent contractとの後方互換性を維持しない

## 対象外

- MCPからMastra Agentをsubagentとして呼ぶtool
- MCPへAgentまたはWorkflowを自動公開すること
- MCP経由のSaaS側LLM実行
- MCP用の独自会話履歴
- Application DBとAgent DBをまたぐSQL FK
- 初期段階のClickHouse導入
- 初期段階のorganization横断thread全文検索
- API keyから通常Web sessionを生成すること

## Runtime境界

```text
Web browser
  └─ apps/api public HTTP
       ├─ Better Auth session
       ├─ Origin / CSRF / tenant authorization
       ├─ thread registry / run quota / usage ledger
       ├─ business transaction / R2 ACL / audit
       └─ private Service Binding
            └─ apps/agent
                 ├─ Mastra Agent
                 ├─ Mastra Memory
                 ├─ Mastra Approval / Workflow
                 ├─ native AI SDK stream
                 ├─ Workers AI / AI Gateway adapter
                 └─ Agent専用Turso

MCP client
  └─ apps/api /mcp
       ├─ OAuthまたはPAT認証
       ├─ Mastra MCPServer
       ├─ current membership / permission
       ├─ local business tool executor
       └─ Application Turso / R2
```

MCP requestは`apps/agent`へproxyしません。MCP client自身がLLMとagent loopを持つため、MCP server側で製品Agentを起動すると二重Agentになります。

## 依存方向

```text
apps/web
  └─ @enterprise-agentic-saas/api/client

apps/agent
  ├─ @enterprise-agentic-saas/agent-contracts
  ├─ @enterprise-agentic-saas/agent-tools
  └─ Service Binding → apps/api private entrypoint

apps/api
  ├─ @enterprise-agentic-saas/agent-contracts
  ├─ @enterprise-agentic-saas/agent-tools
  ├─ @enterprise-agentic-saas/auth
  ├─ @enterprise-agentic-saas/db
  └─ @mastra/mcp
```

禁止する依存は次です。

```text
apps/api → apps/agent
packages/* → apps/*
apps/agent → packages/db
apps/agent → packages/auth
apps/agent → Application Turso
apps/agent → R2 binding
```

## Package構成

### `packages/agent-contracts`

Valibot schemaとそこから推論した型だけを所有します。

```text
packages/agent-contracts/
  src/
    chat/
    control-plane/
    tools/
    mcp/
    index.ts
```

含めるもの:

- chat requestとstreamに必要な公開schema
- internal control-plane requestとresponse
- business tool inputとoutput
- OAuth scope名とMCP principalの共有型
- bounded error code

含めないもの:

- Mastra Agent
- Elysia app
- Drizzle schema
- repository
- permission判断
- provider client
- runtime credential

外部入力は原則として`v.strictObject`を使います。未知fieldを黙って削除せず拒否し、overpostingを検出します。

### `packages/agent-tools`

Mastraの`createTool`を直接使う薄いtool factoryとexecutor interfaceだけを置きます。独自Capability DSL、registry、generic dispatcherは作りません。

```text
packages/agent-tools/
  src/
    executor.ts
    account/
    organization/
    issues/
    files/
    index.ts
```

共有するtool:

- accountとorganizationのread
- memberとIssue labelのsearch
- Issueのsearch、get、create、update、delete
- Issue attachmentのmetadata read、画像read、追加、削除
- MCP upload sessionに必要なfile操作

Agent専用として`apps/agent`へ残すもの:

- `web_search`
- `rename_thread`
- `ui_*`
- model selection
- Memory
- Workflow
- Agent instructions
- internal skills

### package自身が所有する検査

`agent-contracts`と`agent-tools`はbusiness logicを持たせません。package自身はtypecheck、lint、exports、
import boundary、cycle、Zod禁止に加え、公開Valibot schemaのstrict/bounded validationと薄い
`createTool` factoryが`AgentToolExecutor`を1回だけ呼ぶ実行時契約テストを所有します。

consumer固有のValibot境界はA1とG2、Agent compositionはG2、MCP登録はA4でも検査します。
package固有の公開テスト層や`AC1`、`AT1`は作りません。

## file-based風directoryとcode registration

file-based agentの探索機能は使いません。1 Agent 1 directoryの規約だけ採用します。

```text
apps/agent/src/mastra/
  index.ts
  storage.ts
  observability.ts

  agents/
    product-agent/
      agent.ts
      instructions.ts
      memory.ts
      tools.ts
      skills/
      processors/
      scorers/

    thread-title-agent/
      agent.ts
      instructions.ts

  workflows/
    approved-issue-action/
      workflow.ts
      steps/

  tools/
    web-search/
    thread/
    client/

  adapters/
    control-plane/
    models/
    telemetry/
```

登録は`apps/agent/src/mastra/index.ts`で明示します。

```ts
export const mastra = new Mastra({
  storage,
  observability,
  agents: {
    productAgent,
    threadTitleAgent,
  },
  workflows: {
    approvedIssueActionWorkflow,
  },
})
```

動的model、tool allowlist、vision、write、timezoneはRequestContextで構成します。

## DBとStorage

### Application Turso

SaaSの制御面と業務データを所有します。

- Better Auth
- organizationとmembership
- Issueとfile
- thread認可台帳
- run quotaと実行ledger
- billable usage
- approval policy
- prepared business action
- idempotency
- audit

### Agent Turso

Mastraだけが所有します。

- thread metadata
- messages
- working memory
- semantic recall
- Workflow snapshot
- suspended run
- score
- traceとspan

Agent Tursoは`apps/agent`の`LibSQLStore`で管理し、Drizzle schemaとmigrationを作りません。Application Tursoと同じTurso organizationを使ってもよいですが、database URLとtokenを分けます。

Mastra Storageは完全なthread metadataとmessage履歴の正本です。Mastra MemoryはStorage上の同じthreadを
利用して、直近履歴、working memory、semantic recallなどモデルへ渡す文脈を構成します。Memoryを
認可台帳、全履歴の別正本、thread横断の共有状態として扱いません。

production、Studio、testは同じstorage factoryを利用し、process内では1つのinstanceを再利用します。
requestごとに`LibSQLStore`を生成しません。productionではAgent DB URLがApplication DB URLと同一なら
起動を拒否します。

### 将来のComposite Storage

初期実装は単一`LibSQLStore`です。trace量が増えた場合だけ次へ変更します。

```text
memory / workflows / scores → Agent Turso
observability               → ClickHouse
```

ClickHouseをMemoryまたはWorkflowの主Storageにはしません。

## Thread ownershipと参照整合性

Application DBとAgent DBで同じthread IDを使いますが、cross-database FKは作れません。

Application DBの`agent_threads`は認可台帳です。

```text
agent_threads
  id
  organization_id
  owner_user_id
  status
  created_at
  archived_at
```

Agent DBのMastra threadは会話状態です。

```text
Mastra thread
  id = agent_threads.id
  resourceId
  title
  metadata
  createdAt
  updatedAt
  messages
```

認可台帳はprojectionではありません。title、message count、last message previewを初期実装ではApplication DBへ複製しません。

Memory queryは認証済み`organizationId`、`userId`から導出した`resourceId`と、Application registryで
認可済みのthread IDの両方へ固定します。別threadの内容を現在threadへ暗黙注入せず、
thread-scoped設定を既定にします。

## Thread listと履歴取得

### Thread list

```text
GET /agent/threads
  → APIがsession、active organization、membershipを検証
  → APIがactive thread registryを取得
  → Service BindingでAgent Memoryのthread metadataを取得
  → registryとMemoryの積集合だけ返す
```

archive済みthreadがAgent DBへ残っていても、Application DBの認可台帳で除外します。

初期公開contractから`messageCount`を外してよいものとします。message countを必須にする場合は、Mastra Storageから取得する専用readを追加し、Application DBへ同期projectionを作らないことを優先します。

### 履歴

```text
GET /agent/threads/:threadId/messages
  → APIがownerとtenantを検証
  → Agent Memory gatewayへthread IDを渡す
  → Mastra MemoryがUIMessageを返す
```

`apps/api`へAgent DB credentialを渡しません。

### 履歴検索

thread内のsemantic recallはMastra Memoryを利用します。organization横断の全文検索や管理者検索が必要になった時だけ、専用検索indexまたは再構築可能なprojectionを追加します。

## 読み取り用projection

初期実装では作りません。

理由:

- titleとupdatedAtはMastraが既に所有する
- stream切断、abort、retry、title failureの同期処理を増やさない
- Agent DBの正本とApplication DBの副本がずれる不具合を避ける
- 実測前にN+1や一覧性能を推測で最適化しない

導入条件:

- organization全体の会話検索が必要
- 管理者向けfilterとsortがMastra APIで表現できない
- 数万thread規模でAgent Memory queryが支配的になる
- Agent Worker障害中にもthread一覧を必ず表示する製品要件が生じる

導入する場合は、認可の正本に使わず、再構築可能な専用tableにします。

## StreamとUI contract

目標経路は次です。

```text
Mastra Agent stream
  → native AI SDK UIMessage stream
  → apps/apiはbodyをproxy
  → useChat
```

削除する変換:

- 独自canonical message codec
- `toAISdkStream`後の再包装
- API側message append
- API側history reconstruction
- provider reasoningの独自永続化
- `output-denied`から`output-error`への変換

server toolとclient toolを分離します。

- server toolはAgent Workerで実行し、browserの`onToolCall`へ返さない
- client toolは`ui_*` allowlistだけをbrowserで実行する
- native tool partの同一IDとstate更新をUIへ表示する
- tool-local failureをconversation全体のfatal errorにしない

## Stop、disconnect、error

利用者のStopは正常なcancelです。

```text
Stop
  → browser stream abort
  → stream先頭のtransient data-runで受け取ったopaque run IDを使う
  → explicit cancel command
  → runを冪等にcanceledへ遷移
  → quota reservationとgrantを解放
  → pending submission IDを破棄
  → draftだけ復元
  → clearError
  → 次turnは新しいmessage ID
```

network disconnectとprovider errorだけを同一submission IDでretry可能にします。

`data-run`は表示とcancel用の一時情報であり、Mastra Memoryへ保存しません。browserの自動継続は、
最終stepに完了済みの`ui_*` toolだけが存在する場合に限定し、server tool完了では開始しません。

## Reasoning

production UIへraw reasoning全文を表示しません。`sendReasoning: false`を既定にし、boundedなstatusだけ表示します。

- default reasoningは`none`または`low`
- 複雑なtaskだけ`medium`
- title Agentはreasoningなし
- title生成はmain stream開始を妨げない
- text、tool call、tool resultが一定時間ないreasoning-only状態をtimeoutする
- tool side effect後の自動model retryは禁止する

## Web検索

nested research Agentを削除します。

```text
Product Agent
  → web_search tool
      → local/API query guard
      → direct public search provider
  → Product Agentが結果を要約
```

公開queryの完全一致、PIIとprivate情報拒否、quota、source URL検証は維持します。検索結果は本文とURLのbounded projectionだけを返し、provider固有payloadを保存しません。

OpenRouter server toolを利用する場合でも、別Agentを挟まずprovider adapterから直接呼びます。exact query保証が必要なため、queryをモデルに生成させる方式より直接search APIを優先します。

## Issue attachment tool

共有toolを次へ揃えます。

```text
get_issue
read_issue_attachment_image
add_issue_attachments
remove_issue_attachments
```

`add_issue_attachments`:

- `issueId`
- `expectedRevision`
- staged `assetIds`
- current permission
- asset owner、expiry、typeの検証
- promotion、Issue mutation、claim transfer、auditを同じtransaction

`remove_issue_attachments`:

- `issueId`
- `expectedRevision`
- `fileIds`
- current permission
- 対象Issue ownership
- thumbnail整合
- logical delete、Issue revision、auditを同じtransaction

raw bytes、R2 key、ETag、private URLをtool resultへ含めません。

## Approval、run quota、usage

### Run quota

APIが正本です。

- organization plan
- monthly run allowance
- concurrent run
- premium model
- Web search quota
- file quota

Mastraはstep、tool call、timeout、model retryの実行上限を扱います。

### Usage

AgentまたはAI Gatewayがprovider usageを観測し、APIへ1回settleします。APIはpricing、credit、planを適用してbillable ledgerを更新します。

Mastra observabilityはdebug、API usage ledgerは課金の正本です。

### Approval

- thread approval policyとcurrent permissionはAPIが正本
- suspension、resume、Workflow snapshotはMastraが正本
- prepared payload、expected revision、idempotency、business previewはAPIが正本
- execute時にcurrent membershipとpermissionを再検証する

Mastra Approvalだけをbusiness authorizationとして信用しません。

Mastra 1.52.1はWorkflowとAgent Approvalのsnapshotへ`RequestContext.toJSON()`を保存します。そのため
`RequestContext`はJSON-safeなopaque ID、expected revision、表示用policyだけに限定し、API client関数、
executor、settlement callback、grant、resume ticket、provider key、cookie、private URLを置きません。
executorとmodel adapterはcomposition closureから解決します。

Phase 1は秘密を含まないsuspend/resume schema、snapshot secret scan、同一processのapprove/declineを
完成させます。Worker再起動後のresumeはPhase 3で、APIがmembership、permission、revisionを再検証して
fresh capabilityを発行し、その場でconsumeする経路を完成させます。process-local registryだけを
再起動復元の根拠にしません。

## Workers AIとAI Gateway

Cloudflare bindingは`apps/agent`のcompositionとmodel adapterに閉じます。`packages/ai`は作りません。

```text
apps/agent/src/mastra/adapters/models/
  workers-ai.ts
  ai-gateway.ts
  model-routes.ts
```

APIはlogical routeと利用可否だけをgrantへ含めます。

```text
product-standard
product-premium
thread-title
web-search-summary
memory-observer
```

Agentがrouteからproviderとmodelを解決します。複数appで同じpolicyを使う要件が生じるまでpackageへ抽出しません。

## MCP topology

MCP serverは`apps/api`へ置きます。

```text
apps/api/src/mcp/
  route.ts
  server.ts
  authentication.ts
  principal.ts
  authorization.ts
  protected-resource-metadata.ts
  prompts/
  resources/
```

`apps/api`は`packages/agent-tools`をlocal executorへ接続します。`apps/agent`はimportしません。

Mastra `MCPServer`へ登録するもの:

- business tools
- 公開可能なprompts
- 公開可能なresources

登録しないもの:

- agents
- workflows
- sampling
- `ui_*`
- `rename_thread`
- internal skills
- system instructions

## MCP write

MCPではAgent Approvalを使いません。OAuth scopeと現在のpermissionを満たした場合に直接実行します。

```text
MCP tools/call
  → credential scope
  → current membership
  → current permission
  → tenant match
  → expected revision
  → idempotency
  → business transaction
  → audit
```

client側の確認UIへsecurityを依存させません。

JSON-RPC request IDはtransport上の相関値であり、業務冪等キーに使いません。write toolはclientが
明示した業務冪等キーをschemaで受け取り、principal、organization、tool、正規化payload digestと
組み合わせてreservationします。同じJSON-RPC IDで別操作が来ても同一業務とみなしません。

## OAuthとPAT

### OAuth

最初のMCP認証方式です。

- Authorization Code + PKCE
- organization単位consent
- OAuth resource audience
- short-lived access token
- refresh token
- revoke
- scopeとcurrent permissionの積

### PAT

最後のphaseで追加します。

- MCP専用
- organization固定
- audience固定
- secretは作成時に一度だけ表示
- DBにはhashだけ保存
- default expiry 90日
- tokenごとのrate limitとaudit
- membership削除時は即時無効
- Web session impersonationは不可

## Migration

後方互換性を維持しません。

削除対象:

- API側`agent_messages`
- API側context summary
- 独自canonical message
- legacy history reader
- dual write
- custom client continuation codecで不要になる部分
- nested Web Research Agent
- `InMemoryStore`

DB migration historyはappend-onlyを維持し、新しいdestructive migrationで旧tableとcolumnを削除します。既存migration fileを編集しません。

## Security invariant

- BrowserはAgent Workerを直接呼ばない
- Agent WorkerはApplication DBとR2を直接読まない
- MCP serverはAgent Workerをproxyしない
- tool inputからtenantを選ばせない
- OAuth tokenまたはPATはorganizationへ固定する
- `tools/call`ごとにcurrent permissionを再検証する
- destructive writeはexpected revisionとidempotencyを必須にする
- credential、prompt全文、private payload、raw reasoningをlogへ出さない
- archived threadはAgent DBへ残っていても読めない
- session失効、membership変更、organization切替、archive、hard delete、credential rotateの各時点で
  capabilityを再検証し、失効済み主体へMemoryやbusiness toolを公開しない
- snapshot、trace、Memory、stream、Sentryへgrant、resume ticket、provider key、private payloadを残さない

## 受入条件

- production Agentが`LibSQLStore`を使う
- Memoryからthreadとhistoryをreloadできる
- API側message repositoryが存在しない
- native tool stateがbrowserへ届く
- Stop直後に同じthreadで次turnを開始できる
- reasoning-only timeoutがfatal lockを残さない
- Web検索がnested Agentなしで動く
- Issue attachmentの追加、削除、読取がtoolから可能
- MCPが`apps/agent`へ依存せず全business toolを公開する
- MCP writeがscopeとcurrent permissionの両方を確認する
- OAuth flowが動作する
- PATは最終phaseとして独立して実装される
