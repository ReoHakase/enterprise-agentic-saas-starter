---
title: packages/typescript-configの設計
status: proposed
implementation: planned
last_reviewed: 2026-07-24
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

- `base.json`へ全runtime共通のstrict option
- runtime固有のlib、module、JSXは派生config
- app固有のpath aliasやincludeは各workspace
- Oxlint、Oxfmt、test configを混ぜない

## 受入条件

- runtime sourceがない
- package dependencyがない
- app固有pathが共有configへ入らない
