---
id: ADR-008
title: Mastra-native Agent runtimeと専用Storage
status: proposed
date: 2026-07-28
owners:
  - repository-maintainers
supersedes:
  - none
related:
  - ../architecture/agent-runtime-and-mcp.md
  - ../agent/storage-memory.md
  - ../agent/runtime-reliability.md
---

# ADR-008 Mastra-native Agent runtimeと専用Storage

## 背景

現在の製品AgentはMastraをAgent定義とtool orchestrationに利用していますが、message history、context summary、approval、run settlementをAPI側で独自実装しています。Mastraには一時的な`InMemoryStore`だけを渡し、Storage、Memory、Approval、Workflow snapshotを実質的に使っていません。

その結果、Mastra streamをAI SDK streamへ変換した後に独自data partとcanonical messageへ再変換し、APIへ保存してからWebで再びUIMessageへ戻しています。tool state、abort、disconnect、reasoning、source、client tool continuationが複数のcodecを通るため、実行中server toolがerror表示になる、Stop後に次turnを開始できない、reasoningだけが流れ続けるなどの不具合を生みやすい構成です。

将来Memory、Workflow、observabilityを利用する計画があるため、API側の独自実装を継続すると二重実装が増えます。

## 決定

- Agentのmessage history、Memory、Workflow snapshot、suspended run、Agent observabilityをMastraへ移す
- `apps/agent`へAgent専用Tursoを追加し、Mastra `LibSQLStore`を使用する
- Application TursoとAgent Tursoはdatabaseとcredentialを分離する
- Agent専用TursoのMastra tableはDrizzleで管理しない
- Application DBの`agent_threads`はtenant認可台帳として残す
- Application DBとAgent DBで同じthread IDを使う
- APIでthread ownershipを検証した後、Service BindingでMastra Memoryを読む
- 初期実装ではtitle、message count、last message previewの読み取り用projectionを作らない
- native AI SDK streamとMastra tool stateを利用し、独自canonical message codecを削除する
- file-based agentのdirectory規約だけを採用し、登録はcode-basedのまま維持する
- schemaはValibotへ統一する
- 後方互換性、dual write、backfillは実装しない

## 理由

### Mastraの標準機能を使う

Memory、Approval、Workflow、observabilityを利用する予定であるため、それらと同じ状態をAPI側で再実装する合理性がありません。Mastraの標準Storageを使うことで、Studio、suspend/resume、process再起動後の復元を同じ契約へ揃えられます。

### 業務DBの影響範囲を広げない

Agent WorkerへApplication DB credentialを渡すと、message履歴のためにBetter Auth、organization、Issue、billing tableまで到達可能になります。専用DBならAgent runtimeの侵害、誤query、migration失敗の影響をAgent stateへ限定できます。

### Storage adapterを自作しない

AgentからAPIを経由する独自Mastra Storage adapterは、Storage API、pagination、filter、snapshot、migration互換性を自前保守することになります。自前実装量を減らす目的に反するため採用しません。

### 投影同期を初期要件にしない

Mastraはthread title、updatedAt、metadata、pagination、sortを持ちます。Application DBへ複製すると、stream切断、title失敗、retry、archive時の結果整合性を新たに管理する必要があります。実測または製品要件が生じるまで投影を作りません。

### code registrationを維持する

現在のAgentはRequestContextに応じてmodel、vision、write、tool allowlistを動的に構成します。file-based discoveryは機能差ではなく探索規約であり、betaの探索処理へprivate Worker entrypointを依存させる利益が小さいためです。

## 検討した代替案

### API側のmessage履歴を維持する

却下します。Memory、Workflow、Studio、observabilityとの二重実装が続きます。

### Application Tursoと同じdatabaseへMastra tableを置く

却下します。同じTurso organizationは許可しますが、credential、retention、schema lifecycle、backup、負荷の分離ができません。

### Agent WorkerからApplication Tursoへ直接接続する

却下します。tenant guardを各queryへ複製し、業務DBの影響範囲を広げます。

### API経由のComposite Storageを自作する

却下します。Mastra Storage contract追従の保守量が大きくなります。

### D1を最初のStorageにする

MemoryとWorkflowだけなら利用できますが、現在の要件ではMastra observabilityも利用します。LibSQLStoreでMemory、Workflow、score、低負荷observabilityを一つのadapterへ揃える方が単純です。

### 最初からClickHouseを使う

却下します。ClickHouseは高負荷observability向けであり、MemoryとWorkflowの主Storageではありません。trace量が増えた場合だけComposite Storageでobservability domainを移します。

### file-based agentへ全面移行する

却下します。動的tool compositionとprivate Worker entrypointを維持しつつ得られる削減量が小さく、beta機能への依存が増えます。

## 結果

### 利点

- API側のmessage table、context summary、独自history reconstructionを削除できる
- native tool state、abort、Approvalを利用できる
- Worker再起動後にMemoryとsuspended runを復元できる
- Mastra Studioとruntimeが同じStorageを参照できる
- Agent DBと業務DBのsecurity boundaryが明確になる

### 代償

- Application DBとAgent DBをまたぐSQL FKは作れない
- thread作成、archive、物理削除はcross-database lifecycleになる
- history取得はAPIからAgent WorkerへのService Bindingを1回必要とする
- Agent Storage停止時は履歴とAgent実行が利用できない
- developmentで2つのTurso databaseを起動する必要がある

### 整合性方針

- 認可はApplication DBで同期的に失効させる
- Agent DBの物理削除は失敗しても認可を復活させない
- 必要な削除retryだけoutboxで行う
- projectionは将来追加しても再構築可能な副次indexとする

## 強制方法

- `apps/agent`へApplication DB credentialを設定しない
- `apps/api`へAgent DB credentialを設定しない
- restricted importで`apps/api -> apps/agent`と`apps/agent -> packages/db/auth`を禁止する
- `packages/agent-contracts`と`packages/agent-tools`からapps、DB、Authへの依存を禁止する
- production Agent compositionで`InMemoryStore`を禁止する検査を置く
- API側の旧message/summary tableとrepositoryを削除する
- thread history routeはAPI認可後にAgent Memory gatewayだけを呼ぶ

## 検証

- G3でMemory、Storage、process再生成、Approval resumeを検査する
- G4でthread registry、Service Binding、archive後の非公開を検査する
- W4でnative tool stateとStop後の復旧を検査する
- E1でWebからMemory保存、reload、cancel、new turnを一巡させる
- production Worker buildとMastra Studio smokeを実行する
