---
title: packages/typescript-configの設計
status: accepted
implementation: active
last_reviewed: 2026-07-25
applies_to:
  - packages/typescript-config/**
---

# packages/typescript-configの設計

## 責務

TypeScript compiler optionだけを提供します。runtime codeとdependencyを持ちません。

## 目標構造

```text
packages/typescript-config/
  base.json
  bun.json
  cloudflare-worker.json
  react-library.json
  nextjs.json
  package.json
  README.md
```

## 原則

- `base.json`: 全runtime共通のstrict option。DOM/Node/Worker固有型を入れない
- `bun.json`: Bun/Node系scriptとpackage
- `cloudflare-worker.json`: Web Worker libとCloudflare runtime
- `react-library.json`: React DOM libraryとdeclaration生成
- `nextjs.json`: Next.js App RouterとJSX/plugin
- app固有のpath aliasやincludeは各workspace
- Oxlint、Oxfmt、test configを混ぜない
- runtime source、test support、postinstall scriptを持たない
- dependenciesを持たず、利用workspaceが必要な型/runtimeを自分で宣言する

## 受入条件

- runtime sourceがない
- package dependencyがない
- app固有pathが共有configへ入らない
