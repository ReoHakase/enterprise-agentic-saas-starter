---
title: packages/uiの設計
status: proposed
implementation: planned
last_reviewed: 2026-07-24
applies_to:
  - packages/ui/**
---

# packages/uiの設計

## 責務

Domain-independentなReact DOM primitive、pattern、hook、style、a11y helperを提供します。

## 目標構造

```text
packages/ui/src/
  components/
  patterns/
  hooks/
  lib/
  styles/
  internal/
  test-support/
```

## 依存方向

```text
lib
  <- hooks
  <- components
  <- patterns
```

primitiveからpatternへ依存しません。Next.js、TanStack Query、product feature、API clientをimportしません。

## 公開entrypoint

wildcard exportはpublic surfaceを広げるため、最終的には明示exportへ寄せます。`internal/`はexportしません。

## componentとstory

基本形:

```text
button.tsx
button.test.tsx
button.stories.tsx
```

Storybookでは`light`を全interaction/a11yの標準とし、`dark`はtheme-sensitive storyへ限定します。`dialog`等のstate nameも英語へ統一します。

VRTは現時点で実施しません。

## 受入条件

- domain用語を持つcomponentがない
- Next.js/API/Query importがない
- primitiveからpatternへの逆依存がない
- private helperがpublic exportされない
