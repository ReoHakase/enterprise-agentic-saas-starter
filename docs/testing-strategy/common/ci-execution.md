---
title: CIとテスト実行契約
status: accepted
implementation: active
last_reviewed: 2026-08-13
applies_to:
  - package.json
  - turbo.json
  - vitest.config.ts
  - .github/workflows/**
  - apps/**/package.json
  - packages/**/package.json
---

# CIとテスト実行契約

## 目的

開発者がテスト層の全名称を覚えなくても、実行環境と費用に応じた少数の公開スクリプトで適切な検査を実行できるようにします。

通常PRと`main`では無料テストを全件実行し、変更選択による見落としを作りません。

リポジトリルートの公開テストスクリプトとPR・`main`のテストは全件実行を維持します。ローカルの
pre-commitだけは、ADR-014に従ってLefthookの単一コマンドからstaged fileをリポジトリルートの
Vitest `related --run`へ渡します。
既存のroot `vitest.config.ts`は唯一の`defineConfig`としてTest Projectsを常時定義し、各Node
ワークスペースとWeb/UIの単体テストを登録します。`apps/**`と`packages/**`のVitest configは公式構成に
従って単一projectを`defineProject`で定義し、rootがconfig pathとして参照します。Browser Mode、
Storybook、global coverage、`forceRerunTriggers`はrootが所有します。新しいconfigや選択scriptは追加しません。
各workspace scriptはroot configと一意なproject名を明示し、cwdによるconfig探索へ依存しません。
各projectの依存グラフからワークスペースをまたぐ静的`import`を追跡します。
設定、マニフェスト、setup、`tsconfig.json`、DBトリガーはリポジトリルートの
`forceRerunTriggers`で全`*-unit` projectへ縮退します。Lefthookの関連テストcommandはVitestだけを実行し、
`git diff`、`jq`、独自selector、workspace `glob`、削除専用fallbackを使いません。全staged pathを
Vitestへ渡し、対象外pathではテストを0件とします。削除後のpathは現在ツリーの静的graphへ
接続できず0件になる場合があるため、pre-push、PR、`main`の全件テストで補完します。Browser Mode、
E2E、有料テストは対象にしません。

## 公開スクリプト

```json
{
  "scripts": {
    "test": "vitest run --config vitest.config.ts --project=root-unit && turbo run test",
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
Nix
Static analysis
Quality
Browser
Free E2E
Cloudflare dry-run
```

### Static analysis

- format
- DB history check
- DB schema drift
- migration immutability
- lint、Knip、jscpd

### Quality

`fail-fast: false`のmatrixで次を独立jobとして並列実行し、`Quality`で集約します。

- `Quality · Typecheck`
- `Quality · Unit and integration tests`
- `Quality · Application builds`

coverageはunit・integration test laneだけがuploadします。workspaceの通常buildにはEmulateを含め、
deploy target固有のCloudflare dry-runも別jobとして維持します。

### Browser

- `Storybook · light`、`Storybook · dark`、`Vitest Browser Mode`、`Storybook static build`を
  独立jobとして並列実行し、`Browser · Web components`で集約する
- Storybookの各テーマ内は`fileParallelism: false`、`maxWorkers: 1`を維持する
- static buildのfontはlocal assetまたは固定system stackを使い、外部font APIへ依存しない
- `Browser · Next.js integration`で実Next.jsと差し替え済みdownstreamの統合を検査する
- pinned Chromium、WebKit install
- laneごとに一意なfailure artifact

### Free E2E

- `DETERMINISTIC_E2E_PROFILE=agent`を3ワーカーで実行する
- `DETERMINISTIC_E2E_PROFILE=auth`を1ワーカーで直列実行する
- 未指定時は`all`としてrootの`test:e2e`契約を維持する
- provider secretなし
- profileに必要なtemporary DB、Wrangler state、web serverだけを構築する
- profileごとに一意なfailure artifact

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
- build cacheのうちsecret非依存なもの
- migration済みtest DB template
- Storybook/Vite transform cache

Playwrightのbrowser binaryは公式の費用対効果に関する注意に従い、通常CIではcacheしません。
Playwright公式containerと独自CI imageもこの構成では使いません。

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
