---
id: PLAN-2026-010
title: Mastra-native Agentリファクタとremote MCP導入
status: active
created: 2026-07-28
owners:
  - repository-maintainers
linked_specs:
  - ../../architecture/agent-runtime-and-mcp.md
  - ../../agent/runtime-reliability.md
  - ../../agent/storage-memory.md
  - ../../agent/mcp-integration.md
  - ../../testing-strategy/agent-refactor-mcp.md
linked_adrs:
  - ../../decisions/ADR-005-agent-runtime-under-src-mastra.md
  - ../../decisions/ADR-006-migration-history-append-only.md
  - ../../decisions/ADR-007-workspace-testing-strategy.md
  - ../../decisions/ADR-008-mastra-native-agent-runtime.md
  - ../../decisions/ADR-009-mcp-authentication-and-direct-tools.md
---

# Mastra-native Agentリファクタとremote MCP導入

## 目的

現在の多重stream変換、API側message永続化、custom approval、nested Web research Agentを整理し、Mastra Memory、Storage、native AI SDK stream、Approval、Workflow、observabilityを標準経路として利用します。

構造切替後に既知不具合を再現し、残っている原因だけを修正します。その後、`apps/api`へMastra MCPServerとOAuthを導入し、read/writeを含む全business toolを直接実行できるようにします。PAT形式のMCP個人アクセストークンは最後のphaseへ分離します。

## 対象外

- MCPから製品Agentをsubagentとして呼ぶこと
- MCPへAgentまたはWorkflowを自動公開すること
- file-based agent discoveryへの全面移行
- Application DBとAgent DBを同じdatabaseへ統合すること
- 初期段階のClickHouse
- 旧Agent contractの後方互換layer
- dual writeとbackfill
- PATをOAuthより先に実装すること
- 本計画内でservice accountを実装すること

## 前提条件

- branchは`major-refactor`
- migration historyはappend-only
- release前のため破壊的なAgent contract変更を許容する
- schemaはValibotへ統一する
- file-based風directoryを採用するが、registrationはcode-based
- `packages/agent-contracts`と`packages/agent-tools`は、静的検査に加えて公開schemaと薄い
  `createTool` factoryの実行時契約テストを同じpackageに配置する
- Agent WorkerはApplication DBとR2へ直接接続しない
- API WorkerはAgent DBへ直接接続しない
- MCP writeはOAuth scopeとcurrent permissionで直接実行する

## 変更対象path

```text
apps/agent/**
apps/api/src/modules/agent/**
apps/api/src/mcp/**
apps/web/src/features/agent/**
packages/agent-contracts/**
packages/agent-tools/**
packages/auth/**
packages/db/**
docs/architecture/**
docs/agent/**
docs/testing-strategy/**
docs/decisions/**
docs/exec-plans/**
oxlint.config.ts
knip.config.ts
turbo.json
.github/workflows/**
```

## 最終directory

```text
packages/
  agent-contracts/
  agent-tools/

apps/agent/src/mastra/
  index.ts
  storage.ts
  observability.ts
  agents/
    product-agent/
    thread-title-agent/
  workflows/
    approved-issue-action/
  tools/
    web-search/
    thread/
    client/
  adapters/
    control-plane/
    models/
    telemetry/

apps/api/src/
  modules/agent/
  mcp/
```

## 作業単位

# Phase 1 Mastra-native runtimeへの切替

このphaseから開始します。旧構造へ先行hotfixを積みません。

### 1.1 Package境界

- [x] `packages/agent-contracts`を作成する
- [x] productionのserialized request、response、tool schemaをValibotへ移す
- [x] productionのserialized contractにある手書き型をValibot推論型へ置き換える
- [x] production runtimeのZod schemaを削除する
- [x] `packages/agent-tools`を作成する
- [x] shared business toolsをMastra `createTool` factoryとして移す
- [x] 薄い`AgentToolExecutor`だけを定義する
- [x] custom Capability DSL、registry、generic dispatcherを作らない
- [x] `apps/agent -> apps/api/agent-client`のcompile dependencyを削除する
- [x] restricted import、exports、knipを更新する

Zodは外部AI SDKとのtest doubleおよびeval runnerの入力契約にだけ残し、production runtimeの
serialized contractには使用しません。

### 1.2 Agent directory

- [x] 1 Agent 1 directoryへ移動する
- [x] `instructions.ts`、`memory.ts`、`tools.ts`、`skills/`をAgent directoryへ置く
- [x] `src/mastra/index.ts`でcode registrationを維持する
- [x] file discoveryをproductionとStudioの正本にしない
- [x] productionとStudioが同じMastra compositionを使う

