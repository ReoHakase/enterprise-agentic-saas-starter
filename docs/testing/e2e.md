---
title: 統合E2Eテスト戦略
status: proposed
implementation: planned
last_reviewed: 2026-07-24
applies_to:
  - apps/web/e2e/**
  - apps/agent/src/mastra/e2e/**
  - playwright*.config.ts
  - wrangler*.jsonc
---

# 統合E2Eテスト戦略

## テストlayer

| layer/profile | Browser | Stack | LLM | script | 実行 |
| --- | ---: | --- | --- | --- | --- |
| E1 | real | Web real、API/Agent mock | mock | `test:e2e` | PR selector |
| E2 stack | real | Web/API/Agent/Auth/DB real | scripted model | `test:e2e` | PR selector |
| E2 OAuth | real | Web/API/Auth/DB + GitHub emulator | none | `test:e2e` | PR selector |
| E3 contract | none | real Agent prompt/schema + fake tool/control plane | real paid | `test:eval:agent` | conditional/nightly |
| E3 stack | none | real Agent/private API/Auth/temporary DB | real paid | `test:eval:agent` | conditional/nightly |
| E3 stability | none | selected contract/stack caseを独立stateで反復 | real paid | `test:eval:agent` | conditional/nightly |
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

OAuth subprofileは外部GitHubや実credentialを使わず、`apps/github-emulator`、real API/Auth、
temporary DB、dedicated Next distでauthorize、state、callback、token、userinfo、session/account保存を
通します。`packages/auth`のOAuth contract/callbackまたはemulator変更時にselectorが必ず選びます。
旧`test:e2e:oauth`を公開root scriptとして残さず、`test:e2e` aggregate内で起動します。

## E3

Browserなしのpaid evalです。contract、stack、3/3 stabilityの内部profileを
`test:eval:agent`へまとめます。E4より安く速く、model behaviourとAgent/API配線をbrowserから
切り分けます。

## E4

次の固定2 canaryへ限定し、各caseをretryなしで1回ずつ実行します。

1. `agent-canary-read-source`: 自然文からread/Web検索tool、source、Issue linkを表示
2. `agent-canary-approved-image-write`: approval後だけ画像付きIssue作成を実行し、DB/file/claimを確認

Trace、video、screenshot、provider本文へsecretが入るため、paid suiteではartifact policyを厳格化します。

## 高速化

- setupはAPI fixtureで行い、対象でないUI操作を省く
- test namespaceをrun/worker/test/organization/user/DB/R2単位に分ける
- shared reset stateを廃止しparallel実行可能にする
- loginそのものを検証するcase以外はAPI setupでsession/fixtureを作る
- PRはChromium full smoke、WebKit代表caseのpairwise matrix
- nightlyでbrowser、viewport、permission modeのpairwise coverageを広げる

同じglobal account、organization、DB file、R2 prefixをworker間で共有しません。cleanupは自分の
namespaceだけを削除し、失敗時も別workerのstateを消しません。

## 選択規則

`free-e2e` jobは常時起動し、一つのscriptがE1/E2を選びます。判定不能時は両方実行します。

## 受入条件

- E2でproduction Workerと同じcontrol plane契約を通る
- E2のproduction bundleにscripted modelが入らない
- E4がacceptance suite全体にならない
- shared stateを理由に全suiteをworkers 1へ固定しない
