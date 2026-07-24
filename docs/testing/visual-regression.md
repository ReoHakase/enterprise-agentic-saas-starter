---
title: VRT将来方針
status: proposed
implementation: deferred
last_reviewed: 2026-07-24
applies_to:
  - apps/web/**
  - packages/ui/**
---

# VRT将来方針

## 現在の決定

VRTは実施しません。

追加しないもの:

```text
*.visual.test.tsx
test:visual
baseline image
PR required VRT job
```

理由は、OS、font、browser、GPU差によるflakyを先に運用へ持ち込まず、component分割、Storybook、Browser Mode、a11yを安定させるためです。

## 導入条件

- Linux/browser/fontを固定できる
- story fixtureがdeterministic
- animation、clock、randomnessを停止できる
- baseline更新を専用PRへ分離できる
- failed diffを人間が確認できるartifactがある

## 将来の設計

Storybook storyをvisual caseの入力として再利用し、選択したstoryだけをVitest Browser Modeのscreenshotへ送ります。

- `light`を標準
- `dark`はtheme-sensitive caseだけ
- page全体ではなく対象element
- dynamic areaをmask
- baseline自動更新禁止
- nightly/manualから開始

## 受入条件

現在のrepositoryにVRT script、test file、baselineが存在しないこと。