### 1.3 Agent専用Turso

- [x] `@mastra/libsql`を追加する
- [x] `MASTRA_STORAGE_URL`と`MASTRA_STORAGE_AUTH_TOKEN`を追加する
- [x] Application Tursoとはdatabaseとcredentialを分ける
- [x] `InMemoryStore`を削除する
- [x] `LibSQLStore`をproduction、Studio、test factoryへ接続する
- [x] `storage:dev`、`storage:reset`、`storage:smoke`を`apps/agent`へ追加する
- [x] Agent DBへDrizzle schemaを作らない
- [x] local developmentでApplication DBとAgent DBを同時起動する

### 1.4 Memoryとthread

- [x] Product AgentへMastra Memoryを設定する
- [x] Mastra Storageを完全なthread/message履歴の正本、Memoryを同じthread内のモデル入力文脈として分離する
- [x] Memoryの`resourceId`とthread取得を認証済みuser、organization、threadへ固定する
- [x] Application DBの`agent_threads`を認可台帳へ縮小する
- [x] Application DBとAgent DBで同じthread IDを使う
- [x] API認可後にAgent Memoryからthread listとhistoryを取得するService Binding entrypointを追加する
- [x] API側`agent_messages`を削除する
- [x] API側context summary tableとrepositoryを削除する
- [x] API側history reconstructionを削除する
- [x] 初期thread contractからmessage countを外す
- [x] 読み取り用projectionを作らない
- [x] archiveはApplication registryだけを先に失効し、以後のAgent Memory公開を拒否する

### 1.5 Native stream

- [x] Mastra native AI SDK UIMessage streamを返す
- [x] `toAISdkStream`後の再包装を削除する
- [x] 独自canonical message codecを削除する
- [x] API側`appendRunMessages`を削除する
- [x] raw reasoningのstream、保存、表示を停止する
- [x] context meterとtitle更新をstream data partへ依存させない
- [x] server toolとclient toolのrouteを分離する
- [x] `ui_*`だけをbrowser client toolとして登録する

### 1.6 ApprovalとWorkflowの基盤

- [x] APIのthread approval policyを維持する
- [x] business prepared actionとpreviewをAPIへ維持する
- [x] suspensionとresumeをMastra WorkflowまたはAgent Approvalへ移す
- [x] snapshotへcredentialを保存しない
- [x] file-backed snapshotを再openし、closureから参照可能なcredential、private URL、capabilityがraw rowへ残らないことを検査する
- [x] `RequestContext`へ関数、API client、grant、token、provider key、resume ticketを置かない
- [x] Workflow factory closureでexecutorを注入し、resume時はAPI再認可後のcapabilityを即時consumeする
- [x] Phase 1ではJSON-safeなsuspend/resume基盤とsnapshot secret scanまでを必須にし、再起動resumeはPhase 3で完成させる
- [ ] reload後にsuspended runを再発見できる
- [ ] custom resume endpointとsnapshot wrapperのうち不要になるものを削除する

### 1.7 Destructive migration

- [x] 新しいappend-only migrationを生成する
- [x] 旧message、summary、不要columnを削除する
- [x] 旧migration historyを編集しない
- [x] dual read、dual write、backfillを作らない
- [x] development seedとfixtureを新schemaへ更新する
- [x] `agent_threads`は6列の認可台帳へappend-only migrationで再構築し、archive済み行だけ旧`updated_at`を`archived_at`へ移す
- [x] `agent_runs`と子FKを維持し、upgrade fixtureで`foreign_key_check`を確認する
- [x] destructive migration適用前にAgent flagを無効化した互換APIをdeployし、healthとOpenAPI smokeを通すrollout順序をCIで固定する
- [x] Web検索queryのserver-owned hashをticket、grant、runへ伝播するappend-only migrationを生成し、public suffixによるattestation偽装を拒否する

### Phase 1 exit criteria

- [x] production Agentが`LibSQLStore`を使う
- [x] Memoryからhistoryをreloadできる
- [x] API側message tableとcanonical codecがない
- [x] native tool stateがWebへ届く
- [x] application/agent DB credentialが分離される
- [x] G1からG4、A1からA5、W1からW4の対象testが通る
- [x] Studio smokeとCloudflare buildが通る

# Phase 2 既知不具合の再検証と修正

Phase 1完了後に同じ操作を再現します。構造切替で解消した症状には追加patchを作りません。

### 2.1 Tool UI

