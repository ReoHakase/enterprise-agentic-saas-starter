---
title: Agentテスト戦略
status: accepted
implementation: active
last_reviewed: 2026-07-25
applies_to:
  - apps/agent/src/mastra/**
  - apps/api/src/modules/agent/**
---

# Agentテスト戦略

## テストピラミッド

| layer | 対象                                         | model                  | runner             | script            |
| ----- | -------------------------------------------- | ---------------------- | ------------------ | ----------------- |
| G1    | core、policy、usage、message                 | none                   | Vitest             | `test`            |
| G2    | tool executor                                | none                   | Vitest             | `test`            |
| G3    | agent loop、tool call、approval、stream      | scripted model         | Vitest             | `test`            |
| G4    | Agent/API contract、capability、temporary DB | scripted request/model | owner別Vitest      | `test`            |
| G5    | prompt/tool behaviour                        | real paid model        | Vitest/Mastra eval | `test:eval:agent` |

G1からG4がrelease gateの決定論的な正本です。G5はmodel selectionの回帰を検出しますが、
authorization、privacy、idempotencyの証明には使いません。

## G2 tool executor

全toolで検証:

- strict schema: unknown key、trim、Unicode、nullable、opaque ID、silent coercion
- permission、budget、expiry、replay、context epoch、abort
- `validate -> authorize -> reserve idempotency -> write -> usage -> projection`の順序
- rejection前のprovider/DB call countが0
- duplicate/replay時にwriteとusageを二重実行しない
- timeout、malformed response、partial failure、usage/telemetry failure
- bounded projectionとpagination上限
- secret、base64、private URL、object key、raw provider response非公開

`tool.ts` wrapperはschema、description、executor引数と戻り値だけをcontract testし、policyを
再実装しません。安全性はMastra非依存の`execute.ts`で検証します。

## G3 scripted model

real prompt、real tool schema、real executorにscripted modelを注入します。

対象:

- text only
- one/multi tool
- tool結果を受けたcontinuationと次toolの選択
- approval stop/resume
- malformed input
- tool error
- step limit
- cancel/disconnect
- reasoning、transient、tool、sourceを含むcanonical stream
- canonical persistenceとfinish後のtransient消去
- usage settlement
- title Agentとmanual renameのrace
- public Web query guard
- base64、private URL、object keyがstream/historyへ残らない

assertは文章一致ではなく、tool、input、order、approval、DB state、stream、usage、安全境界です。

scripted modelは順序付きoutputを返すstandard test implementationへ集約し、testごとのad-hoc fakeを
増やしません。stream chunk、delay、abort、usage、malformed partをscriptで表現できるようにし、
real prompt、real tool schema、real executorを通します。

## G4 contract integration

G4はbrowserとreal modelを使わず、hard import boundaryを保った二つのowner suiteに分けます。

Agent-owned suite:

- real Agent factory、runtime、tool schema、tool executor
- productionの`@enterprise-agentic-saas/api/agent-client` contractを実装するobservable fake port
- factoryへ直接注入するstandard scripted model

API-owned suite:

- real private Agent API appとcapability検証
- repositoryが使用する全migrationを適用したtestごとのtemporary libSQL
- signed synthetic requestとproduction control-plane schema/client contract

Agent testからAPI private appをsource importせず、API testからAgent runtimeをimportしません。
cross-appで共有できるのは公開`agent-client` contractだけです。Agent stream fixtureはAgent owner内、
API request/DB fixtureはAPI owner内へ置きます。決定論的なService Binding、二Worker、実HTTP配線は
free full-stack E2が担当します。

ここで検証するのはowner内の個別helperではなく、公開contractまでの整合性です。

Agent-owned assertion:

- tool/input/order、approval stop/resume、bounded call count
- public portへ渡すcapability/action/idempotency input
- canonical streamとusage projection、secret/private metadata非公開
- timeout、abort、port failure後に後続port callを行わない

API-owned assertion:

- capabilityのsignature、expiry、scope、context epoch、replay
- active organizationとresource organizationのtenant一致
- idempotency reserveからwrite、audit、usage persistenceまでの順序と二重実行防止
- approval前write禁止、同じaction resume、DB failure時のrollbackと後続call数0
- testごとのDB、clock、ID、run namespace分離と、成功/失敗後のcleanup

E2だけがAgentのtool action、canonical stream、usage projectionとAPIのDB、audit、usage persistenceを
一つのcross-Worker scenarioで突き合わせます。G4の片側だけでは観測できない一致をassertしません。

scripted modelはAgent-owned Vitestでfactoryへ直接注入できます。禁止するのはproduction Workerや
production environmentで選択可能なmodel switchであり、test専用Workerだけが唯一の注入経路という
意味ではありません。free full-stack E2でWorker境界を通す場合だけ、別E2E entrypointを使います。

## G5 paid eval

公開commandは`test:eval:agent`一つとし、fake tool/control planeや独自assertion frameworkを
作りません。production-shapedなAgent/API/DB stackで次の2 caseだけを直接実行します。

1. read: synthetic Issueを検索し、必要なread toolとpriorityを確認する
2. approved write: 明示承認後だけsynthetic Issueを作成し、tool inputとDB stateを確認する

各caseはfresh namespaceとtemporary DBで3回実行し、3/3成功を要求します。

対象:

- required/forbidden tool
- input schemaとbounded call count
- public Web query safety
- approval前write禁止
- completion、canonical stream、DB state

security gateは通常のassertまたはMastra gateでhard failさせます。LLM scorerへ委ねてよいのは
自然言語の品質、関連性、説明の完全性だけです。authorization、tenant、privacy、idempotency、
approval、tool allowlistをLLM judgeで合否判定しません。

stack evalはAgentからAPI private sourceをimportするin-process appを作りません。production-shapedな
Agent/API Workerを別process/workerd isolateで起動し、公開`agent-client`とnamed Service Bindingだけで
通信します。synthetic Auth/tenant、temporary DB、run namespaceを使い、real model credentialは
Agent isolateだけへ渡します。E2との差はscripted modelをreal modelへ置き換える点、E4との差は
browser/Webを起動しない点です。

PR常時実行には含めません。maintainerが明示的に開始するrun、nightly、release candidateだけで
実行し、fork PRへcredentialを渡しません。repo固有のselector、attestation、cost計算、pricing
snapshotは持たず、GitHub Actionsの標準event、environment承認、timeoutを使います。

### profileとtrial

| trigger              | profile / case                 |                trial |   browser |
| -------------------- | ------------------------------ | -------------------: | --------: |
| maintainerの明示実行 | 選択したread/write case        |       各3回、3/3必須 |        no |
| nightly              | read/write dataset             |       各3回、3/3必須 |        no |
| release candidate    | 全G5の3/3後、固定L7 canary 2本 | L7は各1回、retryなし | L7のみyes |

偶然成功した一回を合格にしないため、L6は独立stateで3回実行します。費用の予算検証をrepositoryへ
実装しません。workflowとtest runnerのtimeoutはrunaway防止として残します。

## dataset

Synthetic dataだけをversion管理します。各caseはstable ID、dataset version、prompt、
available tools、required tool、expected priorityまたはIssue projectionだけを持ちます。PII、
real Issue本文、provider raw responseを保存しません。

Provider 429/5xx/timeoutはbehavior failureと分けたinfrastructure failureとして記録し、passへ
数えません。behavior failureをretryで隠しません。

## 受入条件

- real LLMなしでmulti-step loopを検証できる
- paid evalがbrowserから分離される
- G4のAPI-owned suiteがmigration済みtemporary DBとreal private APIを通る
- G4でAgent/API private sourceを相互importせず、公開contractの両側を検証する
- 選択したcaseが3/3成功する
- retryでbehaviour failureを隠さない
- provider 429/5xxをbehaviour passへ数えない
