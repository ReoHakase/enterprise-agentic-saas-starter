---
title: packages/uiの設計
status: accepted
implementation: active
last_reviewed: 2026-09-05
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
    <component>/
      <component>.tsx
      <component>.test.tsx
      <component>.stories.tsx
  hooks/
  lib/
  styles/
```

## 依存方向

```text
複合component
  -> components
  -> hooks
  -> lib
```

矢印は`importer -> dependency`です。複合componentはcomponent/hook/lib、componentはhook/lib、hookはlibを
importできます。primitiveから複合component、hookからcomponent、libからReact layerへの
逆依存は禁止します。TanStack Start、TanStack Router、TanStack Query、product feature、API client、
server-only module、Node builtin、app alias、domain typeをimportしません。test/storyだけで使うfixtureは
production exportへ含めません。

## 公開entrypoint

wildcard exportはpublic surfaceを広げるため、明示exportを使います。test/story fixtureはexportしません。

## componentとstory

基本形:

```text
button/
  button.tsx
  button.test.tsx
  button.stories.tsx
```

componentはfile数にかかわらず常にdirectoryへ置きます。既存の公開subpathは
`package.json#exports`の参照先だけを変更し、consumer APIを維持します。

複数directoryの公開componentを組み合わせるStorybook専用の利用例だけは、
`src/components/*.stories.tsx`へ置けます。この例外は本番componentへ適用せず、各公開componentが
所有directory内に持つ同居storyも省略しません。

`packages/ui/src/**`でbrowserからimport可能なpublic componentと主要patternは、実componentを
`component`または`render`で描画する近接配置のstoryを持ちます。primitive、provider、portal、
skeleton、error viewもpublic contractを持つ場合は対象です。type-only file、hook/lib、
test-support、generated fileはcomponentではないため対象外です。

空storyや別のtest doubleだけを描画するstoryはreviewで拒否します。技術的にimport不能なcomponentは
browser非依存のviewを抽出します。
例外はexact path、理由、責任者、削除条件を持つ場合だけ許可し、directory単位では除外しません。
一つのsource moduleが複数componentをexportする場合や、関連stateをまとめる場合はstory fileを
共有できます。public componentと主要patternは少なくとも一つのnamed storyで実際に描画し、
Storybook/Browser Modeで登録済みstoryを検証します。親からしか使わないprivate subcomponentは、
publicな親story内で実物が描画・操作される場合に個別storyを要求しません。repo全体のcoverage
checkerやcomponentとstoryの対応manifestは持ちません。新しいpublic componentとstoryは同じ変更で
reviewします。同じcomponentの複数state storyは許可します。

Storybookでは`light`を全interaction/a11yの標準とし、`dark`はtheme-sensitive storyへ限定します。
`dialog`等のstate nameも英語へ統一します。

VRTは現時点で実施しません。

## 受入条件

- domain用語を持つcomponentがない
- TanStack Start、TanStack Router、API、Queryのimportがない
- primitiveから複合componentへの逆依存がない
- private helperがpublic exportされない
- public componentと主要patternに実componentを描画するstoryがある
