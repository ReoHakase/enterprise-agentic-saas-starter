---
title: テスト戦略と実行契約
status: proposed
implementation: planned
last_reviewed: 2026-07-24
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
- [changedとaffected](#changedとaffected)
- [base-sha](#base-sha)
- [path-to-suite mapping](#変更pathとsuiteの対応)
- [free-e2e selector](#無料e2eの選択規則)
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

| level | 主対象 | browser | real model | 公開script |
| --- | --- | ---: | ---: | --- |
| L0 | lint、type、architecture、bundle isolation | no | no | `check` |
| L1 | pure unit、domain、schema、state reducer | no | no | `test` |
| L2 | tool executor、scripted Agent loop | no | no | `test` |
| L3 | repository、HTTP、private API、temporary DB | no | no | `test` |
| L4 | Storybook、Browser Mode、a11y、feature integration | yes | no | `test:browser` |
| L5 | E1 mocked journey / E2 free full-stack journey | yes | no | `test:e2e` |
| L6 | browserless real-model contract/stack/stability eval | no | yes | `test:eval:agent` |
| L7 | 固定2本のfull-stack paid canaryを各1回 | yes | yes | `test:e2e:agent` |

VRTは現在導入しません。L4はinteraction、real CSS/browser behavior、a11yまでを担当し、
screenshot baselineは[将来方針](visual-regression.md)としてdeferします。

## layer選択規則

invariantは、それを観測できる最も低い層へ置きます。

| 検証対象 | 最低layer | 実物のまま通すもの | 差し替えてよい境界 |
| --- | --- | --- | --- |
| pure transition、schema、policy | L1 | domain/core | clock、ID等のport |
| tool order、approval、usage、stream projection | L2 | prompt、tool schema、executor、runtime | model output、control-plane port |
| tenant query、transaction、HTTP/private API | L3 | repository、migration済みlibSQL、app composition | external provider |
| focus、portal、CSS、component state | L4 | production view/controller/hook、real browser DOM | network/model transport |
| Server Component、cookie、middleware、Worker配線 | L5 | routeと対象stack | LLMだけscripted model |
| prompt/modelによるtool選択 | L6 | real prompt、real model、対象stack | browser |
| release時のend-to-end配線 | L7 | temporary full stack、browser、real model | production dataとproduction credential |

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

| script | runner | browser | real LLM | 通常PR |
| --- | --- | ---: | ---: | ---: |
| `test` | Vitest | no | no | yes |
| `test:browser` | Vitest Browser Mode / Storybook | yes | no | selector |
| `test:e2e` | Playwright | yes | no | selector |
| `test:eval:agent` | Vitest/Mastra eval | no | yes | no |
| `test:e2e:agent` | Playwright | yes | yes | no |

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

| 場面 | 実行 |
| --- | --- |
| 開発中 | workspace `test --changed`、focused test |
| pre-push | `bun run check` |
| PR quality | affected workspaceのfull `test` + path mapping |
| PR browser | selectorが対象としたworkspace |
| PR free E2E | selectorがE1/E2を選択 |
| main/nightly | full free suite |
| Agent behaviour変更 | `test:eval:agent` |
| release candidate | `test:e2e:agent` |

## changedとaffected

### local

```sh
bun --cwd apps/web run test -- --changed=origin/main --coverage.enabled=false
```

`--changed`はfast feedback用です。coverage gateとrequired CIには使いません。

### CI

```sh
bun run test -- --affected
```

Turboのpackage graphでaffected workspaceを選び、そのworkspaceではfull testを実行します。

## base SHA

PR:

```text
base SHA = github.event.pull_request.base.sha
head SHA = github.event.pull_request.head.sha
merge SHA = github.sha
checkout fetch-depth = 0
```

`pull_request` eventの`github.sha`はsynthetic merge commitなのでheadとして扱いません。selectorは
base/headを比較し、browserless paid evalは実際にmergeされる候補を表すmerge treeを検証します。

main push:

```text
base SHA = github.event.before
head SHA = github.sha
merge SHA = not-applicable
```

次の場合はfull free suiteへfail-safeします。

- fork PR
- base SHAが取得不能
- history不足
- affected判定失敗
- path selector失敗

Fork PRへpaid secretを渡しません。

Agent behaviour fingerprintが変わるfork PRは、free suite成功だけではmergeできません。maintainerが
workflow、dependency、eval harnessを含むexact diffを確認し、同じcommitをrepo-owned
`eval/<head-sha>` refへ明示的に取り込んだ後、default branch上の保護されたworkflowを
`workflow_dispatch`します。workflowはfull 40文字head SHAがそのrefから到達可能であること、PR head
treeが一致すること、base SHAがまだcurrentであることを確認します。baseとheadからcandidate mergeを
再構成し、PRのmerge treeと一致した場合だけL6を実行します。`pull_request_target`でfork codeを直接
実行せず、fork workflow、fork environment、browser、Web/APIへsecretを渡しません。

required check `agent-eval-gate`はselectorがL6不要なら成功、必要なら
`base SHA + head SHA + merge tree + protected workflow/harness revision`が完全一致する承認runが
成功するまでpendingです。base update、head update、merge conflict解消、protected harness変更で
以前の結果を無効化します。承認されないfork PRはmerge不可とします。

## 変更pathとsuiteの対応

Package graphだけでは逆方向のriskを表せないため、追加mappingを持ちます。

| changed path | 追加実行 |
| --- | --- |
| `apps/api/**/repository*` | `packages/db` full test |
| `apps/api/**/infrastructure/**` | `packages/db` full test |
| tenant query/transaction helper | `packages/db` full test |
| `packages/db/src/schema/**` | API full test + E2 free stack |
| `packages/db/drizzle/**` | DB full migration + API full test + E2 |
| `apps/agent/src/mastra/**` | Agent full test + E2 |
| Service Binding/Wrangler config | API/Agent build + E2 |
| API client export、一般的なClient UI | Web test + E1 |
| Web server/Server Component、middleware、auth/session、cookie、Origin/CORS/CSRF、credentialed transport | E2 |
| Playwright/Web server config | E2 |
| `packages/auth/**`のOAuth contract/callback | E2 OAuth profile |
| `apps/github-emulator/**` | E2 OAuth profile |
| UI primitive | packages/ui browser + affected Web test |
| browser-import可能component、story metadata | Story coverage check + affected Storybook/Browser Mode |
| client Suspense、Skeleton、React Error Boundary | Web Browser Mode |
| async Server Component、Next.js `loading.tsx` / `error.tsx` | E2 |

Mappingはversion-controlled scriptにし、判定不能時は追加suiteを実行します。

## 無料E2Eの選択規則

PRでは`free-e2e` job自体を常に起動し、selectorがE1/E2を選びます。

- docs-onlyで生成設定に影響しない場合はskip
- 一般的なWeb Client UI、UI package、API client変更はE1
- Web server/auth/cookie/Origin/CORS/CSRF、API/Agent/Auth/DB/Service Binding変更はE2
- OAuth contract/callback、GitHub emulator変更はE2 OAuth profile
- 両方に該当すればE1+E2
- 判定失敗はE1+E2

条件がjob定義とdocsで揺れないよう、一つのselector scriptを正本にします。
selector fixtureは一般UI、server/auth/cookie、OAuth、Agent/DB、docs-only、unknown pathを持ち、
OAuth profileやE2をE1だけへ縮退できないことを固定します。

## coverage

- full `bun run test`でcoverage thresholdを適用
- `--changed`ではcoverageを無効化
- includeは実際にunit/integrationで保守するsourceを明示
- generated、entrypoint glue、type-only fileを無理にcoverageへ含めない
- line coverageだけでなくbranch coverageを維持

## 受入条件

- root test scriptが5個に限定される
- `bun run test`に軽いintegrationが含まれる
- base SHA不明時にfullへ縮退する
- API repository変更でDB testが追加実行される
- free E2E条件がselector script一か所にある
- browser-import可能なcomponentのstory coverageが100%
- client Suspense/Error BoundaryのBrowser Mode layout contractがgreen
- async Server Component routeのloading/ready/error/retry E2 layout contractがgreen