- [ ] server tool実行中にerror表示されないことを再現確認する
- [ ] browser `onToolCall`が`ui_*`以外を無視することを確認する
- [ ] running、completed、denied、failedの表示を分離する
- [ ] tool-local errorをglobal errorへ昇格させない
- [ ] raw tool payloadを既定表示しない

### 2.2 Stop

- [ ] Stopを正常cancelとして扱う
- [ ] stream先頭の一時的な`data-run` partでopaque run IDをWebへ渡す
- [ ] abort時にpending submission IDを破棄する
- [ ] draftだけを復元する
- [ ] `clearError()`を呼ぶ
- [ ] explicit cancel APIを追加する
- [ ] cancel、Agent abort、expiryを冪等にする
- [ ] cancel完了後に次turnを開始できる
- [ ] quota reservationとgrantが残らない
- [ ] 最終stepが完了済み`ui_*`だけの場合に限りclient tool結果を自動送信する

### 2.3 Reasoning

- [ ] `sendReasoning: false`をproduction既定にする
- [ ] default reasoningを`none`または`low`へ下げる
- [ ] title生成をmain stream開始前に待たない
- [ ] useful-output watchdogを追加する
- [ ] run全体timeoutを明示する
- [ ] tool side effect後の自動retryを禁止する
- [ ] reasoning-only synthetic scenarioを追加する

### 2.4 Web検索

- [ ] nested Public Web Research Agentを削除する
- [ ] direct search provider adapterへ置き換える
- [ ] exact query、PII/private guard、quotaを維持する
- [ ] source URL parserをprovider contractへ合わせる
- [ ] provider failureをtool-local errorへする
- [ ] success、timeout、invalid source、quota、guard failureを検査する

### 2.5 Issue attachment

- [ ] `add_issue_attachments`を追加する
- [ ] `remove_issue_attachments`を追加する
- [ ] `get_issue`と`read_issue_attachment_image`を共有toolへ移す
- [ ] promotion、claim transfer、revision、auditをtransaction化する
- [ ] thumbnail整合を保つ
- [ ] Web、Agent、MCPで同じcontractを利用する

### Phase 2 exit criteria

- [ ] 既知5症状の全再現testが成功する
- [ ] Stop後に同じthreadで3回連続送信できる
- [ ] Web検索がsource付きで成功する
- [ ] attachment add/read/removeがE1で一巡する
- [ ] fatal Agent errorがtool-local failureから発生しない

# Phase 3 Mastra機能とCloudflare AI基盤

### 3.1 WorkflowとApproval

- [ ] prepared actionをMastra Workflowへ接続する
- [ ] suspend、resume、process再生成を検査する
- [ ] Full accessでは同じexecute boundaryへ直行する
- [ ] Ask alwaysではAPI生成previewを表示する
- [ ] current permissionとexpected revisionをexecute時に再検証する

### 3.2 Observability

- [ ] Mastra observabilityをAgent Tursoへ保存する
- [ ] run IDをSentryとAI Gatewayへ伝播する
- [ ] prompt、reasoning、private payloadをredactする
- [ ] time to first useful outputとreasoning-only durationを記録する
- [ ] trace量を計測する
- [ ] ClickHouseは導入条件を満たすまで追加しない

### 3.3 Workers AIとAI Gateway

- [ ] model adapterを`apps/agent/src/mastra/adapters/models`へ置く
- [ ] Cloudflare bindingをcomposition rootだけで扱う
- [ ] logical model routeをAPI grantへ含める
- [ ] Workers AIとAI Gatewayのprovider差をAgent定義へ漏らさない
- [ ] `packages/ai`を作らない

### Phase 3 exit criteria

- [ ] approvalをWorker再起動後にresumeできる
- [ ] traceとusageをrun IDで相関できる
- [ ] provider差し替えでAgent tool contractが変わらない

# Phase 4 remote MCPとOAuth

PATはこのphaseへ含めません。

### 4.1 MCP server

- [ ] `apps/api/src/mcp`を追加する
- [ ] Mastra `MCPServer`を追加する
- [ ] Cloudflare serverless transportへ接続する
- [ ] `packages/agent-tools`をlocal executorへ接続する
- [ ] `apps/api -> apps/agent`依存がないことを固定する
- [ ] Agent、Workflow、samplingを登録しない
- [ ] promptsとresourcesへ公開skillsを追加する

### 4.2 OAuth

- [ ] Better Auth OAuth Providerを追加する
- [ ] protected resource metadataを追加する
- [ ] Authorization Code + PKCEを実装する
- [ ] login、organization選択、consent、callbackを実装する
- [ ] access token、refresh token、revokeを実装する
- [ ] credentialを1 organizationへ固定する
- [ ] resource audienceを検証する

