---
title: CIとテスト実行契約
status: proposed
implementation: planned
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

高速化に失敗した場合はテスト省略ではなく、より広い無料テスト実行へ縮退します。

## 公開スクリプト

```json
{
  "scripts": {
    "test": "turbo run test",
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
  "check": "bun run lint && bun run format:check && bun run typecheck && bun run test"
}
```

`check`へbrowser、E2E、有料testを含めません。日常的な実行回避を招かないためです。

## 実行頻度

| スクリプト        | ローカル | pre-push   | PR                               | `main`     | nightly      | release candidate  |
| ----------------- | -------- | ---------- | -------------------------------- | ---------- | ------------ | ------------------ |
| `check`           | 常時     | 必須       | affected + 明示追加              | full       | full         | full               |
| `test:browser`    | UI変更時 | 任意       | affected                         | full       | full         | full               |
| `test:e2e`        | 必要時   | 任意       | 変更pathに応じる                 | full       | full         | full               |
| `test:eval:agent` | 明示     | 実行しない | fingerprint変更 + approval時だけ | 任意       | full dataset | release dataset    |
| `test:e2e:full`   | 明示     | 実行しない | 実行しない                       | 実行しない | 任意canary   | 必須または明示判断 |

## ローカル変更選択

Vitestの`--changed`はworkspace内の高速feedbackに使います。

```sh
bun --cwd apps/web run test -- \
  --changed=origin/main \
  --coverage.enabled=false
```

未commit差分:

```sh
bun --cwd apps/web run test -- \
  --changed \
  --coverage.enabled=false
```

`--changed`はrequired CIの唯一の根拠にしません。module graphに現れないmigration SQL、CSS、Storybook config、generated fileは`forceRerunTriggers`へ登録します。

## CI変更選択

PR CIは二段階で選択します。

1. Turborepoの`--affected`でworkspaceとdownstream consumerを選ぶ
2. 変更pathと追加suiteの対応表で、依存方向だけでは選べないtestを追加する

### 基準SHA

`pull_request`:

```text
base = github.event.pull_request.base.sha
head = github.sha
```

`main` push:

```text
base = github.event.before
head = github.sha
```

checkoutはfull historyまたは必要なbase commitを取得します。base不明、zero SHA、fetch失敗、selector失敗では無料testのfull runへ縮退します。

## 変更pathと追加suite

| 変更path                                   | 必ず追加する検査                                          |
| ------------------------------------------ | --------------------------------------------------------- |
| `packages/db/src/schema/**`                | DB full test、history、schema drift、API A3/A4、E1        |
| `packages/db/drizzle/**`                   | DB full test、history、schema drift、E1                   |
| `apps/api/src/modules/**/repository*`      | API full test、DB full test、必要なE1                     |
| `apps/api/src/modules/**/authorization/**` | API full test、Auth relevant test、E1                     |
| `packages/auth/**`                         | Auth full test、API mount test、Web auth test、E1         |
| `packages/email/**`                        | Email full test、API mail command test、必要なE1          |
| `packages/ui/src/**`                       | UI test、UI browser、consumer Web affected test、必要なW6 |
| `apps/web/features/**`                     | Web test、必要なW3/W4、criticalな場合W6                   |
| `apps/web/app/**`、`middleware.ts`         | Web test、W6、critical route変更ならE1                    |
| `apps/agent/src/**`                        | G1-G4、E1、fingerprint変更ならG5候補                      |
| prompt、model setting、tool schema         | G1-G4、G5、release時E2                                    |
| E2E config、fixture、selector              | E1 full                                                   |
| test selector自体                          | 全無料test                                                |
| docsだけ                                   | code generationまたはconfigへ影響しない限りE1不要         |

対応表は可能なら`scripts/ci/select-test-suites.ts`を正本とし、文書を同じdataから生成または検証します。

## CI job

推奨job:

```text
nix
quality
browser
e2e-deterministic
cloudflare
paid-eval
release-e2e
```

### quality

- DB history check
- DB schema drift
- migration immutability
- lint、architecture check
- format
- typecheck
- affected `test`
- build

### browser

- Chromium install/cache
- affected `test:browser`
- Storybook/a11y report
- failure artifact

### e2e-deterministic

- `test:e2e`
- provider secretなし
- temporary DB、Wrangler state
- failure artifact

### paid-eval

- protected workflow
- `test:eval:agent`
- behaviour fingerprint
- bounded artifact
- fork PRでは実行しない

### release-e2e

- manual approval
- isolated release environment
- `test:e2e:full`
- remote write allowlist
- strict artifact policy

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

変更選択が困難な場合、無料testは減らさずfull runへ縮退します。

## artifact retention

- source mapとcoverage: 通常retention
- E1 trace/video: failure時のみ、短期retention
- Storybook static build: 必要なPRだけ
- G5/E2: bounded metadataのみ、最短retention
- secret、cookie、private contentが含まれたartifactはupload前に拒否する

## 受入条件

- root public scriptが実行環境と費用で整理される
- layerごとのroot scriptを増やさない
- `--changed`と`--affected`の用途が区別される
- API repository変更でDB testが追加される
- Web app route変更でW6が選ばれる
- Agent fingerprint変更だけがG5候補になる
- selector失敗がtest省略ではなくfull無料実行へ縮退する
- fork PRへ有料secretを渡さない
