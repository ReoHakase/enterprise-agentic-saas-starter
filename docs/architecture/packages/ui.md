---
title: packages/uiの設計
status: accepted
implementation: active
last_reviewed: 2026-07-25
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

`packages/ui/src/**`でbrowserからimport可能な全React componentは、public exportか内部componentかを
問わず、実componentを`component`または`render`で描画する近接配置のstoryを持ちます。primitive、
provider、
portal、skeleton、error viewも対象です。type-only file、hook/lib、test-support、generated fileは
componentではないため対象外です。

空storyや別のtest doubleだけを描画するstoryはreviewで拒否します。技術的にimport不能なcomponentは
browser非依存のviewを抽出します。
例外はexact path、理由、責任者、削除条件を持つ場合だけ許可し、directory単位では除外しません。
一つのsource moduleが複数componentをexportする場合や、関連stateをまとめる場合はstory fileを
共有できます。browserからimportできる各componentは少なくとも一つのnamed storyで実際に描画し、
Storybook/Browser Modeで登録済みstoryを検証します。repo全体のcoverage checkerやcomponentとstoryの
対応manifestは持ちません。新しいcomponentとstoryは同じ変更でreviewします。
同じcomponentの
複数state storyは許可します。cross-module integration storyだけでは個別componentのcoverageを
代用しません。

Storybookでは`light`を全interaction/a11yの標準とし、`dark`はtheme-sensitive storyへ限定します。
`dialog`等のstate nameも英語へ統一します。

VRTは現時点で実施しません。

## 受入条件

- domain用語を持つcomponentがない
- Next.js/API/Query importがない
- primitiveからpatternへの逆依存がない
- private helperがpublic exportされない
- browserからimportできる全componentに実componentを描画するstoryがある
