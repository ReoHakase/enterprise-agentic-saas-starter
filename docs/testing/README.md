---
title: テスト戦略と実行契約
status: proposed
implementation: planned
last_reviewed: 2026-07-24
---

# テスト戦略と実行契約

## 目次

- [目的](#目的)
- [文書一覧](#文書一覧)
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

## 文書一覧

- [Web](web.md)
- [API](api.md)
- [Agent](agent.md)
- [統合E2E](e2e.md)
- [DB migration](database-migrations.md)
- [VRT](visual-regression.md)

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
head SHA = github.sha
checkout fetch-depth = 0
```

main push:

```text
base SHA = github.event.before
head SHA = github.sha
```

次の場合はfull free suiteへfail-safeします。

- fork PR
- base SHAが取得不能
- history不足
- affected判定失敗
- path selector失敗

Fork PRへpaid secretを渡しません。

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
| API client export | Web test + E1 |
| UI primitive | packages/ui browser + affected Web test |

Mappingはversion-controlled scriptにし、判定不能時は追加suiteを実行します。

## 無料E2Eの選択規則

PRでは`free-e2e` job自体を常に起動し、selectorがE1/E2を選びます。

- docs-onlyで生成設定に影響しない場合はskip
- Web/UI/API client変更はE1
- API/Agent/Auth/DB/Service Binding変更はE2
- 両方に該当すればE1+E2
- 判定失敗はE1+E2

条件がjob定義とdocsで揺れないよう、一つのselector scriptを正本にします。

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