### 4.3 Scopesと全tool

- [ ] account、organization、member、Issue、file scopeを定義する
- [ ] read toolsを登録する
- [ ] create、update、deleteを登録する
- [ ] attachment add/remove/readを登録する
- [ ] upload sessionとstatusを登録する
- [ ] `tools/list`をscopeとcurrent permissionで絞る
- [ ] `tools/call`でcurrent permissionを再検証する
- [ ] writeを直接実行する
- [ ] expected revision、idempotency、auditを適用する

### Phase 4 exit criteria

- [ ] OAuth MCP E1 journeyがread/writeを一巡する
- [ ] MCP requestがAgent Workerを経由しない
- [ ] AgentとWorkflowがMCP registryにない
- [ ] membership変更とrevokeが即時反映される
- [ ] ChatGPT、Codex、Claude Code相当client configを文書化する

# Phase 5 PAT形式のMCP個人アクセストークン

最後に実装します。

### 5.1 Credential

- [ ] Better Auth API Key pluginまたは同等のhash storageを追加する
- [ ] MCP専用audienceを固定する
- [ ] tokenを1 organizationへ固定する
- [ ] default expiry 90日、max 365日を設定する
- [ ] 作成時にsecretを1回だけ表示する
- [ ] listではprefix、name、scope、expiry、last usedだけを返す
- [ ] revokeとrotationを実装する
- [ ] Web session impersonationを無効にする

### 5.2 UIとclient

- [ ] fresh authentication後だけ発行できる
- [ ] token名、organization、scope、expiryを選択する
- [ ] Codex用environment variable例を追加する
- [ ] Claude Code、OpenClaw、Hermes用Authorization header例を追加する
- [ ] secretをrepository、log、telemetryへ残さない

### 5.3 Test

- [ ] OAuthとPATが同じMcpPrincipal authorizationを通る
- [ ] scope不足、membership削除、expiry、revokeを確認する
- [ ] PAT E1 journeyを追加する
- [ ] PATなしのOAuth journeyを壊していない

### Phase 5 exit criteria

- [ ] headless clientがbrowserなしで接続できる
- [ ] revoke後の次requestが401になる
- [ ] OAuthとPATのtool authorization結果が一致する
- [ ] secretがhash以外で永続化されない

## 進捗

- [x] 現行実装、既知不具合、文書体系を確認した
- [x] 目標architectureと責務分担を決定した
- [x] Phase 1から開始し、PATを最後に分離する方針を決定した
- [x] Phase 1Aとしてpackage境界、`get_issue` factory、Service Binding response検証を実装した
- [x] Phase 1を実装した
- [ ] Phase 2を実装した
- [ ] Phase 3を実装した
- [ ] Phase 4を実装した
- [ ] Phase 5を実装した
- [ ] 全受入条件と証跡を確認した

## 判断記録

| 日付       | 判断                                                           | 理由                                                                            |
| ---------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 2026-07-28 | bug hotfixよりPhase 1の構造切替を先に行う                      | 多重wrapperが共通原因の可能性が高く、旧構造へのpatchが捨て実装になり得る        |
| 2026-07-28 | Valibotへ統一する                                              | MastraがStandard JSON Schema経由で利用でき、APIと既存stackに合う                |
| 2026-07-28 | file-based風directoryだけ採用する                              | 動的tool compositionとprivate Worker entrypointをcode registrationで維持する    |
| 2026-07-28 | Agent専用Tursoを使う                                           | Mastra observabilityを使いながらApplication DB credentialをAgentへ渡さない      |
| 2026-07-28 | 読み取り用projectionを初期実装しない                           | cross-database同期と二重正本を避ける                                            |
| 2026-07-28 | MCP serverをAPIへ置く                                          | business authorizationとtransactionを追加hopなしで実行する                      |
| 2026-07-28 | MCP writeをscopeとpermissionで直接実行する                     | MCP client自身がagent loopを持ち、Web approvalへ依存させない                    |
| 2026-07-28 | PATは最後のphaseにする                                         | OAuth、scope、principal、tool authorizationを先に安定させる                     |
| 2026-07-28 | `agent-contracts`と`agent-tools`は静的検査と契約testを所有する | business logicを持たず、最小runtime contractをcolocatedしてconsumerでも検査する |
| 2026-07-28 | package公開契約の実行時テストを同じpackageへ配置する           | schema/factory破損をconsumer testだけに依存せず最短で検出する                   |
| 2026-07-28 | AgentはService BindingのJSON responseをendpoint別に検証する    | private field、未知field、型不一致、過大bodyをAgent runtimeへ入れない           |
| 2026-07-28 | JSON-RPC request IDを業務冪等キーへ使用しない                  | transport retryと同じIDの別業務操作を混同せず、明示的なclient keyを要求する     |
| 2026-07-28 | Approval永続化をPhase 1とPhase 3へ分ける                       | Phase 1で秘密を含まないsnapshot基盤を作り、Phase 3で再起動resumeを完成させる    |

