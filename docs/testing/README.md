---
title: テスト戦略と実行契約
status: accepted
implementation: active
last_reviewed: 2026-07-25
---

# テスト戦略と実行契約

## 目次

- [目的](#目的)
- [背景](#背景)
- [文書一覧](#文書一覧)
- [三層モデル](#三層モデル)
- [L0からL7](#l0からl7)
- [layer選択規則](#layer選択規則)
- [公開script](#公開script)
- [bun-run-test](#bun-run-testの範囲)
- [実行頻度](#実行頻度)
- [changedとCI full](#changedとci-full)
- [変更pathとsuite](#変更pathとsuiteの確認)
- [無料E2E](#無料e2eの実行規則)
- [coverage](#coverage)
- [受入条件](#受入条件)

## 目的

同じbugを最も低く、速く、deterministicなlayerで検出し、real browserとpaid LLMの実行を最小化します。

## 背景

このrepositoryは、pure functionだけでなく、tenant authorization、transaction、Agent tool、
stream、Server Component、browser focus、real modelの選択までを一つのproduct flowで扱います。これらを
unit testとpaid browser E2Eの二択にすると、次の問題が起きます。

- unit testでは個々のhelperが通っても、tool schema、executor、private API、DB、streamの接続不良を
  検出できない
- full-stack testだけでは、失敗原因がmodel、browser、network、Worker、Auth、DBのどこかを
  切り分けられない
- real modelとreal browserを日常gateへ混ぜると、費用、rate limit、時間、非決定性により実行が
  避けられる
- production parser、controller、repositoryまでmockすると、test用の別実装だけが正しくなる
- authorization、privacy、approval等を自然言語の採点へ委ねると、安全性が確率的になる

そこで、production codeをできるだけ実物のまま保ち、非決定的または外部の境界だけを低い層で
差し替えます。上位層は下位層の再実装ではなく、下位では観測できない配線だけを追加で確認します。

## 文書一覧

- [Web](web.md)
- [API](api.md)
- [Agent](agent.md)
- [統合E2E](e2e.md)
- [DB migration](database-migrations.md)
- [VRT](visual-regression.md)

## 三層モデル

全体を次の三層として設計します。

```text
deterministic core
  tool / policy / schema / application / repository / scripted Agent loop
        ↓
browser feature integration
  component / Storybook / Browser Mode / free Playwright
        ↓
probabilistic canary
  real-model eval / paid full-stack browser canary
```

同じinvariantを上位layerだけで保証しません。authorization、tenant、idempotency、approval、
privacy、tool orderはdeterministic coreでhard assertionにし、browserは配線、real modelは
選択behaviorだけを確認します。

## L0からL7

| level | 主対象                                               | browser | real model | 公開script        |
| ----- | ---------------------------------------------------- | ------: | ---------: | ----------------- |
| L0    | lint、型検査、依存境界、バンドル分離                 |      no |         no | `check`           |
| L1    | pure unit、domain、schema、state reducer             |      no |         no | `test`            |
| L2    | tool executor、scripted Agent loop                   |      no |         no | `test`            |
| L3    | repository、HTTP、private API、temporary DB          |      no |         no | `test`            |
| L4    | Storybook、Browser Mode、a11y、feature integration   |     yes |         no | `test:browser`    |
| L5    | E1 mocked journey / E2 free full-stack journey       |     yes |         no | `test:e2e`        |
| L6    | browserless real-model contract/stack/stability eval |      no |        yes | `test:eval:agent` |
| L7    | 固定2本のfull-stack paid canaryを各1回               |     yes |        yes | `test:e2e:agent`  |

VRTは現在導入しません。L4はinteraction、real CSS/browser behavior、a11yまでを担当し、
screenshot baselineは[将来方針](visual-regression.md)としてdeferします。

## layer選択規則

invariantは、それを観測できる最も低い層へ置きます。

| 検証対象                                         | 最低layer | 実物のまま通すもの                                | 差し替えてよい境界                     |
| ------------------------------------------------ | --------- | ------------------------------------------------- | -------------------------------------- |
| pure transition、schema、policy                  | L1        | domain/core                                       | clock、ID等のport                      |
| tool order、approval、usage、stream projection   | L2        | prompt、tool schema、executor、runtime            | model output、control-plane port       |
| tenant query、transaction、HTTP/private API      | L3        | repository、migration済みlibSQL、app composition  | external provider                      |
| focus、portal、CSS、component state              | L4        | production view/controller/hook、real browser DOM | network/model transport                |
| Server Component、cookie、middleware、Worker配線 | L5        | routeと対象stack                                  | LLMだけscripted model                  |
| prompt/modelによるtool選択                       | L6        | real prompt、real model、対象stack                | browser                                |
| release時のend-to-end配線                        | L7        | temporary full stack、browser、real model         | production dataとproduction credential |

適用規則:

1. 上位layerがgreenでも、同じsecurity/business invariantの下位hard assertionを削除しない。
2. 一つのscenarioを全layerへ複製しない。上位ではそのlayer固有の境界だけをassertする。
3. fakeはconsumerが所有するport、network、model/provider境界へ置く。productionのschema parser、
   controller、hook、executor、repositoryをtest doubleへ置換しない。
4. repositoryとtransactionはL3で実libSQLを使い、query builderの振る舞いをmockで再現しない。
5. browser capabilityはhappy-domへ期待せずL4/L5、model selectionだけはL6、browserとmodelを
   同時に必要とする最小canaryだけをL7へ置く。
6. authorization、tenant、idempotency、approval前write禁止、privacy、tool allowlistは
   deterministic assertionで判定する。LLM judgeは文章品質だけに使う。
7. layer間のfixtureは同じcanonical contractを共有するが、mutable stateとrun namespaceは共有しない。

L6とL7を分けるのは、model behaviourの失敗とbrowser/full-stack wiringの失敗を同じ高価なrunで
混ぜないためです。多くのmodel回帰はbrowserlessなL6で再現し、L7は規範文書で固定した二つの
release canaryだけにします。

## 公開script

```text
bun run test
bun run test:browser
bun run test:e2e
bun run test:eval:agent
bun run test:e2e:agent
```

論理layerごとにroot scriptを増やさず、runtimeとcostで分けます。

| script            | runner                          | browser | real LLM | 通常PR |
| ----------------- | ------------------------------- | ------: | -------: | -----: |
| `test`            | Vitest                          |      no |       no |    yes |
| `test:browser`    | Vitest Browser Mode / Storybook |     yes |       no |    yes |
| `test:e2e`        | Playwright                      |     yes |       no |    yes |
| `test:eval:agent` | Vitest/Mastra eval              |      no |      yes |     no |
| `test:e2e:agent`  | Playwright                      |     yes |      yes |     no |

## bun run testの範囲

次を含めます。

- pure unit
- Web happy-dom component/controller
- API service/repository/HTTP contract
- Agent core/tool/scripted model loop
- DB migration
- external cloud、real browser、paid modelを必要としないintegration

重要なtenant/security contractをE2Eまで遅らせないためです。

Root scriptはlevel数ではなくruntimeとcostで5本へ集約します。内部profileやsuiteを追加しても
公開script名を増やしません。

## 実行頻度

| 場面                | 実行                                     |
| ------------------- | ---------------------------------------- |
| 開発中              | workspace `test --changed`、focused test |
| pre-push            | `bun run check`                          |
| PR quality          | 全workspaceの`test`                      |
| PR browser          | Storybook/Browser Mode full              |
| PR free E2E         | E1、scripted Agent E2、OAuth E2 full     |
| main/nightly        | full free suite                          |
| Agent behaviour変更 | `test:eval:agent`                        |
| release candidate   | `test:e2e:agent`                         |

## changedとCI full

### local

```sh
bun --cwd apps/web run test -- --changed=origin/main --coverage.enabled=false
```

`--changed`はfast feedback用です。coverage gateとrequired CIには使いません。

### CI

```sh
bun run test
```

required CIではaffected判定を行わず、全workspaceのfree unit/integrationを実行します。Turbo cacheは
利用しますが、path selectorやbase SHA処理でsuiteを省略しません。

Fork PRへpaid secretを渡しません。

Paid testは通常PRのrequired checkにせず、maintainerの明示実行、nightly、releaseだけで動かします。
forkのcodeを`pull_request_target`やsecret付きjobで実行しません。必要な確認はfork内容をtrusted
branchへ取り込んだ後、そのbranchを対象にmaintainerが明示実行します。

## 変更pathとsuiteの確認

次の表は開発中にfocused testから必要なfull gateへ広げるための確認指針です。通常CIの
`test:browser`と`test:e2e`はpathにかかわらずfullで実行します。

| changed path                                                                                            | 開発中に先行する検証                   |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `apps/api/**/repository*`                                                                               | `packages/db` full test                |
| `apps/api/**/infrastructure/**`                                                                         | `packages/db` full test                |
| tenant query/transaction helper                                                                         | `packages/db` full test                |
| `packages/db/src/schema/**`                                                                             | API full test + E2 free stack          |
| `packages/db/drizzle/**`                                                                                | DB full migration + API full test + E2 |
| `apps/agent/src/mastra/**`                                                                              | Agent full test + E2                   |
| Service Binding/Wrangler config                                                                         | API/Agent build + E2                   |
| API client export、一般的なClient UI                                                                    | Web test + E1                          |
| Web server/Server Component、middleware、auth/session、cookie、Origin/CORS/CSRF、credentialed transport | E2                                     |
| Playwright/Web server config                                                                            | E2                                     |
| `packages/auth/**`のOAuth contract/callback                                                             | E2 OAuth profile                       |
| `apps/github-emulator/**`                                                                               | E2 OAuth profile                       |
| UI primitive                                                                                            | packages/ui browser + Web test         |
| browser-import可能component、story metadata                                                             | Storybook/Browser Mode                 |
| client Suspense、Skeleton、React Error Boundary                                                         | Web Browser Mode                       |
| async Server Component、Next.js `loading.tsx` / `error.tsx`                                             | E2                                     |

この対応を判定するrepo専用scriptは持ちません。

## 無料E2Eの実行規則

`free-e2e` jobは通常PR、fork PR、mainで常に起動し、次を全件実行します。

- E1 core journeyとroute contract
- scripted modelを使うAgent E2
- GitHub emulatorを使うOAuth E2

docs-onlyを含めてskipせず、path selectorやbase SHA fallbackを持ちません。CI時間は増えますが、
判定漏れとselector fixtureの保守をなくし、無料suiteのfail-safeを単純にします。

## coverage

- full `bun run test`でcoverage thresholdを適用
- `--changed`ではcoverageを無効化
- includeは実際にunit/integrationで保守するsourceを明示
- generated、entrypoint glue、type-only fileを無理にcoverageへ含めない
- line coverageだけでなくbranch coverageを維持

## 受入条件

- root test scriptが5個に限定される
- `bun run test`に軽いintegrationが含まれる
- 通常CIが全workspaceの`test`を実行する
- free E2EがE1、scripted Agent E2、OAuth E2を常に全件実行する
- 新規または変更したbrowser componentに実componentを描画するstoryがある
- client Suspense/Error BoundaryのBrowser Mode layout contractがgreen
- async Server Component routeのloading/ready/error/retry E2 layout contractがgreen
