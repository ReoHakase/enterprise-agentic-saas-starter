---
title: 静的検査仕様
status: accepted
implementation: active
last_reviewed: 2026-07-26
applies_to:
  - apps/**
  - packages/**
  - config/**
  - scripts/**
  - package.json
  - turbo.json
  - .github/workflows/**
---

# 静的検査仕様

## 目的

静的検査はTesting Trophyの土台です。コードを実行せずに検出できる不具合を、単体テストや統合テストへ持ち込みません。

静的検査はワークスペース固有のテスト層より先に実行し、全変更へ適用します。

## 共通静的検査

| 名前                  | Testing Trophy 分類 | テスト内容                                                                                                                                                                                                                                                                                                                                                                                                                                          | 実物として使うもの                                                                              | 差し替えるもの | 対象コード/ファイル                                                                                                                 | Test Runner                                        | 実行速度           | CI時間課金以外の費用 | 量               |
| --------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------ | -------------------- | ---------------- |
| **共通静的検査 (S0)** | 静的                | <ul><li>TypeScriptの型が全公開入口と内部importで整合することを確認する</li><li>OxlintとOxfmtで構文、品質、未使用、複雑度、危険なpatternを検出する</li><li>workspace間の依存方向と公開されていないdeep importを拒否する</li><li>Knipで未使用file、export、dependency、unlisted dependencyを検出する</li><li>生成物、OpenAPI、schema、migrationの差分漏れを検出する</li><li>test-only codeがproduction entrypointへ到達しないことを確認する</li></ul> | TypeScript compiler、Oxlint、Oxfmt、Knip、workspace manifest、package exports、生成済みartifact | なし           | `**/*.{ts,tsx,mts,cts}`、各`package.json`、`tsconfig*.json`、`turbo.json`、`wrangler*.jsonc`、`.storybook/**`、`drizzle/**`、生成物 | `tsc`、Oxlint、Oxfmt、Knip、build、package所有test | 極めて速いから速い | なし                 | 全対象へ常時適用 |

## 必須検査

### 型検査

- 各workspaceは自身の`tsconfig.json`で型検査する
- rootはTurborepo経由で全対象workspaceを実行する
- story、test、fixture、MSW handlerを型検査対象から除外しない
- `packages/ui`のpublic exportと`apps/web`のconsumer typeを同時に検証する
- Eden由来のresponse型とMSW fixtureを`satisfies`で検証する

### import境界

- `packages/* -> apps/*`を禁止する
- WebはAPI client、Auth client、UIの公開入口だけを使う
- Agentはprivate API control-plane clientだけを使う
- APIはUI、Web、Agent runtimeへ依存しない
- API routeからrepositoryを直接importしない
- Web model、API domain、Agent coreはframeworkまたはprovider SDKへ依存しない
- 別feature、別module、別workspaceは公開入口だけを使う
- 同一featureまたはmodule内部は相対importを使う

### package内部境界

- UIの`lib`はReact、component、patternへ依存しない
- UIの`hooks`はcomponent、patternへ依存しない
- UIの`components`はapplication-specific patternへ依存しない
- DB schemaはconnection、seed、test-supportへ依存しない
- Email contractはReact Emailとproviderへ依存しない
- Email templateはprovider、DB、Auth、UIへ依存しない
- Auth browser clientはDB、Email、Node builtin、server implementationへ依存しない
- Agent tool executorはMastra、provider SDK、telemetry adapterへ依存しない

### 生成物と履歴

- Drizzle schema変更に対応するmigration、snapshot、journalが存在する
- base branchに存在したmigration SQLとsnapshotを変更または削除しない
- OpenAPIまたは生成型が正本と同期する
- generated sourceを手動編集しない
- Storybook static build、MSW worker、public artifactの生成漏れを検出する

## 実装方針

境界はpackage exports、TypeScript、Oxlint、Knip、build、package所有testで強制します。repository専用のarchitecture checkerまたは`check:structure`は追加しません。

例外は次をすべて持つ必要があります。

- 対象fileが限定されている
- 対象ruleが限定されている
- 理由が記載されている
- 削除条件またはissueがある

workspace全体のwildcard除外は許可しません。

## 実行

```sh
bun run lint
bun run format:check
bun run typecheck
bun --cwd packages/db run db:check
```

`bun run check`は上記と`bun run test`をまとめます。
