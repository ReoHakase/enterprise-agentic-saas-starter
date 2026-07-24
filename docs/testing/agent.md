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
| G4 | private API、capability、temporary DB | scripted model | Vitest/in-process app | `test` |
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

## G5 paid eval

公開commandは`test:eval:agent`一つのまま、内部profileを三つに分けます。

1. contract eval: real model + fake tool/control planeでtool selectionとinputを測る
2. stack eval: real Agent/private API/temporary DB + real model、browserなしで配線を測る
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

## dataset

Synthetic dataだけをversion管理します。各caseはstable ID、dataset version、input context、
available tools、required/forbidden calls、expected safety properties、expected DB/stream projectionを
持ちます。PII、real Issue本文、provider raw responseを保存しません。

Provider 429/5xx/timeoutはbehavior failureと分けたinfrastructure failureとして記録し、passへ
数えません。behavior failureをretryで隠しません。

## 受入条件

- real LLMなしでmulti-step loopを検証できる
- paid evalがbrowserから分離される
- retryでbehaviour failureを隠さない
- provider 429/5xxをbehaviour passへ数えない
