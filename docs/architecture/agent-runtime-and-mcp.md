---
title: Agent runtimeとMCPの目標architecture
status: proposed
implementation: planned
last_reviewed: 2026-08-23
applies_to:
  - apps/agent/**
  - apps/api/src/modules/agent/**
  - apps/api/src/mcp/**
  - apps/web/src/features/agent/**
  - packages/agent-contracts/**
  - packages/auth/**
  - packages/db/**
related:
  - ../agent/runtime-reliability.md
  - ../agent/storage-memory.md
  - ../agent/mcp-integration.md
  - ../testing-strategy/agent-refactor-mcp.md
  - ../decisions/ADR-008-mastra-native-agent-runtime.md
  - ../decisions/ADR-009-mcp-authentication-and-direct-tools.md
  - ../decisions/ADR-015-runtime-owned-agent-and-mcp-tools.md
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
- AgentとMCPで同じbusiness schemaを再利用し、tool実行面は各runtimeが所有する
- tool inputへtenant ID、user ID、session ID、grant、access tokenを含めない
- OAuthとMCP writeを初期MCP範囲に含める
- PATはOAuth実装後の独立phaseにする
- release前のため旧Agent contractとの後方互換性を維持しない

## Runtime library baseline

Phase 1とPhase 2の実装基準はAI SDK 7、`@ai-sdk/react` 4、OpenRouter provider 3、
Mastra 1系、Node.js 24以上です。tool定義はMastra `createTool`、browser transportはAI SDK
`createUIMessageStream`と`createUIMessageStreamResponse`、最終化待機はAI SDK 7の`onEnd`へ
委譲します。独自tool DSL、独自UIMessage codec、stream末尾を検出するための
`TransformStream`は追加しません。

MastraのMemory付き生成とUIMessage streamへの接続は`@mastra/ai-sdk`の`handleChatStream`を使います。
現在のadapterが要求する`version: "v6"`はUIMessage互換contractの指定であり、ApplicationのAI SDK 6
依存を意味しません。adapterを迂回する手書き変換は作らず、Mastra側のAI SDK 7対応が公開された
場合は同じboundary内で更新します。

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
  ├─ @enterprise-agentic-saas/agent-contracts
  └─ @enterprise-agentic-saas/api/client

apps/agent
  ├─ @enterprise-agentic-saas/agent-contracts
  └─ Service Binding → apps/api private entrypoint

apps/api
  ├─ @enterprise-agentic-saas/agent-contracts
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

## 共有contractとruntime所有権

### `packages/agent-contracts`

Valibot schemaとそこから推論した型だけを所有します。

```text
packages/agent-contracts/
  src/
    chat.ts
    public-url.ts
    runtime.ts
    schemas.ts
    schema-types.ts
    tools.ts
    index.ts
```

含めるもの:

- chat request、run、action、execution、approval、streamに必要な公開schema
- internal control-plane requestとresponse
- business tool inputとoutput
- Agent、API、Webで意味が同じboundedな業務語彙

含めないもの:

- Mastra Agent
- Elysia app
- Drizzle schema
- repository
- permission判断
- provider client
- runtime credential

外部入力は原則として`v.strictObject`を使います。未知fieldを黙って削除せず拒否し、overpostingを検出します。

### `apps/agent`のtool factory

```text
apps/agent/src/mastra/tools/issues/
  tool-runtime.ts
  read/
    factories.ts
    tool.ts
  write/
    factories.ts
    tool.ts
```

Agent runtimeは次を所有します。

- 12件のMastra `createTool` factory
- `RequestContext`、run grant、budget、`toolCallId`
- Approval、suspend、idempotency、usageの実行順
- 画像のbounded metadataとAgent-local sidecar
- 固定public errorとprovider errorのcause境界

`web_search`、`rename_thread`、`ui_*`、Memory、Workflow、instructionも引き続きAgentだけが所有します。

### `apps/api`のMCP tool

```text
apps/api/src/mcp/
  contracts.ts
  tools/
    catalog.ts
    direct-tool.ts
    *-application.ts
```

APIは14件のMCP toolを`createMcpDirectTool`で登録し、OAuth scope、現在のpermission、tenant、JSON
Schema、array wrapping、idempotency、transaction、audit、`McpToolError`を所有します。Agent tool objectを
importせず、`read_account_context`と`get_issue`もAPI-localに直接登録します。

API専用として`apps/api`へ閉じるもの:

- MCP principal、error codeとerror class
- MCP writeのidempotency付きinputとreceipt
- upload session input/output
- MCP clientへ公開するdescription、annotation、JSON Schema

### 検査の所有権

`agent-contracts`はtypecheck、lint、exports、import boundary、cycle、公開Valibot schemaの
strict/bounded validationを所有します。Agent factoryの実行時契約と100% coverage gateはG2、MCP direct
toolのregistry、JSON Schema、scope、permission、error、idempotency、auditはA1からA4が所有します。

consumer固有のValibot境界はA1とG2、Agent compositionはG2、MCP登録はA4でも検査します。
package固有の公開テスト層は作りません。

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

production、Studio、testは同じstorage factoryを利用し、chat、Memory、通常のWorkflowでは
isolate内の1 instanceを再利用します。例外は別requestで承認Workflowをresumeする経路です。
Cloudflareのrequest scopeを越えて元のMastra実行objectを再利用せず、同じAgent DBへ接続する標準
`LibSQLStore`とMastraをresume request内で生成します。APIがcaller signalと50秒のdeadlineを所有し、
Agentはticket消費前とbusiness write直前に同じsignalを検査します。timeout時の公開応答は
`service_unavailable`と`Retry-After: 30`です。request専用Storageのcloseはresponseと分離して
`waitUntil`へ渡し、2秒で打ち切ります。rejectまたはtimeoutはraw causeを記録せず、固定code
`resume_storage_close_failed`だけで観測します。既存storage instanceを別のMastraへ渡すと
`storage.__registerMastra()`が所有者を差し替えるため共有しません。productionではAgent DB URLが
Application DB URLと同一なら起動を拒否します。

### Application DBとの最小同期

message履歴とtitleはMastra標準Memoryが所有します。Application DBとの同期点を次に限定します。

- chat開始時のticket消費、認可、quota予約、run grant発行をまとめた`startChatRun`
- business toolごとの認可済みtransaction
- main model usageとrunのterminal状態を1回で確定する`finalizeRun`

`waiting_approval`はbusiness action transactionがrunを遷移させます。Memory commit専用のAPI、
Application DB message副本、thread title、message count、last message、commit状態のprojectionは
作りません。

Memoryの読込、保存、title生成はMastra標準機能へ委譲します。streamは独自commit barrierを待たず、
Worker eviction、OOM、`SIGKILL`時の未保存messageはbest-effortです。独自Workflow stage、
reconciliation、drainでMastra Memoryと同じ状態を再実装しません。公開可否は各readでApplication
registryを検証してfail closedにします。

標準`MessageHistory`には、有効なreasoning本文、ツール入力・出力、approval、`skill`本文を保持します。
message全体を独自スキーマへ写し替える全面的なsecurity projectionは置きません。
`memory-persistence-guard`は、現在のmodel turnで使った生のメディアが
`providerMetadata.mastra.modelOutput`へ複製された副本だけを保存前に除去します。reasoning detailを含む
provider metadata、検証失敗を含むツール入力・出力、`file`・`source`類、live streamは変更しません。
ブラウザーへ返すhistoryは別の薄い公開projectionとし、Memoryへ逆流させません。

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
title生成はMastra Memoryの`generateTitle`へ委譲するbest-effort処理です。main responseは完了を待たず、
失敗時は既定titleを維持します。補助modelの厳密usage課金や独自Title Agentは持ちません。

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
  → streamを開いたままAI SDKのmessage metadataでopaque run IDを受け取る
  → run IDを使って認可済みexplicit cancel commandを送る
  → runを冪等にcanceledへ遷移
  → quota reservationとgrantを解放
  → browser streamをlocal abortする
  → pending submission IDを破棄
  → draftだけ復元
  → clearError
  → 次turnは新しいmessage ID
```

network disconnectとprovider errorだけを同一submission IDでretry可能にします。
Stop時のpartial assistant outputとrun ID metadataはsession-local UIだけに残し、Mastra Storageへ保存しません。
履歴の再読込は停止したuser messageだけを返します。cancelは未使用のgrant、concurrency reservation、
leaseを解放しますが、既に消費したmodel、Web検索、vision quotaを払い戻しません。

`enable_request_signal`とAPIの`request_signal_passthrough`は本番Workerの防御層です。Stopの正本は
browser abortと認可済みexplicit cancelの組み合わせであり、network disconnectだけでDB上の
`canceled`を保証しません。今回のlocal multi-config E1 harnessではdisconnect単独のterminal cancelを
決定的に観測できなかったため、E1はexplicit cancel、G3/G4はAgentへ直接渡した`Request.signal`の
abort分類とcancel先行settlementを検査します。

run IDのmessage metadataは表示とcancel用の一時情報であり、Mastra Memoryへ保存しません。browserの自動継続は、
最終stepに完了済みの`ui_*` toolだけが存在する場合に限定し、server tool完了では開始しません。

## Reasoning

Product AgentはAI SDK標準reasoning partを`sendReasoning: true`で送信し、本文をMastra Memoryへ保存して
再表示します。OpenRouter `reasoning_details`を含むprovider metadataは次turnへ再送しますが、
reasoning detailとprovider metadataはserver外へ出しません。存在しない非公開
chain-of-thoughtを別modelで生成しません。

- Product Agentは`openrouter-gpt-5.6-luna-xhigh` profileを使い、reasoning `xhigh`、最大出力4,096 tokenとする
- Mastra Memoryのtitle補助と直接Web検索補助は同じLunaのreasoning `none`
- title生成はmain stream開始を妨げない
- liveness再検証はmodel境界1か所に限定し、provider開始前と`TransformStream.flush()`の2回だけ
  `assertRunLive`を呼ぶ。stream断片ごとの再検証と時間制限付きleaseは置かない
- 開始済みstreamの途中で認可が失効した場合、完了再検証までに生成済みの断片はbrowserへ届き得る。
  完了再検証が成功した場合だけ最終結果、Memory保存、次のmodel/tool stepを受理する。失敗時も現在の
  stream断片は回収せず、Memory保存、次のmodel/tool step、業務副作用を拒否する。Stopとrequest abortは
  即時に中断する
- reasoning/text/toolを独自watchdogで分類せず、reasoning-onlyでも270秒のrun全体上限を延長しない
- tool side effect後の自動model retryは禁止する

## Web検索

nested research Agentを削除します。

```text
Product Agent
  → web_search tool
      → API authorizeWebSearch
          → query guard
          → idempotent quota reservation
      → direct public search provider
  → Product Agentが結果を要約
```

公開queryの完全一致、PIIとprivate情報拒否、quota、source URL検証は維持します。外側の空白だけを
除いた2〜200文字のqueryを検証し、その同じ文字列をOpenRouterのJSON promptへ変更せず渡します。
provider内の検索engineが内部で使うquery文字列までは保証しません。検索は25秒、`maxRetries: 0`、
reasoningなしです。現在はOpenRouterへLunaとExa `web` plugin
（`max_results: 3`）を持つ1 requestだけを送り、検索結果は本文とURLのbounded projectionだけを返し、
provider固有payloadを保存しません。

AgentからAPIへの呼び出しは`authorizeWebSearch`の1回です。APIはqueryを拒否した場合にquotaを予約せず、
認可済みqueryだけを明示的なoperation IDで冪等予約します。guardと予約を別のAgent向け操作として
公開しません。

Phase 2のlive compatibility確認では当時のQwen向けbeta server tool requestがHTTP 500で完了しなかったため、
非推奨予定のpluginを一時利用します。provider SDKまたはroute更新後にserver toolを再検証し、
exact query、1 request、public source projection、timeout、G5 3/3を維持できた時点で置き換えます。
どちらの経路でも別Agentを挟みません。

ツールexecutor、公開history、API client、Webは`agent-contracts`の同じpublic URL canonicalizerを使います。
tool resultのsourceはcanonical `source-url` partへ昇格し、既存sourceとcanonical URL単位で重複排除します。
provider由来queryとfragmentは名前に依存せず全体を除去し、userinfo、private/reserved hostは拒否します。

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
- current Issue update permission
- asset owner、expiry、typeの検証
- promotion、Issue mutation、claim transfer、auditを同じtransaction

`remove_issue_attachments`:

- `issueId`
- `expectedRevision`
- `fileIds`
- current Issue update permission
- 対象Issue ownership
- thumbnail整合
- typed owner/file rowのhard delete、Issue revision、auditを同じtransaction
- physical objectは同じtransactionで`deleting`へ遷移し、storage cleanupへ引き渡す

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

Mastraはstep、tool call、timeoutの実行上限を扱います。model responseの自動retryは行いません。

### Usage

AgentまたはAI Gatewayがprovider usageを観測し、`finalizeRun`でterminal状態とともにAPIへ1回だけ
渡します。APIはpricing、credit、planを適用してbillable ledgerを更新し、usage記録の失敗時も
runを`running`へ残しません。

Mastra observabilityはdebug、API usage ledgerは課金の正本です。

Phase 3ではdirect provider検索をAI Gatewayのmain/search run profileへ統合し、main model、検索provider、検索toolのusageを同じrun IDで相関しつつ、それぞれを重複なく1回だけsettleする契約を確定します。

### Approval

- thread approval policyとcurrent permissionはAPIが正本
- suspension、resume、Workflow snapshotはMastraが正本
- prepared payload、expected revision、idempotency、business previewはAPIが正本
- execute時にcurrent membershipとpermissionを再検証する

Mastra Approvalだけをbusiness authorizationとして信用しません。

Mastra 1.53.0はWorkflowとAgent Approvalのsnapshotへ`RequestContext.toJSON()`を保存します。そのため
`RequestContext`はJSON-safeなopaque ID、expected revision、表示用policyだけに限定し、API client関数、
executor、settlement callback、grant、resume ticket、provider key、cookie、private URLを置きません。
executorとmodel adapterはcomposition closureから解決します。

継続requestでは、永続化済みsnapshotを共有する一方、Workflow、`Run`、実行registryをrequestごとに
新しく組み立てます。Cloudflare Workersの別requestへ、以前のrequestで作成した`Run`や中断制御を
持ち越しません。再開時はAPIがmembership、permission、revisionを再検証してfresh `capability`を
発行し、その場でconsumeします。process-local registryだけを再開または再起動復元の根拠にしません。

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
web-search-summary
memory-observer
```

Agentがrouteからproviderとmodelを解決します。複数appで同じpolicyを使う要件が生じるまでpackageへ抽出しません。

## MCP topology

MCP serverは`apps/api`へ置きます。

```text
apps/api/src/mcp/
  module.ts
  server.ts
  authentication.ts
  principal.ts
  tools/
  prompts/
  resources/
```

`apps/api`は共有Valibot schemaをAPI-local application serviceへ接続します。Agentのtool factoryと
`apps/agent`はimportしません。

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

添付binaryはtool inputへ含めません。`create_attachment_upload_session`が返すOAuth保護済みの短命URLへ
exact sizeとcontent typeを固定してPUTし、readyになったopaque asset IDだけをIssue mutationへ渡します。
staging objectからfile claimへの移行、Issue revision、quota、audit、receiptは同じDB transactionで確定します。

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

Webの認可画面は既存の組織選択表示を再利用し、組織アイコン、member avatar、member count、roleを同じ
projectionから表示します。scope consentは要求されたscopeの部分集合を表形式で選択し、対象行・操作列の
一括操作を許可します。`offline_access`は業務権限から分離し、permission scopeが1つ以上ない同意は
発行しません。アカウント設定ではraw tokenを表示せず、client、組織、role、scope、期限だけを一覧し、
credential family単位でrevokeします。

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
- snapshot、Memory、stream、production log、remote telemetryへgrant、resume ticket、provider key、private payloadを残さない

## 受入条件

- production Agentが`LibSQLStore`を使う
- Memoryからthreadとhistoryをreloadできる
- API側message repositoryが存在しない
- native tool stateがbrowserへ届く
- Stop直後に同じthreadで次turnを開始できる
- model境界のliveness再検証と270秒のrun全体timeoutがfatal lockを残さず、stream層に重複したliveness wrapperを置かない
- Web検索がnested Agentなしで動く
- Issue attachmentの追加、削除、読取がtoolから可能
- MCPが`apps/agent`へ依存せず全business toolを公開する
- MCP writeがscopeとcurrent permissionの両方を確認する
- OAuth flowが動作する
- PATは最終phaseとして独立して実装される
