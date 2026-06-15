---
name: ci-quality
description: enterprise-agentic-saas-starterのGitHub Actions、CI品質ゲート、oxlint、oxfmt、Vitest、Storybook test runner、Playwright実行、Next build、Turbo tasks、ESLint/Prettier/Jestを入れるべきか判断するときに使う。
---

# CI And Quality

このskillはlint/format/typecheck/test/build/CIを変更するときに使う。

## 方針

- primary lintはoxlint。
- primary formatterはoxfmt。
- Oxlint/Oxfmt configはTS形式（root `oxlint.config.ts` / `oxfmt.config.ts`、package固有 `oxlint.config.ts`）にする。Oxlint TS configの `extends` はパス文字列ではなく、root configをimportしてconfig objectを渡す。
- root `package.json` は `"type": "module"` にし、NodeのTS config ESM読込warningを出さない。
- Oxlint TS configはrootをimportする際、Node ESM loader都合で `.ts` 拡張子を明示する（`import rootConfig from "../../oxlint.config.ts"`）。`tsc --noEmit` がTS5097で落ちないよう、`oxlint.config.ts` を拾うpackage（`include: ["."]` や `**/*.ts` を持つもの）の `tsconfig.json` の `exclude` に `oxlint.config.ts` を加える。
- Oxlint設定はrootに共通・基礎だけを置き、Next/React/Tailwindなどpackage固有設定は各packageからroot configを `extends` して分ける。
- Oxfmt設定はroot一括にする。
- Tailwind v4をOxlintで見る場合は `oxlint-tailwindcss` と `@tailwindcss/node` を一緒に入れる。
- backend/API/DB/Auth packageはReact/Next/Tailwind/jsx-a11y pluginを足さず、server TypeScript向けpluginに寄せる。
- React Email packageはReact componentを書くため `react` / `react-perf` を使うが、Next/Tailwind/browser前提にはしない。
- unit/integrationはVitest。
- UI state、a11y、interactionはStorybook + Storybook test runner。
- browser E2EはPlaywright。
- Next.js buildをCIの品質ゲートに含める。
- GitHub Actionsは堅牢にし、PRで軽量、mainで重めのE2Eを走らせられる構成にする。
- 新規方針としてESLint/Prettier/Jestを増やさない。既存テンプレートからの移行は別作業として扱う。

## 推奨CI順序

```txt
1. bun install --frozen-lockfile
2. oxlint
3. oxfmt --check
4. typecheck
5. vitest
6. storybook build
7. storybook test runner (a11y + interaction)
8. next build
9. playwright smoke/full e2e
```

## Turbo

- root scriptは `turbo <task>` に寄せる。
- cache可能なtaskとpersistentなdev/storybookを分ける。
- `check` はlint/format/typecheck/unit testの集合にする。
- E2Eはbuild済みapp/APIを前提にし、artifactとして `test-results` と `playwright-report` を残す。
- package cwdから `oxfmt .` を走らせるため、ignoreは `.next/**` だけでなく `**/.next/**` のようにmonorepo全体を覆う。

## Bun + Vitest

- Vitestを使うなら `bun run test`。`bun test` はBun自身のtest runnerなので混同しない。
- 新規workspaceにはREADMEとVitest testを必ず置き、root `check` はlint/format/typecheck/testを含める。

## GitHub Actions

- PR では **Quality**（Bun: lint / format / typecheck / test / build）と **Nix**（`nix flake check`）を **並列ジョブ**で実行する。
- CI内のsecretはdotenvx/GitHub Secretsから注入する。
- TursoやOAuth providerを使うE2EはPRではmock/smoke、mainでは実環境寄りなど段階化する。
- Playwright browser install/cacheを考慮する。

具体的な `package.json` scripts、`turbo.json`、GitHub Actions例が必要なときだけ `references/ci-quality.md` を読む。
