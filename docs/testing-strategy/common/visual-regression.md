---
title: 視覚回帰テスト方針
status: proposed
implementation: deferred
last_reviewed: 2026-07-26
applies_to:
  - packages/ui/**
  - apps/web/features/**
related:
  - ./storybook.md
  - ../packages/ui.md
  - ../apps/web.md
---

# 視覚回帰テスト方針

## 状態

視覚回帰テストは方針だけを定義し、実装を延期します。

追加しないもの:

- 全storyのbaseline
- root `test:visual`
- 通常PRでの自動baseline更新
- page全体の無差別screenshot
- 大きなglobal pixel tolerance

先にStorybook state catalogue、interaction、a11y、browser fixtureを安定させます。

## 目的

将来、component単位のlayout、theme、responsive、focus-visible、overflowの視覚的退行を検出します。

視覚回帰テストは次の代わりではありません。

- keyboardとfocusの振る舞い
- accessible nameとARIA
- API通信
- business rule
- authorization
- DB整合性

## 対象

### `packages/ui`

- Button
- Dialog
- Drawer
- Menu、Select、Combobox
- Form control
- Table primitive
- Tooltip
- Skeleton
- focus-visible
- disabled、destructive
- light、dark

### `apps/web`

- Agent approval card
- Agent message、tool trace、source
- Composer
- Thread picker
- Issue detail dialog
- destructive confirmation
- loading、error、empty
- responsive boundary

全storyを対象にしません。利用頻度、変更頻度、視覚的重要性が高く、視覚contractを持つ代表stateだけを選びます。

## 実装方式

- 既存Storybook storyとfixtureを入力にする
- VRT専用のprops、domain fixtureを複製しない
- Vitest Browser Modeのelement screenshotを候補とする
- page全体ではなくcomponent root elementを撮る
- light/darkはtheme-sensitive caseだけを分ける
- baseline更新は専用PRで人間がreviewする

```text
story
  state、interaction、a11y

selected visual test
  同じstory stateのelement screenshot
```

## 不安定さへの対策

固定するもの:

- Linux image
- Chromium version
- font
- locale
- timezone
- viewport
- device scale factor
- clock
- UUID
- random
- network response

実行時に行うこと:

- `document.fonts.ready`を待つ
- animationとcaretを無効化する
- dynamic timestampとrandom IDをmaskする
- external networkを拒否する
- failureをretry成功で隠さない
- developer local OSで作ったbaselineをCIへ混在させない

## 導入条件

次をすべて満たした後に導入します。

- 主要componentにstate catalogueがある
- W3、W4、UI3、UI4が安定している
- a11y testがCIで動作している
- CI browserとfontが固定されている
- baseline ownerとreview手順が決まっている
- baseline update commandが通常runから分離されている
- nightlyでfalse positive率を観測している
- artifact retentionとprivacy policyが決まっている
- VRT対象component listが限定されている

## 受入条件

現段階:

- VRT fileとbaselineが追加されない
- Storybook fixtureが将来再利用できる
- UI test設計がVRT依存にならない
- 導入条件が文書化される

導入後:

- fixed environment
- selected component only
- manual baseline review
- zero automatic baseline update
- no retry masking
