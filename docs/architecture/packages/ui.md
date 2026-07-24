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
patterns
  -> components
  -> hooks
  -> lib
```

矢印は`importer -> dependency`です。patternはcomponent/hook/lib、componentはhook/lib、hookはlibを
importできます。primitive/componentからpattern、hookからcomponent/pattern、libからReact layerへの
逆依存は禁止します。Next.js、TanStack Query、product feature、API client、server-only module、
Node builtin、app alias、domain typeをimportしません。test/storyだけで使うfixtureはproduction
exportへ含めません。

## 公開entrypoint

wildcard exportはpublic surfaceを広げるため、明示exportへ移行します。`internal/`と
`test-support/`はexportしません。

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
