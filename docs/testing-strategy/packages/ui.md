---
title: UIパッケージテスト戦略
status: accepted
implementation: active
last_reviewed: 2026-07-26
applies_to:
  - packages/ui/**
related:
  - ../common/storybook.md
  - ../common/visual-regression.md
  - ../apps/web.md
---

# UIパッケージテスト戦略

## 目的

`packages/ui`は、domain非依存のReact DOM primitive、domain非依存pattern、generic hook、style、token、Storybookを所有します。

Issue、Organization、Product Agentなどのdomain concept、API client、React Query、Next.js route、auth session、tenant logicを持ち込みません。これらを必要とするcomponentは`apps/web/src/features`が所有します。

## コード構造との対応

```text
packages/ui/src/
  components/
    button/
      button.tsx
      button.test.tsx
      button.stories.tsx

  hooks/
  lib/
  styles/
```

全componentはfile数にかかわらずdirectoryへ置きます。既存の公開subpathは`package.json#exports`の参照先だけを変更し、consumerのimportは維持します。

内部依存方向:

```text
lib
  → React、componentへ依存しない

hooks
  → lib
  → componentへ依存しない

components
  → lib、hooks、style
  → primitiveは複合componentへ依存しない

複合component
  → components、hooks、lib
```

## テスト層

| 名前                                         | Testing Trophy 分類 | テスト内容                                                                                                                                                                                                                                                                                                                                                                              | 実物として使うもの                                                 | 差し替えるもの                                        | 対象コード/ファイル                                                      | Test Runner                                     | 実行速度   | CI時間課金以外の費用 | 量             |
| -------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------- | ---------- | -------------------- | -------------- |
| **UIユーティリティ単体テスト (UI1)**         | 単体                | <ul><li>class merge、variant selection、ID、format、pure hook stateを確認する</li><li>token名、size、orientation、disabled ruleなどcomponent非依存の変換を確認する</li><li>Reactをrenderせず、入力と出力の境界値を確認する</li></ul>                                                                                                                                                    | pure utility、variant factory、framework非依存hook logic           | clock、ID、random                                     | `packages/ui/src/lib/**`、pure hook helper、variant/config function      | Vitest Node                                     | 極めて速い | なし                 | 多い           |
| **UI DOMコンポーネント統合テスト (UI2)**     | 統合                | <ul><li>public props、children、callbackから期待するDOMとeventが得られることを確認する</li><li>label、role、accessible name、ARIA relation、disabled、requiredを確認する</li><li>controlled/uncontrolled input、form association、error descriptionを確認する</li><li>browser layoutまたはnative focusが不要な振る舞いを高速に確認する</li></ul>                                        | React component、Testing Library、happy-dom、UI primitive          | clock、portal container、必要なbrowser API shim       | `packages/ui/src/components/**/*.test.tsx`、`hooks/**/*.test.tsx`        | Vitest + Testing Library + happy-dom            | 速い       | なし                 | 厚くする       |
| **UI Storybookブラウザー統合テスト (UI3)**   | 統合                | <ul><li>public componentのvariant、size、disabled、destructive、loading、long contentを実browserで描画する</li><li>keyboard、focus-visible、focus return、dialog、menu、popoverを確認する</li><li>Controlsでpublic propsを探索できることを確認する</li><li>`play`で代表操作と利用者から観測できる結果を確認する</li><li>a11y addonでrendered DOMを検査する</li></ul>                    | `@storybook/react-vite`、実Chromium、React、CSS、theme、a11y addon | props、callback、locale、theme。networkは原則使わない | `packages/ui/src/**/*.stories.tsx`、`packages/ui/.storybook/**`          | Storybook Vitest addon + Chromium               | 中         | なし                 | 多い           |
| **UI複合パターンブラウザー統合テスト (UI4)** | 統合                | <ul><li>複数primitiveを組み合わせたdialog、drawer、menu、combobox、form patternを確認する</li><li>portal、focus trap、roving tabindex、outside click、Escape、scroll lockを確認する</li><li>複数component間のstateとcallbackの協調を確認する</li><li>単一componentを含む操作のないgeometryとnative renderingは、named storyのfixtureを再利用する`.browser.test.tsx`で確認する</li></ul> | 実browser、UI component、portal、CSS、browser API                  | application state、API、QueryClient、auth、tenant     | `packages/ui/src/components/**`のcomponent、限定的な`*.browser.test.tsx` | Vitest Browser ModeまたはStorybook Vitest addon | 中から遅い | なし                 | 必要な範囲     |
| **UI選択的視覚回帰テスト (UI5)**             | 統合                | <ul><li>視覚contractを持つ代表storyだけをelement screenshotで比較する</li><li>light/dark、responsive、focus-visible、destructive状態の視覚的退行を検出する</li><li>interaction、a11y、business ruleの代わりにはしない</li><li>固定Linux、Chromium、font、locale、clock、animation設定で実行する</li></ul>                                                                               | 実Chromium、固定font、既存story fixture、screenshot baseline       | network、clock、random、animation、dynamic content    | 選択された`packages/ui/src/**/*.stories.tsx`、将来の`*.visual.test.tsx`  | Vitest Browser Mode `toMatchScreenshot`候補     | 遅い       | なし                 | 最小、導入延期 |

## UI1: UIユーティリティ単体テスト

UI1へ置くのは、React renderを必要としない処理です。

- class/variant mapping
- size normalisation
- orientation decision
- token name validation
- generic state reducer
- controlled/uncontrolled helper

componentをrenderして初めて意味を持つものをUI1へ分解しすぎません。

## UI2: UI DOMコンポーネント統合テスト

UI2は日常的なcomponent回帰の中心です。Testing Trophy上は、React、DOM、child、eventを接続するため統合テストです。

UI2へ置くもの:

- props projection
- callback
- form integration
- ARIA relation
- safe fallback
- controlled input
- simple open/close state

UI3/UI4へ上げるもの:

- native focus
- portal
- pointer event
- CSS visibility
- browser selection
- scroll lock
- keyboard navigationがbrowser implementationへ依存するもの

## UI3: UI Storybookブラウザー統合テスト

原則としてstoryを作る対象:

- public exportされるcomponent
- public pattern
- focus、keyboard contractを持つcomponent
- visual variantを持つcomponent
- disabled、destructive、loading、error stateを持つcomponent

private implementation detailには単独storyを作らず、public parent storyに含めます。

`packages/ui`ではMSWを原則使いません。MSW、Eden、QueryClient、tenant fixtureが必要になった場合は、componentの所有場所が`apps/web`ではないかを見直します。

## UI4: UI複合パターンブラウザー統合テスト

UI4はUI package内の複数primitive協調に加え、単一componentを含む操作のないgeometryとnative renderingを所有します。後者はnamed storyの`args`、decorator、fixtureを再利用する`.browser.test.tsx`で検査し、render assertionだけの`play`へ置きません。

対象例:

- dialog + form + validation message
- combobox + listbox + keyboard
- dropdown menu + roving focus
- drawer + overlay + scroll lock
- tooltip + hover/focus
- data table primitive + selection

Issue tableやOrganization switcherなどdomain-specificなcompositionはWeb W4です。

## UI5: UI選択的視覚回帰テスト

UI5は現在導入延期です。先にUI3、UI4、a11yを安定させます。

導入条件:

- 主要public componentにstate catalogueがある
- browser interactionが安定している
- CI image、browser、fontが固定されている
- baseline review ownerが決まっている
- baseline更新を専用PRにできる
- false positive率をnightlyで確認している

全storyをVRT対象にしません。

## Storybook構成

詳細は[Storybookとブラウザーコンポーネントテスト仕様](../common/storybook.md)を参照します。

UI package固有の要点:

- `@storybook/react-vite`
- CSF Next
- Controlsはpublic propsだけ
- lightで全interactionとa11y
- darkはtheme-sensitive storyだけ
- networkなし
- app providerなし
- package内fixtureだけを使う

## Webとの責務分担

| 対象                                           | 所有者       |
| ---------------------------------------------- | ------------ |
| Button、Dialog、Drawer、Menu、Form control     | UI package   |
| generic table、generic empty state pattern     | UI package   |
| IssueCard、OrganizationSwitcher、AgentMessage  | Web          |
| QueryClient、MSW、useChatを含むfeature         | Web W4       |
| Next.js route、RSC、middleware                 | Web W5/W6    |
| package componentをfeatureで正しく組み合わせる | Web W2からW4 |

Web側でUI primitiveの全variantを再検査しません。featureに必要な代表compositionだけを確認します。

## 実行

```json
{
  "scripts": {
    "test": "vitest run --config ../../vitest.config.ts --project=ui-unit",
    "test:browser": "vitest run --config ../../vitest.config.ts --project=ui-storybook-light && vitest run --config ../../vitest.config.ts --project=ui-storybook-dark && vitest run --config ../../vitest.config.ts --project=ui-browser"
  }
}
```

## 受入条件

- UI packageがdomain、API、Query、Auth、tenantへ依存しない
- UI2が日常的なcomponent testの中心である
- public componentに必要なstoryがある
- focus、keyboard、portalを実browserで検査する
- MSWをUI packageへ常用しない
- UI4がdomain-specific featureへ拡大しない
- UI5が導入条件を満たすまで延期される
