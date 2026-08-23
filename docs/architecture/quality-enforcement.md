---
title: 品質強制
status: accepted
implementation: active
last_reviewed: 2026-08-20
applies_to:
  - oxlint.config.ts
  - apps/*/oxlint.config.ts
  - packages/*/oxlint.config.ts
  - knip.config.ts
  - .jscpd.json
  - lefthook.yml
  - vitest.config.ts
  - .github/**/*.test.ts
  - .github/workflows/**
---

# 品質強制

## 目次

- [目的](#目的)
- [全面適用](#全面適用)
- [script contract](#script契約)
- [Oxlint budget](#oxlint上限)
- [import rule](#import規則)
- [Oxfmt](#oxfmt)
- [a11yとtest rule](#a11yとテスト規則)
- [Knip](#knip)
- [jscpd](#jscpd)
- [Git hook](#git-hook)
- [CI](#ci)
- [例外](#例外)
- [理由と代償](#理由と代償)
- [受入条件](#受入条件)

## 目的

coding agentが大きいfunction、深いnesting、dead code、undeclared dependency、duplicateを追加しても文章指示だけで見逃さない状態を作ります。

## 全面適用

main上で既存違反baselineを維持する段階導入は行いません。全sourceへ後述のbudgetを直接適用し、
超過は常にerrorとして扱います。

除外できるのは次だけです。

- generated code
- migration SQL/snapshot
- vendor
- fixture data
- compatibilityのため構造を維持するfileで、理由を狭いoverrideへ記載したもの

広いdirectory overrideや期限のない一時waiverは禁止します。

## script契約

root script:

```json
{
  "scripts": {
    "check": "bun run check:static && bun run format:check && bun run typecheck && bun run test",
    "check:static": "bun run lint && knip && knip --strict && jscpd --config .jscpd.json",
    "lint": "bun run lint:root && turbo run lint",
    "test": "vitest run --config vitest.config.ts --project=root-unit && turbo run test",
    "test:browser": "turbo run test:browser",
    "test:e2e": "turbo run test:e2e --filter=@enterprise-agentic-saas/web",
    "test:eval:agent": "turbo run test:eval:agent --filter=@enterprise-agentic-saas/agent",
    "test:e2e:full": "turbo run test:e2e:full --filter=@enterprise-agentic-saas/web"
  }
}
```

Knipとjscpdはmonorepo全体を解析するため、Turbo workspace taskへ分割しません。

## Oxlint上限

現在のhard budgetを次に固定します。

| rule                         | production core | React / adapter / transport | test / story / E2E / fixture |
| ---------------------------- | --------------: | --------------------------: | ---------------------------: |
| `complexity`（modified）     |              25 |                          30 |                           50 |
| `max-depth`                  |               6 |                           6 |                           12 |
| `max-lines`                  |             500 |                         500 |                         1000 |
| `max-lines-per-function`     |             250 |                         250 |                          500 |
| `max-params`                 |               6 |                           6 |                           10 |
| `max-statements`             |             100 |                         100 |                          500 |
| `max-nested-callbacks`       |               4 |                           4 |                           10 |
| `max-classes-per-file`       |               2 |                           2 |                            8 |
| `unicorn/max-nested-calls`   |               6 |                           6 |                           10 |
| `react/jsx-max-depth`        |          対象外 |                           9 |                           12 |
| `vitest/max-nested-describe` |          対象外 |                      対象外 |                            5 |

上限へ合わせるためだけの`part-*`分割や責務のないhelper抽出は行わず、責務境界が明確になる場合だけ
分割します。値を広げる変更、per-file disable、既存file除外、testへのproduction profile誤適用で
適合を装いません。

`max-lines`と`max-lines-per-function`は`skipBlankLines: true`、`skipComments: true`、
`max-lines-per-function`は`IIFEs: true`を使います。`max-params`は`countThis: "never"`、
`max-statements`は`ignoreTopLevelFunctions: false`とし、entrypointという名前だけで巨大処理を
除外しません。test overrideは最も最後に適用します。

test codeはscenario表現のためsize budgetだけを緩めますが、import、security、tenant、
focused/disabled testの規則は緩めません。

### profile selector

Oxlintのprofileは次の順に適用し、後のoverrideを優先します。

| 順序 | profile                           | selector                                                                                                                                                                                                                                                  |
| ---: | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    0 | lint対象外                        | `**/{node_modules,dist,coverage,.next,.wrangler,.mastra,.open-next,.turbo}/**`、`**/.next-*/**`、`**/generated/**`、`**/*.generated.{js,jsx,mjs,cjs,ts,tsx,mts,cts}`、`**/cloudflare-env.d.ts`、`**/{storybook-static,playwright-report,test-results}/**` |
|    1 | production core（default）        | 除外後の`**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}`。他profileに一致しないsourceは必ずここへ入る                                                                                                                                                               |
|    2 | React                             | `apps/web/src/{app,components,features,hooks}/**/*.{jsx,tsx}`、`packages/ui/src/**/*.{jsx,tsx}`、`packages/email/src/**/*.{jsx,tsx}`                                                                                                                      |
|    2 | adapter / transport               | APIのroute、repository、platform、entrypoint、Agentのadapterとcomposition root、Webの`src/lib/server/**`とconfig、Emulate、Auth、Email runtime/provider/development。正確なglobは各workspaceの`oxlint.config.ts`を正本にする                              |
|    3 | test / story / E2E / code fixture | `**/*.{test,spec}.{js,jsx,mjs,cjs,ts,tsx,mts,cts}`、`**/*.stories.{js,jsx,ts,tsx}`、`**/{test,tests,testing,__tests__,e2e,test-support,fixtures,__fixtures__}/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}`                                                       |

`fixture data`はlint対象外、実行されるcode fixtureは最後のtest profileです。root
`oxlint.config.ts`は`lintIgnorePatterns`、`createBudgetOverrides`、`workspaceBoundaryRule`を
named exportし、各workspace configがdefault root configと合成します。budgetと共通import ruleは
root default config内部を正本にし、別moduleやresolverへ複製しません。

## import規則

共通:

- `import/no-cycle`: all depth、`ignoreExternal: false`、`ignoreTypes: true`
- `import/no-self-import`
- `import/no-duplicates`: `considerQueryString: true`、`preferInline: false`
- `import/no-namespace`: 原則禁止し、`node:*`、Valibot、Vitestのmatcher登録、
  Drizzleへ渡すDB schemaだけを許可
- `typescript/no-require-imports`
- side-effect importはCSS、`server-only`、test setup等のallowlistだけ

`import/no-namespace`の例外は、namespaceとして公開される外部APIと、Drizzleがtableとrelationの
集合をobjectとして受け取る境界に限定します。設定値は`node:*`、`valibot`、
`@testing-library/jest-dom/vitest`、`@enterprise-agentic-saas/db/schema`、
`../schema/index`の完全一致とし、package family全体を許可するwildcardは使いません。

workspace別の`no-restricted-imports`は公開を許可したpackage entrypointだけをallowlistにします。
overrideではpattern配列がmergeされないため、共通config helperからworkspace境界を生成し、test
overrideでもこの規則を落としません。workspace内のlayerとsource配置はarchitecture文書、build、
package-owned test、code reviewで確認します。

workspace import境界は各Oxlint configの`no-restricted-imports`で強制し、dead file、dead export、
workspace isolationはKnipへ委ねます。独自のTypeScript AST、module resolver、production import
graph、architecture checker、ESLintは追加しません。

source配置は各architecture文書とreviewで確認します。storyの実render、interaction、a11yは
StorybookとBrowser Mode test、Suspense、Error Boundary、route geometryはcomponent testと
Playwrightを正本にします。新しいasync routeやbrowser componentの追加時は、同じ変更で対応する
boundary file、story、testをreviewし、対応manifestやrepo専用scannerを追加しません。

## Oxfmt

line lengthはOxlint `max-len`でhard failせず、Oxfmtの`printWidth: 80`へ統一します。root
formatとpre-commitは全fileをOxfmtへ渡し、対応する形式だけをformatします。Markdown、MDX、
YAML、TOMLは除外せず、未対応形式だけがstagedされてもhookをfailさせません。

## a11yとテスト規則

Web/UI:

- `jsx-a11y` correctnessをerror
- Storybook a11y violationをtest error
- Testing Libraryのnode access、unawaited query、debug utilityを禁止
- Playwrightの`waitForTimeout`、`networkidle`、focused testを禁止
- Vitestのdisabled/focused testをerror
- `test.skip`は理由と代替coverageをcode commentへ明記
- Error Boundary testはraw error/URL/private IDのsentinelがDOMと読み上げ領域へ出ないことを検証

JSDoc/TSDocを全functionへ強制しません。public export、security invariant、非自明なcompatibility
要件だけを対象にします。型と名前で明白なprivate helperへの重複説明を避けるためです。

## Knip

### 目的

- dead file
- dead export
- unused dependency
- unlisted dependency
- workspace dependency isolation

### 実行

```sh
knip
knip --strict
```

full modeはtest、Storybook、configを含む全codeを解析します。`--strict`はproduction isolationを追加で検査します。

設定原則:

- Bun workspaceはroot `package.json`から認識させる
- root sourceが必要ならworkspace `.`へ設定する
- dynamic entrypointは狭いpatternで明示する
- wildcard ignoreでfalse positiveを消さない
- `ignoreDependencies`にはissue、責任者、理由をcommentで残す
- generated `.agents/skills`、build output、migration snapshotは解析対象外

findingは同じ変更で全て解消し、baselineをcommitしません。

### 未使用項目の削除

Knipまたは`rg`で呼び出し元が0件でも、それだけでscript、task、設定、patch、package exportを
削除しません。manifest、package export、CI、Nix、Lefthook、文書、動的command、linked
`worktree`、利用者が直接実行する公開commandを同じ監査対象にします。削除後は同じ受け入れ経路を
標準CLI、標準設定または既存実装で再現できることを確認します。

リポジトリ固有の起動処理が環境変数の投影、ローカル認証情報の除去、証明書、signal転送、永続stateを
所有する場合は、標準CLIだけで同じ契約を満たせるまで維持します。formatはリポジトリルートの
`format`と`format:check`が全ワークスペースを所有し、個別ワークスペースへ同じaliasを置きません。

## jscpd

production TypeScript/TSXのcopy-pasteを検出します。

推奨初期値:

```json
{
  "path": ["apps/*/src", "apps/web/src", "packages/*/src"],
  "threshold": 3,
  "minTokens": 70,
  "minLines": 8,
  "mode": "mild",
  "format": ["typescript", "tsx"],
  "output": "test-results/jscpd",
  "reporters": ["console", "json"],
  "ignore": [
    "**/*.test.*",
    "**/*.stories.*",
    "**/e2e/**",
    "**/test-support/**",
    "**/fixtures/**",
    "**/*.config.*",
    "**/scripts/**",
    "**/generated/**",
    "**/dist/**",
    "**/.next/**"
  ]
}
```

Test codeは別の重複特性を持つためproduction thresholdへ混ぜません。共通test helperへ抽出する価値があるduplicateはKnip/reviewで扱います。
root、config、script、docsを含むrepository全体を入力にせず、`path`をproduction source rootへ
固定します。ignoreはそのroot内のtest/story/E2E/code fixture/generatedだけを除外します。
入力pathとignoreは`.jscpd.json`を正本にし、広い除外をreviewで拒否します。

thresholdを超える場合は同じ変更内でrefactorします。baseline比較による段階導入はしません。

## Git hook

### pre-commit

- commit message
- staged source変更に対するリポジトリルートのVitest `related --run`。
  root `vitest.config.ts`だけが`defineConfig`でTest Projects、global coverage、Browser Mode、Storybook、
  `forceRerunTriggers`を定義する。各workspace configは単一の`*-unit` projectを`defineProject`で定義し、
  rootがconfig pathとして登録する。各scriptはroot configとproject名を明示し、cwdによるconfig探索へ
  依存しない。LefthookはVitestの`--project='*-unit'`で単体・統合テストだけを選び、ワークスペースを
  またぐ静的`import`を1つのVitestプロセスで追跡する。設定、マニフェスト、setup、`tsconfig.json`、
  DBトリガーは`forceRerunTriggers`で全`*-unit` projectへ縮退する。削除pathはVitestへそのまま渡し、
  shellによる検出や全件fallbackは設けない
- staged Oxfmt
- lint可能なstaged fileがある場合のrootと全workspaceのOxlint

### pre-push

- `bun run check`

Browser/E2E/paid testをpre-pushへ入れません。長時間化による`--no-verify`利用を誘発しないためです。

## CI

必須job:

```text
Nix
Static analysis
Quality
Browser
Free E2E
Cloudflare dry-run
```

- `Static analysis`: format、Oxlint、Knip full/strict、jscpd、DB履歴とschema drift
- `Quality`: typecheck、unit・integration test、workspace buildを独立laneで並列実行して集約する
- `Browser`: Storybookのlight/dark、Browser Mode、static build、UI components、Next.js integrationを
  独立laneで実行して集約する
- `Free E2E`: Agent profileを3ワーカー、OAuth・WebAuthnを含むAuth profileを1ワーカーで実行して集約する
- `Cloudflare dry-run`: Web/API/Images/Agent production bundle

Paid testはfork PRへsecretを渡さず、通常PRのrequired checkにも含めません。maintainerの明示実行、
nightly、release candidateだけで実行します。

## 例外

Permanent overrideに必須:

- exact file glob
- rule名
- 技術的理由
- 責任者
- 削除条件

Temporary waiverはmainへmergeしません。全変更をbudgetへ適合させます。

## 理由と代償

### 理由

- agentが大きなfunctionへ処理を集中させる傾向を機械的に止める
- dead codeとunused dependencyをreviewだけへ依存しない
- duplicate実装による修正漏れを減らす

### 代償

- 既存違反を発見した変更のrefactor量が大きくなることがある
- budgetへ合わせるだけの不自然な分割が起こり得る
- Knip/jscpdのfalse positive調査が必要

Ruleを目的ではなく責務境界のsignalとして扱い、意味のないhelper抽出は差分レビューで拒否します。

## 受入条件

- Oxlint warningがゼロ
- 全sourceが初期budgetではなく最終目標budget内
- Knip full/strict findingがゼロ
- jscpd threshold以下
- exported browser componentにnamed storyがあり、Storybook/Browser Mode testが成功する
- client側の`<Suspense>`、Skeleton、Error Boundaryを対象component testで検証する
- async Server Component routeの`loading.tsx`、`error.tsx`、Playwright W6に欠落がない
- jscpdがproduction sourceだけをscanする
- broad ignoreとbaseline fileがない
- `bun run check`がlocal/CIで成功する
