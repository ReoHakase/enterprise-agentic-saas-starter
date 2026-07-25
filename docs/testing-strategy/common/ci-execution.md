---
title: CIとテスト実行契約
status: accepted
implementation: active
last_reviewed: 2026-07-26
applies_to:
  - package.json
  - turbo.json
  - .github/workflows/**
  - apps/**/package.json
  - packages/**/package.json
---

# CIとテスト実行契約

## 目的

開発者がテスト層の全名称を覚えなくても、実行環境と費用に応じた少数の公開スクリプトで適切な検査を実行できるようにします。

通常PRと`main`では無料テストを全件実行し、変更選択による見落としを作りません。

affected / changedによる選択は後続作業へ延期します。導入時は新しい公開scriptを増やさず、base解決失敗やselector失敗で全無料suiteへ縮退する契約を別のADRで確定します。

## 公開スクリプト

```json
{
  "scripts": {
    "test": "vitest run --config vitest.config.ts && turbo run test",
    "test:browser": "turbo run test:browser",
    "test:e2e": "turbo run test:e2e --filter=@enterprise-agentic-saas/web",
    "test:eval:agent": "turbo run test:eval:agent --filter=@enterprise-agentic-saas/agent",
    "test:e2e:full": "turbo run test:e2e:full --filter=@enterprise-agentic-saas/web"
  }
}
```

| スクリプト        | 含めるもの                                               | 含めないもの                        |
| ----------------- | -------------------------------------------------------- | ----------------------------------- |
| `test`            | A1-A5、W1/W2/W5、G1-G4、DB、Auth、UI1/UI2、Email、GE、TS | 実browser、実LLM、E2E               |
| `test:browser`    | W3、W4、W6、UI3、UI4、a11y                               | 全構成E2E、実LLM                    |
| `test:e2e`        | E1決定的E2E                                              | 実LLM、production external provider |
| `test:eval:agent` | G5                                                       | browser、full stack                 |
| `test:e2e:full`   | E2完全E2E                                                | 通常PR実行                          |

## `check`

```json
{
  "check": "bun run check:static && bun run format:check && bun run typecheck && bun run test"
}
```

`check`へbrowser、E2E、有料testを含めません。日常的な実行回避を招かないためです。

## 実行頻度

| スクリプト        | ローカル | pre-push   | PR         | `main`     | nightly      | release candidate  |
| ----------------- | -------- | ---------- | ---------- | ---------- | ------------ | ------------------ |
| `check`           | 常時     | 必須       | full       | full       | full         | full               |
| `test:browser`    | UI変更時 | 任意       | full       | full       | full         | full               |
| `test:e2e`        | 必要時   | 任意       | full       | full       | full         | full               |
| `test:eval:agent` | 明示     | 実行しない | 実行しない | 実行しない | full dataset | release dataset    |
| `test:e2e:full`   | 明示     | 実行しない | 実行しない | 実行しない | 任意canary   | 必須または明示判断 |

## CI job

必須job:

```text
nix
quality
static-quality
browser
free-e2e
cloudflare-dry-run
```

### quality

- format
- typecheck
- full `test`
- build

### static-quality

- DB history check
- DB schema drift
- migration immutability
- lint、Knip、jscpd

### browser

- pinned Chromium、WebKit install
- full `test:browser`
- Storybook/a11y report
- failure artifact

### free-e2e

- `test:e2e`
- provider secretなし
- temporary DB、Wrangler state
- failure artifact

### cloudflare-dry-run

- Web、API、Agentのproduction bundle
- deployなし

### paid workflow

`test:eval:agent`と`test:e2e:full`は通常CIへ含めません。保護された`Agent paid tests`
workflowでだけ実行し、E2はmanual approval、isolated environment、remote write allowlist、strict
artifact policyを要求します。

## cache

cacheしてよいもの:

- Bun package cache
- browser binary
- build cacheのうちsecret非依存なもの
- migration済みtest DB template
- Storybook/Vite transform cache

cacheしない、または慎重に扱うもの:

- paid model result
- test outcomeを左右するmutable DB
- auth session、cookie、token
- R2 fixture state
- provider response
- secretを含むbuild output

## fork PR

fork PRへ有料secretを渡しません。

実行するもの:

- static
- `test`
- `test:browser`
- E1

実行しないもの:

- G5
- E2

fork PRでも無料testは全件実行します。

## artifact retention

- source mapとcoverage: 通常retention
- E1 trace/video: failure時のみ、短期retention
- Storybook static build: 各PRで短期retention
- G5/E2: bounded metadataのみ、最短retention
- secret、cookie、private contentが含まれたartifactはupload前に拒否する

## 受入条件

- root public scriptが実行環境と費用で整理される
- layerごとのroot scriptを増やさない
- PRと`main`で無料suiteを全件実行する
- API repositoryとDB testを同じ無料suiteで検証する
- Web app routeをW6で検証する
- G5とE2を通常PRから隔離する
- fork PRへ有料secretを渡さない
