---
title: Agentテスト戦略
status: proposed
implementation: planned
last_reviewed: 2026-07-24
applies_to:
  - apps/agent/src/mastra/**
  - apps/api/src/modules/agent/**
---

# Agentテスト戦略

## テストピラミッド

| layer | 対象 | model | runner | script |
| --- | --- | --- | --- | --- |
| G1 | core、policy、usage、message | none | Vitest | `test` |
| G2 | tool executor | none | Vitest | `test` |
| G3 | agent loop、tool call、approval、stream | scripted model | Vitest | `test` |
| G4 | Agent/API contract、capability、temporary DB | scripted request/model | owner別Vitest | `test` |
| G5 | prompt/tool behaviour | real paid model | Vitest/Mastra eval | `test:eval:agent` |

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

公開commandは`test:eval:agent`一つのまま、内部profileを三つに分けます。

1. contract eval: real model + fake tool/control planeでtool selectionとinputを測る
2. stack eval: isolated Agent/API Worker、Service Binding、Auth、temporary DB + real modelを
   browserなしで測る
3. stability dataset: 独立stateで同じbehaviorを3回実行し、3/3成功を要求する

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

PR常時実行にせず、Agent behaviour fingerprint変更、nightly、release candidateで実行します。
fingerprintにはprompt、model ID、tool description/schema、tool allowlist、stop condition、policy、
stream projection、dataset versionを含めます。

`apps/agent/evals/behaviour-fingerprint.json`をversion管理し、`behaviourRoots`、各入力glob、
除外glob、正規化方法、dataset version、実行するcase IDを列挙します。`behaviourRoots`は少なくとも
`apps/agent/src/mastra/**`、`apps/api/src/modules/agent/**`、Agent eval dataset、model設定、
Agent package/configを含むexhaustiveな候補集合です。test-support、generated、純粋なtest file等を
除外する場合もexact globと理由をmanifestへ記録します。

selectorはbase/headのmanifestと対象file内容をhash比較し、差分があればL6をrequiredにします。
base取得不能、`behaviourRoots`配下だが入力/除外のどちらにも分類されないpath、manifest自体の変更、
hash失敗はskipせずL6 requiredへfail-safeします。

selector fixtureはprompt、model ID、tool schema/description/allowlist、policy、stop condition、
stream projection、dataset、無関係docs、`behaviourRoots`配下の未分類path、root外pathを一つずつ
変更し、期待するcase選択を固定します。
workflowと手作業の「Agent behavior変更」判断を別の正本にしません。

### profile、trial、resource budget

| trigger | profile / case | trial | browser |
| --- | --- | ---: | ---: |
| behaviour fingerprint変更 | selectorが選んだcontract/stack/stability case | 各3回、3/3必須 | no |
| nightly | 全contract/stack/stability dataset | 各3回、3/3必須 | no |
| release candidate | 全G5の3/3後、固定L7 canary 2本 | L7は各1回、retryなし | L7のみyes |

fingerprint変更でも1回だけに縮めません。偶然成功した一回をrequired gateにしないためで、費用は
browserを外すこと、fingerprintからcaseを選ぶこと、datasetをboundedにすることで制御します。
selectorがcaseを安全に絞れない場合は全G5へfail-safeします。

`apps/agent/evals/eval-budgets.json`をbudgetの正本にし、version、pricing source/as-of、
profile default、case override、workflow capを持たせます。各caseは`timeoutMs`、
`maxModelSteps`、`maxToolCalls`、`maxInputTokens`、`maxOutputTokens`、`maxCostUsd`を正の数で必須とし、
case overrideはprofile hard maximum以下にだけ狭められます。

| hard maximum | L6 per trial | L7 per canary |
| --- | ---: | ---: |
| `timeoutMs` | 300,000 | 600,000 |
| `maxModelSteps` | 12 | 16 |
| `maxToolCalls` | 8 | 12 |
| `maxInputTokens` | 65,536 | 65,536 |
| `maxOutputTokens` | 8,192 | 8,192 |
| `maxCostUsd` | 2.00 | 5.00 |

| workflow | wall-clock cap | aggregate cost cap |
| --- | ---: | ---: |
| fingerprint approval run | 60 minutes | USD 30 |
| nightly G5 | 180 minutes | USD 100 |
| release G5 + fixed L7 | 240 minutes | USD 120 |

この値は消費目標ではなく、multi-tool、approval resume、固定image-write canaryを許しつつrunaway loopを
止めるrepository hard ceilingです。通常caseはmanifestでさらに小さい上限を持ちます。
costはpinしたmodel IDとversion管理したpricing tableから事前見積りし、provider usageで事後照合します。
pricing情報またはusageを取得できずcapを証明できないrunはpassにしません。hard maximumやaggregate
ceilingの引上げはbudget fileだけの無言変更にせず、owner、理由、pricing evidenceを伴うADR reviewを
必要とします。未設定、上限超過、provider側の無制限retryを許可せず、budget超過はbehavior passでは
なく明示的なbudget failureです。

## dataset

Synthetic dataだけをversion管理します。各caseはstable ID、dataset version、input context、
available tools、required/forbidden calls、expected safety properties、expected DB/stream projectionを
持ちます。PII、real Issue本文、provider raw responseを保存しません。

Provider 429/5xx/timeoutはbehavior failureと分けたinfrastructure failureとして記録し、passへ
数えません。behavior failureをretryで隠しません。

## 受入条件

- real LLMなしでmulti-step loopを検証できる
- paid evalがbrowserから分離される
- G4のAPI-owned suiteがmigration済みtemporary DBとreal private APIを通る
- G4でAgent/API private sourceを相互importせず、公開contractの両側を検証する
- fingerprint変更のselected caseが3/3成功する
- `eval-budgets.json`が全paid caseとworkflowのhard maximumを満たす
- retryでbehaviour failureを隠さない
- provider 429/5xxをbehaviour passへ数えない
