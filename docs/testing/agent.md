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

## G2 tool executor

全toolで検証:

- strict schema
- guard、budget、idempotencyの順序
- rejection前にprovider/DBを呼ばない
- abort、timeout、provider failure
- bounded output
- secret/private URL/object key非公開

## G3 scripted model

real prompt、real tool schema、real executorにscripted modelを注入します。

対象:

- text only
- one/multi tool
- approval stop/resume
- malformed input
- tool error
- step limit
- cancel/disconnect
- canonical stream
- usage settlement

assertは文章一致ではなく、tool、input、order、approval、DB state、stream、usage、安全境界です。

## G5 paid eval

Browserとfull stackを起動せず、real modelのselection behaviourを測定します。

- required/forbidden tool
- input schema
- public Web query safety
- approval前write禁止
- max tool call
- completion rate

PR常時実行にせず、Agent behaviour fingerprint変更、nightly、release candidateで実行します。

## dataset

Synthetic dataだけをversion管理します。PII、real Issue本文、provider raw responseを保存しません。

## 受入条件

- real LLMなしでmulti-step loopを検証できる
- paid evalがbrowserから分離される
- retryでbehaviour failureを隠さない
- provider 429/5xxをbehaviour passへ数えない
