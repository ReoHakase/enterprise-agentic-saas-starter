---
title: 統合E2Eテスト戦略
status: proposed
implementation: planned
last_reviewed: 2026-07-24
applies_to:
  - apps/web/e2e/**
  - apps/agent/src/mastra/e2e/**
  - playwright*.config.ts
  - wrangler*.toml
---

# 統合E2Eテスト戦略

## テストlayer

| layer | Browser | Stack | LLM | script | 実行 |
| --- | ---: | --- | --- | --- | --- |
| E1 | real | Web real、API/Agent mock | mock | `test:e2e` | PR selector |
| E2 | real | Web/API/Agent/Auth/DB real | scripted model | `test:e2e` | PR selector |
| E3 | none | Agent prompt/tool controlled | real paid | `test:eval:agent` | conditional/nightly |
| E4 | real | full real temporary stack | real paid | `test:e2e:agent` | release candidate |

## E1

対象:

- route、RSC shell
- form、keyboard、responsive
- error/retry
- mock Agent stream

Mock APIはproduction contractのstatus分類を再現しますが、authorizationの正しさを証明しません。

## E2

実物:

- Next.js
- API Worker
- Agent E2E Worker
- Better Auth
- temporary libSQL
- Service Binding

差し替え:

- LLMだけscripted model

Agent E2E Workerは`src/mastra/e2e/worker.ts`を使い、production env switchを作りません。

## E3

Browserなしのpaid evalです。E4より安く速く、model behaviourだけを切り分けます。

## E4

1から2本のcanaryへ限定します。

1. 自然文からread toolとsource表示
2. approval付きwriteまたは画像付き作成

Trace、video、screenshot、provider本文へsecretが入るため、paid suiteではartifact policyを厳格化します。

## 高速化

- setupはAPI fixtureで行い、対象でないUI操作を省く
- test namespaceをrun/worker/test単位に分ける
- shared reset stateを廃止しparallel実行可能にする
- PRはChromium full smoke、WebKit代表case
- nightlyでbrowser matrixを広げる

## 選択規則

`free-e2e` jobは常時起動し、一つのscriptがE1/E2を選びます。判定不能時は両方実行します。

## 受入条件

- E2でproduction Workerと同じcontrol plane契約を通る
- E2のproduction bundleにscripted modelが入らない
- E4がacceptance suite全体にならない
- shared stateを理由に全suiteをworkers 1へ固定しない
