---
title: 品質強制
status: proposed
implementation: planned
last_reviewed: 2026-07-24
applies_to:
  - oxlint.config.ts
  - apps/*/oxlint.config.ts
  - packages/*/oxlint.config.ts
  - knip.config.ts
  - .jscpd.json
  - lefthook.yml
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

ratchetや既存違反baselineは使いません。全面移行PRで既存sourceを全てbudget内へrefactorし、最終merge時点から全ruleをerrorにします。

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
    "check:static": "bun run lint && bun run check:architecture && knip && knip --strict && jscpd --config .jscpd.json",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "test:browser": "turbo run test:browser",
    "test:e2e": "turbo run test:e2e --filter=@enterprise-agentic-saas/web",
    "test:eval:agent": "turbo run test:eval:agent --filter=@enterprise-agentic-saas/agent",
    "test:e2e:agent": "turbo run test:e2e:agent --filter=@enterprise-agentic-saas/web"
  }
}
```

Knipとjscpdはmonorepo全体を解析するため、Turbo workspace taskへ分割しません。

## Oxlint上限

既存codeを一度のPRで移行でき、以後の肥大化を止められる初期budgetを次に固定します。

| rule | production core | React / adapter / transport | test / story / E2E / fixture |
| --- | ---: | ---: | ---: |
| `complexity`（modified） | 25 | 30 | 50 |
| `max-depth` | 4 | 5 | 8 |
| `max-lines` | 1000 | 1000 | 4000 |
| `max-lines-per-function` | 250 | 300 | 1000 |
| `max-params` | 6 | 6 | 10 |
| `max-statements` | 100 | 120 | 500 |
| `max-nested-callbacks` | 4 | 5 | 10 |
| `max-classes-per-file` | 2 | 2 | 8 |
| `unicorn/max-nested-calls` | 6 | 6 | 10 |
| `react/jsx-max-depth` | 対象外 | 9 | 12 |
| `vitest/max-nested-describe` | 対象外 | 対象外 | 5 |

`max-lines`と`max-lines-per-function`は`skipBlankLines: true`、`skipComments: true`、
`max-lines-per-function`は`IIFEs: true`を使います。`max-params`は`countThis: "never"`、
`max-statements`は`ignoreTopLevelFunctions: false`とし、entrypointという名前だけで巨大処理を
除外しません。test overrideは最も最後に適用し、production fileへ誤適用しないことをconfig testで
検証します。

この値は理想値ではなく全面移行のhard gateです。初回から80行やcomplexity 10を要求すると、
意味のないhelper分割や大量waiverを生みやすいため採用しません。移行後に実測分布を基に厳しくする
場合は、既存違反を作らない別PRでbudgetを下げます。test codeはscenario表現のため緩めますが、
import、security、tenant、focused/disabled testの規則は緩めません。

### profile selector

Oxlintのprofileは次の順に適用し、後のoverrideを優先します。

| 順序 | profile | exact glob |
| ---: | --- | --- |
| 0 | lint対象外 | `**/{node_modules,dist,coverage,.next,.wrangler,.mastra}/**`、`**/generated/**`、`**/*.generated.{js,jsx,mjs,cjs,ts,tsx,mts,cts}`、`apps/agent/src/cloudflare-env.d.ts`、`packages/db/drizzle/**` |
| 1 | production core（default） | 除外後の`**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}`。他profileに一致しないsourceは必ずここへ入る |
| 2 | React | `apps/web/{app,components,features,hooks}/**/*.{jsx,tsx}`、`packages/ui/src/**/*.{jsx,tsx}`、`packages/email/src/**/*.{jsx,tsx}` |
| 2 | adapter / transport | `apps/api/src/modules/**/{routes,repository,module}.ts`、`apps/api/src/modules/**/adapters/{http,persistence}/**/*.{ts,tsx}`、`apps/api/src/platform/**/*.ts`、`apps/agent/src/mastra/{adapters,composition}/**/*.{ts,tsx}`、`apps/agent/src/mastra/{index,worker}.ts`、`apps/github-emulator/src/**/*.{ts,tsx}`、`packages/auth/src/**/*.{ts,tsx}`、`packages/email/src/{runtime,providers,development}/**/*.{ts,tsx}` |
| 2 | config / script | `**/*.config.{js,mjs,cjs,ts,mts,cts}`、`**/scripts/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}` |
| 3 | test / story / E2E / code fixture | `**/*.{test,spec}.{js,jsx,mjs,cjs,ts,tsx,mts,cts}`、`**/*.stories.{js,jsx,ts,tsx}`、`**/{test,tests,testing,__tests__,e2e,test-support,fixtures,__fixtures__}/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}` |

`fixture data`はlint対象外、実行されるcode fixtureは最後のtest profileです。config testは各globの
代表pathと境界上のpathをprofile resolverへ入力し、意図したprofileが一つに決まること、未知の
production sourceがcoreへfall backすること、flat/昇格済みAPI adapterが同じprofileになること、
testが最後に上書きすることを検証します。

共通例:

```ts
export const productionBudgets = {
  complexity: ["error", { max: 25, variant: "modified" }],
  "max-depth": ["error", { max: 4 }],
  "max-lines-per-function": [
    "error",
    {
      max: 250,
      skipBlankLines: true,
      skipComments: true,
      IIFEs: true,
    },
  ],
  "max-statements": [
    "error",
    { max: 100, ignoreTopLevelFunctions: false },
  ],
  "max-lines": [
    "error",
    { max: 1000, skipBlankLines: true, skipComments: true },
  ],
  "max-params": ["error", { max: 6, countThis: "never" }],
  "max-nested-callbacks": ["error", { max: 4 }],
  "max-classes-per-file": ["error", { max: 2 }],
  "unicorn/max-nested-calls": ["error", { max: 6 }],
} as const
```

Budget超過をdisable commentで解決せず、責務分割を行います。

## import規則

共通:

- `import/no-cycle`: all depth、`ignoreExternal: false`、`ignoreTypes: true`
- `import/no-self-import`
- `import/no-duplicates`: `considerQueryString: true`、`preferInline: false`
- `typescript/no-require-imports`
- side-effect importはCSS、`server-only`、test setup等のallowlistだけ

workspace/layer別の`no-restricted-imports`は各architecture文書のdependency directionを実装します。
overrideではpattern配列がmergeされないため、共通config helperでworkspace境界とlayer境界を
明示的に合成します。test overrideでもこの配列を落としません。

Oxlintがresolved path zoneを完全に表現できない部分は、`bun run check:architecture`で実際の解決先を検査します。`check:architecture`は最初から`check:static`へ含め、optionalな後付けにしません。

## Oxfmt

line lengthはOxlint `max-len`でhard failせず、Oxfmtの`printWidth: 100`へ統一します。URL、import、generated typeに例外が増えることを避けるためです。

## a11yとテスト規則

Web/UI:

- `jsx-a11y` correctnessをerror
- Storybook a11y violationをtest error
- Testing Libraryのnode access、unawaited query、debug utilityを禁止
- Playwrightの`waitForTimeout`、`networkidle`、focused testを禁止
- Vitestのdisabled/focused testをerror
- `test.skip`は理由と代替coverageをcode commentへ明記

JSDoc/TSDocを全functionへ強制しません。public export、security invariant、非自明なcompatibility boundaryだけを対象にします。型と名前で明白なprivate helperへの重複説明を避けるためです。

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
- `ignoreDependencies`にはissue、owner、理由をcommentで残す
- generated `.agents/skills`、build output、migration snapshotは解析対象外

全面移行PRではfindingを全て解消し、baselineをcommitしません。

## jscpd

production TypeScript/TSXのcopy-pasteを検出します。

推奨初期値:

```json
{
  "path": [
    "apps/*/src",
    "apps/web/app",
    "apps/web/components",
    "apps/web/features",
    "apps/web/hooks",
    "apps/web/lib",
    "packages/*/src"
  ],
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
    "**/drizzle/**",
    "**/generated/**",
    "**/dist/**",
    "**/.next/**"
  ]
}
```

Test codeは別の重複特性を持つためproduction thresholdへ混ぜません。共通test helperへ抽出する価値があるduplicateはKnip/reviewで扱います。
root、config、script、docsを含むrepository全体を入力にせず、`path`をproduction source rootへ
固定します。ignoreはそのroot内のtest/story/E2E/code fixture/generatedだけを除外します。
config testではproduction sourceがscan対象、test/config/root scriptが対象外になる代表fixtureを
実行し、入力path追加漏れとignoreの過剰化を検出します。

thresholdを超える場合は全面移行PR内でrefactorします。baseline比較による段階導入はしません。

## Git hook

### pre-commit

- commit message
- staged Oxfmt
- affected workspaceのOxlint
- docs metadata/link check

### pre-push

- `bun run check`

Browser/E2E/paid testをpre-pushへ入れません。長時間化による`--no-verify`利用を誘発しないためです。

## CI

必須job:

```text
nix
quality
static-quality
browser
free-e2e
cloudflare-dry-run
```

- `quality`: format、typecheck、`bun run test`、build
- `static-quality`: Oxlint、architecture check、Knip full/strict、jscpd
- `browser`: Storybook/Browser Mode
- `free-e2e`: selectorに基づくE1/E2
- `cloudflare-dry-run`: Web/API/Agent production bundle

Paid testはfork PRへsecretを渡しません。Agent behaviour fingerprintが変わるPRは、repo-owned
trusted refへ固定したmaintainer承認runをrequiredにします。nightlyとrelease candidateでも実行します。

## 例外

Permanent overrideに必須:

- exact file glob
- rule名
- 技術的理由
- owner
- 削除条件

Temporary waiverはmainへmergeしません。全面移行完了条件は全budgetへの適合です。

## 理由と代償

### 理由

- agentが大きなfunctionへ処理を集中させる傾向を機械的に止める
- dead codeとunused dependencyをreviewだけへ依存しない
- duplicate実装による修正漏れを減らす

### 代償

- 全面移行PRのrefactor量が大きい
- budgetへ合わせるだけの不自然な分割が起こり得る
- Knip/jscpdのfalse positive調査が必要

Ruleを目的ではなく責務境界のsignalとして扱い、意味のないhelper抽出はreviewerが拒否します。

## 受入条件

- Oxlint warningがゼロ
- 全sourceがbudget内
- Knip full/strict findingがゼロ
- jscpd threshold以下
- jscpdがproduction sourceだけをscanする
- broad ignoreとbaseline fileがない
- `bun run check`がlocal/CIで成功する
