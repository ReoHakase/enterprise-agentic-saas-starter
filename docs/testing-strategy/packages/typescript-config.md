---
title: TypeScript設定パッケージテスト戦略
status: accepted
implementation: active
last_reviewed: 2026-07-26
applies_to:
  - packages/typescript-config/**
---

# TypeScript設定パッケージテスト戦略

## 目的

`packages/typescript-config`はruntime codeを持たず、共有TypeScript設定だけを所有します。そのため、通常の単体テストを増やさず、静的検査と最小fixture compileで保証します。

## コード構造

```text
packages/typescript-config/
  base.json
  bun.json
  cloudflare-worker.json
  react-library.json
  nextjs.json
  package.json
  README.md
  test-fixtures/
    bun/
    cloudflare-worker/
    react-library/
    nextjs/
```

他workspaceへのruntime dependencyを持ちません。

## テスト層

| 名前                                          | Testing Trophy 分類 | テスト内容                                                                                                                                                                                                                                                                                                                                                                        | 実物として使うもの                                     | 差し替えるもの                    | 対象コード/ファイル                                                                  | Test Runner                      | 実行速度   | CI時間課金以外の費用 | 量                                 |
| --------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------- | ---------- | -------------------- | ---------------------------------- |
| **TypeScript設定静的検査 (TS1)**              | 静的                | <ul><li>JSONがparseでき、`extends`先が存在することを確認する</li><li>package exportsと実fileが一致することを確認する</li><li>互いに矛盾するcompiler option、危険なpath、不要なruntime dependencyがないことを確認する</li><li>baseから各runtime設定への継承が意図どおりであることを確認する</li></ul>                                                                              | TypeScript config parser、package manifest、filesystem | なし                              | `packages/typescript-config/*.json`、`package.json`                                  | TypeScript compilerとJSON parser | 極めて速い | なし                 | 全変更                             |
| **TypeScript設定fixtureコンパイル検査 (TS2)** | 静的                | <ul><li>Node/Bun、Cloudflare Worker、React library、Next.jsの最小fixtureが対応configでcompileできることを確認する</li><li>各runtimeで禁止すべきglobalまたはmoduleが誤って利用可能にならないことを確認する</li><li>JSX、module resolution、declaration、path aliasがconsumer側で機能することを確認する</li><li>config変更が既存workspaceの型検査を壊さないことを確認する</li></ul> | `tsc --noEmit`、最小consumer fixture、実shared config  | external package、runtime process | `packages/typescript-config/test-fixtures/**`、全consumer workspaceの`tsconfig.json` | TypeScript compiler              | 速い       | なし                 | 少数のruntime fixture + 全consumer |

## fixture方針

最小fixture例:

```text
test-fixtures/
  bun/
  cloudflare-worker/
  react-library/
  nextjs/
```

fixtureは実product codeを複製せず、設定差を検出する最小コードだけを持ちます。

例:

- Cloudflare Worker fixtureではNode builtinを誤って許可しない
- React library fixtureではJSXとdeclaration出力の型が解決する
- Next.js fixtureではserver/client境界の型が解決する
- Bun fixtureでは必要なBun typeが利用できる

## 実行

```sh
bun --cwd packages/typescript-config run test
bun run typecheck
```

`test`が実質的にconfig validationとfixture `tsc`だけでも、workspaceの共通command surfaceを維持するためpackage scriptを持てます。

## 受入条件

- runtime codeとruntime dependencyを持たない
- 全configのextendsとexportsが解決する
- 各runtimeの最小fixtureがcompileする
- config変更時に全consumer workspaceを型検査する
- 不要な単体テストframeworkを追加しない
