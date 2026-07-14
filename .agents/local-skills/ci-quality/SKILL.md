---
name: ci-quality
description: enterprise-agentic-saas-starterのGitHub Actions、CI品質ゲート、oxlint、oxfmt、Vitest、Storybook test runner、Playwright実行、Next build、Turbo tasks、ESLint/Prettier/Jestを入れるべきか判断するときに使う。
---

# CI And Quality

このskillはlint/format/typecheck/test/build/CIを変更するときに使う。

## 方針

- primary lintはoxlint。各workspaceのscriptは`oxlint --deny-warnings`にし、plugin warningもCI failureとして扱う。
- primary formatterはoxfmt。
- Oxlint/Oxfmt configはTS形式（root `oxlint.config.ts` / `oxfmt.config.ts`、package固有 `oxlint.config.ts`）にする。Oxlint TS configの `extends` はパス文字列ではなく、root configをimportしてconfig objectを渡す。
- root `package.json` は `"type": "module"` にし、NodeのTS config ESM読込warningを出さない。
- Oxlint TS configはrootをimportする際、Node ESM loader都合で `.ts` 拡張子を明示する（`import rootConfig from "../../oxlint.config.ts"`）。`tsc --noEmit` がTS5097で落ちないよう、`oxlint.config.ts` を拾うpackage（`include: ["."]` や `**/*.ts` を持つもの）の `tsconfig.json` の `exclude` に `oxlint.config.ts` を加える。
- Oxlint設定はrootに共通・基礎だけを置き、Next/React/Tailwindなどpackage固有設定は各packageからroot configを `extends` して分ける。
- Oxfmt設定はroot一括にする。
- Tailwind v4をOxlintで見る場合は `oxlint-tailwindcss` と `@tailwindcss/node` を一緒に入れる。
- backend/API/DB/Auth packageはReact/Next/Tailwind/jsx-a11y pluginを足さず、server TypeScript向けpluginに寄せる。
- React Email packageはReact componentを書くため `react` / `react-perf` を使うが、Next/Tailwind/browser前提にはしない。
- Vitestを使うworkspaceはpackage-local Oxlint configで`vitest` pluginを有効にする。Vitestのcustom expect messageやinterfaceから型が決まるmockにOxlintのJest互換ruleが誤適用される場合だけ、対象test fileと理由を限定してoverrideする。
- unit/integrationはVitest。
- UI state、a11y、interactionはStorybook 10 + Vitest addon + Playwright browser provider。旧standalone Storybook test runnerは追加しない。
- Storybook browser testへ新しいBase UI primitiveを初めて追加すると、test中のVite再最適化でpage reloadとshim取得失敗が起きうる。`packages/ui/vitest.config.ts`の`optimizeDeps.include`へ対象の`@base-ui/react/*` entryを明示し、light/dark両projectで再現しないことを確認する。
- browser E2EはPlaywright。
- Next.js buildをCIの品質ゲートに含める。
- GitHub ActionsはNix、quality、Storybook、E2E、Cloudflare dry-runを独立jobにする。PRのE2Eは決定的なmock、production deployはGitHub Environment approvalとconcurrency lockを使う。
- 新規方針としてESLint/Prettier/Jestを増やさない。既存テンプレートからの移行は別作業として扱う。

## 推奨CI順序

```txt
1. bun install --frozen-lockfile
2. oxlint
3. oxfmt --check
4. typecheck
5. vitest
6. storybook build
7. Storybook Vitest browser test (light/dark + a11y + interaction)
8. next build
9. playwright smoke/full e2e
```

## Turbo

- package-local Oxlint config/pluginを確実に使うため、root `lint` は `turbo run lint` にする。rootから `oxlint` を再帰実行して代用しない。
- Lefthookのpre-commit lintは `bun run lint` を引数なしで呼ぶ。`bun run lint -- {staged_files}` はfile pathをTurboの追加task名として解釈するため使わない。
- `typecheck` / `test` / `build` も `turbo run <task>` に寄せる。Oxfmtはroot一括、`check` はrootでlint/format/typecheck/testを順に呼ぶaggregateにする。
- cache可能なtaskとpersistentなdev/storybookを分ける。
- `check` はlint/format/typecheck/unit testの集合にする。workspaceに空の `check` scriptを量産せず、root scriptから各実taskを呼ぶ。
- PR用Playwrightは自身の `webServer` でNext dev + mock APIを起動するため、Turbo `test:e2e` からproduction buildへ依存させない。production build/OpenNext dry-runは別jobでgateし、E2E artifactとして `test-results` と `playwright-report` を残す。
- `build:cloudflare` はcacheせず、Web OpenNext artifactとAPI Wrangler dry-run artifactを検証する。
- package cwdから `oxfmt .` を走らせるため、ignoreは `.next/**` だけでなく `**/.next/**` のようにmonorepo全体を覆う。
- formatter/linterは `.next-e2e/**`、`.next-e2e-oauth/**`、`.open-next/**`、`storybook-static/**`、`playwright-report/**`、`test-results/**`、`**/next-env.d.ts` もroot直下・package配下の生成物として除外する。artifact生成後にも `format:check` / `lint` がsourceだけを見ることを確認する。

## Sentry/Cloudflare build

- Sentry SDK追加後もWeb `build:cloudflare`とAPI Wrangler dry-runをrelease gateにする。Next build成功だけでOpenNext/Workers互換と判断しない。
- source map upload用`SENTRY_AUTH_TOKEN`、`SENTRY_ORG`、`SENTRY_PROJECT`はCI/deploy jobのsecret/pass-throughだけに置き、PR forkやruntime/public envへ渡さない。通常のlocal/PR buildはcredentialなしでも成功させる。
- API deployはWrangler dry-run artifactへSentry debug IDを注入・uploadした後、その同一artifactを`--no-bundle`でdeployする。API/Webで`SENTRY_PROJECT`をstepごとに切り替え、同じ`SENTRY_RELEASE`を使う。
- observability helperのunit testはSpotlight local-only判定、sampling境界、DSNのproduction-only判定、PII/secret/ID scrubを含める。
- CI workflowで設定したenvはTurbo strict modeではtaskの`env`または`passThroughEnv`にも宣言する。特に`test`の`EMAIL_FROM`と`build:cloudflare`の`NEXT_PUBLIC_*`をworkflowだけに置かない。
- deploy smokeではWeb/API release、readable stack、distributed trace、Uptime monitor、notification testを確認し、意図的test error endpointをproductionへ残さない。

## Bun + Vitest

- Vitestを使うなら `bun run test`。`bun test` はBun自身のtest runnerなので混同しない。
- coverageは`@vitest/coverage-v8`を使い、実際にunit test対象として保守しているsourceだけを明示的に`include`する。現実的なthresholdをCIで常時有効にし、`coverage/**`をTurbo outputとCI artifactに残す。
- 新規workspaceにはREADMEとVitest testを必ず置き、root `check` はlint/format/typecheck/testを含める。

## GitHub Actions

- PR では **Quality**（Bun: lint / format / typecheck / test / build）と **Nix**（`nix flake check`）を **並列ジョブ**で実行する。
- CI内のsecretはdotenvx/GitHub Secretsから注入する。
- TursoやOAuth providerを使うE2EはPRではmock/smoke、mainでは実環境寄りなど段階化する。
- Playwright browser install/cacheを考慮する。

具体的な `package.json` scripts、`turbo.json`、GitHub Actions例が必要なときだけ `references/ci-quality.md` を読む。
