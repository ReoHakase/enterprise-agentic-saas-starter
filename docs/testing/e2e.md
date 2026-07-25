---
title: 統合E2Eテスト戦略
status: accepted
implementation: active
last_reviewed: 2026-07-25
applies_to:
  - apps/web/e2e/**
  - apps/agent/src/mastra/e2e/**
  - playwright*.config.ts
  - wrangler*.jsonc
---

# 統合E2Eテスト戦略

## テストlayer

| layer/profile | Browser | Stack                                    | LLM            | script            | 実行                     |
| ------------- | ------: | ---------------------------------------- | -------------- | ----------------- | ------------------------ |
| E1            |    real | Web real、最小static API fixture         | none           | `test:e2e`        | 通常PR full              |
| E2 stack      |    real | Web/API/Agent/Auth/DB real               | scripted model | `test:e2e`        | 通常PR full              |
| E2 OAuth      |    real | Web/API/Auth/DB + GitHub emulator        | none           | `test:e2e`        | 通常PR full              |
| E3            |    none | real Agent/private API/Auth/temporary DB | real paid      | `test:eval:agent` | explicit/nightly/release |
| E4            |    real | full real temporary stack                | real paid      | `test:e2e:agent`  | release candidate        |

## E1

対象:

- route、Server Component shell
- cookieとredirect
- responsive shell
- loading、error、retry

E1 fixtureは画面表示に必要な固定responseとone-shot delay/faultだけを返し、製品APIのCRUD、
authorization、tenant policyを再実装しません。それらはunit/integrationと実stack E2/OAuthで
検証します。E1はparallelなcore journey、one-shot delay/faultを使うroute contractの順に
別processで実行します。
core journeyはNext.js development serverのcompileとRSC navigationを飢餓状態にしないよう最大3 workersで
並列実行します。route contractだけを`--workers=1`へ固定し、mock transport内で共有するruleの消費順を
決定的にします。core journeyをserial化せず、`test:e2e` aggregateはE1 core、E1 route contract、
scripted Agent E2、OAuth E2の順を維持します。

E1 coreは依存setup projectでpublic auth、dashboard、Issue一覧の代表routeを1 workerでcompileしてから、
Chromiumと代表WebKitを最大3 workersで開始します。cold compileを各testのretryへ委ねず、warm-upの失敗も
E1失敗として扱います。

### route boundary matrix

async Server ComponentとNext.js routeのloading/error処理はBrowser Modeで再現せず、対象routeごとの
state遷移をE1/E2、geometryとfocusのmatrixを代表routeで検証します。対象routeのtestは、共有layout
ではなくそのsegment固有のdata requestへone-shot API delay/faultを入れ、
`data-route-boundary="true"`のready、loading、error、retryを確認します。この間もouter
`data-console-shell`はreadyのまま維持します。代表routeではさらに次を確認します。

- デスクトップ`1280x720`でloading/error/retry、外側shellの維持、DOM座標を検証する
- WebKitの代表モバイル表示では公開ルートとテナントルートの主要表示、横方向のoverflowを検証する
- sidebar、header、PageShell、contentのgeometryが
  [Webテスト契約](web.md#suspenseとerror-boundaryのlayout-stability)の許容値内
- horizontal overflowがない
- error headingへfocusし、reset後にready stateへ戻る
- `nested boundary`遷移で外側shellを再mountしない

全component stateをPlaywrightへ複製せず、Next.js route、Server Component、networkの結合だけを
選びます。失敗時のscreenshotは
診断artifactとして保存できますが、`toHaveScreenshot`やbaseline比較には使いません。

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
通します。旧`test:e2e:oauth`を公開root scriptとして残さず、通常PRで常に実行する`test:e2e`
aggregate内で起動します。

OAuth runごとに新しいemulator process、synthetic user、fresh DBを作り、fixture `finally`と
global teardownの両方でrun固有resourceだけをcleanupします。`emulate.reset()`は発行済みtoken mapを
完全には消さないためtest isolation境界に使いません。Passkey成功系はChromiumのvirtual authenticatorで
実WebAuthn ceremonyを通し、`navigator.credentials.create`やAPI responseをmockしません。

## E3

Browserなしのpaid evalです。readとapproved writeの2 caseだけをfresh stateで各3回直接実行し、
fake tool/control planeや別contract profileを作りません。Agent/APIを別processまたはworkerd
isolateとして起動し、named Service Bindingと公開`agent-client` contractだけで接続します。app間の
private source importや一つのin-process appへ合成するtest harnessを作りません。real model
credentialはAgent isolateだけ、synthetic Authとtemporary DBはAPI側だけに渡します。

## E4

次の固定2 canaryへ限定し、各caseをretryなしで1回ずつ実行します。

1. `agent-canary-read-source`: 明示した公開検索語からread/Web検索tool、source、Issue linkを表示
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

Playwrightが起動するNext.jsはprofileごとに`NEXT_DIST_DIR`を分離します。E1は`.next-e2e`、scripted
Agent E2は`.next-e2e-scripted-agent`、OAuthは`.next-e2e-oauth`、paid E4は`.next-e2e-agent`を使い、
通常の`bun run dev`が使う`.next`とdevelopment lockを共有しません。testのためにdeveloper-owned
processを停止しません。

Turboのstrict envでは`CI`と外部server用`PLAYWRIGHT_BASE_URL`を`passThroughEnv`へ明示します。
CIではretry、`forbidOnly`、既存server非再利用、`failOnFlakyTests`を有効にし、途中成功をgreenへ
丸めません。

## 実行規則

`free-e2e` jobは通常PR、fork PR、mainで常時起動し、E1、scripted Agent E2、OAuth E2を全件実行します。
repo固有のpath selectorやbase SHA fallbackは持ちません。

## 受入条件

- E2でproduction Workerと同じcontrol plane契約を通る
- representative routeでloading/error/retryのgeometry、focus、overflowが安定する
- E2のproduction bundleにscripted modelが入らない
- E4がacceptance suite全体にならない
- shared stateを理由に全suiteをworkers 1へ固定しない