## 検証証跡

| command                                       | 結果   | 証跡                                     |
| --------------------------------------------- | ------ | ---------------------------------------- |
| `bun run check`                               | 成功   | Phase 1、2026-07-28                      |
| `bun run typecheck`                           | 成功   | `bun run check`内                        |
| `bun run lint`                                | 成功   | `bun run check`内                        |
| `bun run test`                                | 成功   | `bun run check`内                        |
| `bun run --cwd packages/agent-contracts test` | 成功   | 49 tests、coverage 100%                  |
| `bun run --cwd packages/agent-tools test`     | 成功   | 13 tests、coverage 100%                  |
| `bun run --cwd apps/agent test`               | 成功   | 198 tests、coverage閾値内                |
| `bun run --cwd apps/api test`                 | 成功   | 317 tests、localhost許可                 |
| `bun run --cwd packages/db db:check`          | 成功   | schema、migration、snapshot整合          |
| `bun run test:browser`                        | 成功   | UI 95、Web 248、browser 6、W6 17+1 tests |
| `bun run test:e2e`                            | 成功   | E1 3 tests                               |
| `bun run test:eval:agent`                     | 未実行 | Phase 2、3                               |
| `bun run build:cloudflare`                    | 成功   | Phase 1、3 Workers build                 |
| `bun run dev:studio`、`studio:*`              | 成功   | health、3 Agents、paid smoke             |

## リスクとrollback

### リスク

- native streamへ切り替える途中でUIMessage contractが崩れる
- Agent DBとApplication registryのorphanが生じる
- Mastra version更新でStorage schemaが変わる
- Stopとcancelの競合が残る
- Web検索provider contractが不安定
- OAuth metadata、callback、consentがclientごとに異なる
- PATが漏洩するとexpiryまで利用される

### Rollback

後方互換layerは作りません。phaseごとにbranchまたはcommit boundaryを明確にし、phase未完了の変更全体をrevertします。

- Phase 1 rollback: migration適用前はcommitへ戻し、固定local Agent DBだけを`storage:reset`する。
  migration適用後は単純revertせず、new runを停止し、事前clone/dumpへ接続を戻してtokenをrotateする
- Phase 2 rollback: native runtimeは維持し、個別reliability変更だけrevertする
- Phase 3 rollback: observability、provider adapter、Workflow変更を個別に無効化する
- Phase 4 rollback: `/mcp` routeとOAuth Providerを無効化し、Web Agentを維持する
- Phase 5 rollback: PAT発行を無効化し、既存PATを一括revokeしてOAuthを維持する

本番dataが存在する場合、destructive migration前にApplication DBとAgent DBを別々にcloneまたはdumpし、
件数と復元手順を確認します。remote DB変更は別途明示承認を必要とし、migration fileはappend-onlyのままです。

## Phase別の必須検査

- 各phaseで`bun run check`、`bun run test:browser`、`bun run test:e2e`、
  `bun run build:cloudflare`を実行する
- Phase 1のE1はApplication libSQLと別のAgent libSQLを使い、Browser Modeを省略しない
- Phase 2とPhase 3はG5の各caseを3回中3回成功させる
- `test:e2e:full`のE2はrelease候補だけで実行し、Phase 1からPhase 3の日常必須検査にはしない

## 完了条件

- Phase 1からPhase 5のexit criteriaを満たす
- 既知5不具合が再現testで解消される
- API側の独自message historyとcanonical codecが削除される
- Mastra Memory、Storage、Approval/Workflow、observabilityが有効になる
- Agent DBとApplication DBがcredential分離される
- Issue attachment add/remove/readがWeb AgentとMCPで共通利用できる
- MCP OAuthで全business toolをread/writeできる
- PATが最後のphaseで追加される
- A1からA5、G1からG5、W1からW6、AUTH1からAUTH4、E1/E2の番号体系を維持する
- `bun run check`、Browser Mode、E1、必要なG5/E2、Cloudflare build、Studio smokeが成功する
- 規範文書とADRを`accepted`、実装を`active`へ更新する
- 本planを`completed/`へ移す
