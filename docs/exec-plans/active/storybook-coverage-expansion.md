---
id: PLAN-2026-008
title: Storybookカバレッジ全面拡充
status: active
created: 2026-07-26
owners:
  - repository-maintainers
linked_specs:
  - ../../testing-strategy/common/storybook.md
  - ../../testing-strategy/apps/web.md
---

# Storybookカバレッジ全面拡充

## 目的

`packages/ui`の全公開コンポーネントとWebの公開コンポーネント、主要`View`へ、実コンポーネントを
描画するCSF Nextのstoryと決定的な`play`を追加する。Webのドメイン固有コンポーネントを対応する
`features/`へ移し、現在有効なarchitectureとStorybookの配置を一致させる。

## 対象外

- 視覚回帰テストの実装
- Browser Modeカバレッジ閾値の追加
- 新しいnpm scriptまたはリポジトリ専用architecture checkerの追加
- 本番deploy、Git push、有料テストの実行

## 開始時点

| 対象          | story file | named story | `play` | 補足                                      |
| ------------- | ---------- | ----------- | ------ | ----------------------------------------- |
| `packages/ui` | 6          | 17          | 12     | 34公開コンポーネント中31件に同居storyなし |
| `apps/web`    | 16         | 87          | 6      | 大型カタログへstoryと状態が集中           |

開始時のBrowser Modeカバレッジは診断値として扱い、最終実測値との比較だけを記録する。数値を満たすための
空storyや操作を伴わない重複storyは作らない。

## 配置と所有権

- UIの単体storyは`components/<name>/<name>.stories.tsx`へ置く
- 複数コンポーネントを組み合わせた利用例だけは`packages/ui/src/components/*.stories.tsx`へ置く
- Webの認証、Agent message、Issue dashboard、組織identity、console固有コンポーネントを対応する
  `features/`へ移す
- 別機能から利用するWebコンポーネントは`features/<feature>/index.ts`からだけ公開する
- story専用フィクスチャは本番公開面へ含めない

## 状態と操作

UIは入力、overlay、表示、navigation、画像の各公開コンポーネントについて、意味のある通常、入力済み、
不正、無効、空、読み込み中、破壊的操作、mobile、長文、横溢れ状態を持つ。Webは各主要`View`について
loading、empty、error、ready、pending、権限不足、再試行、承認、tool実行、upload失敗を該当範囲で持つ。

対話可能な公開コンポーネントと主要`View`には、ARIA roleとnameを使い、click、keyboard、
フォーカス移動、フォーカス復帰、validation、retryまたは承認結果を確認する`play`を最低1件置く。
非公開コンポーネントは親storyで実物を描画し、操作と結果から到達する。

## 進捗

- [x] 開始時のstory数、`play`数、公開コンポーネント数を記録した
- [ ] StorybookとUI architectureへ複数コンポーネントstoryの配置規則を反映する
- [ ] Webのドメイン固有コンポーネントを対応する`features/`へ移す
- [ ] UIの34公開コンポーネントへ同居storyを追加する
- [ ] UIの複数コンポーネント利用例を4件追加する
- [ ] WebのAuthとAgent storyを拡充する
- [ ] Webの残りの主要`View`と共有コンポーネントstoryを拡充する
- [ ] Storybookの`QueryClient`をstoryごとに分離する
- [ ] 全検証とBrowser Modeカバレッジ比較を記録する

## 検証

- `bun run --cwd packages/ui lint`
- `bun run --cwd packages/ui typecheck`
- `bun run --cwd packages/ui test`
- `bun run --cwd packages/ui test:browser`
- `bun run --cwd packages/ui build:storybook`
- `bun run --cwd apps/web lint`
- `bun run --cwd apps/web typecheck`
- `bun run --cwd apps/web test`
- `bun run --cwd apps/web test:browser`
- `bun run --cwd apps/web build:storybook`
- `bun run check`
- `bun run test`
- `bun run test:browser`
- `bun run build:storybook`
- `BROWSER_COVERAGE=1 bun run test:browser`

## 完了条件

- UIの34公開コンポーネント全てに同居するnamed storyがある
- Webの公開コンポーネントと主要`View`にnamed storyがある
- 対話可能な対象に決定的な`play`がある
- 旧大型カタログstoryが残らない
- UI packageの公開subpathと利用者APIが変わらない
- 新しいnpm script、Browser Modeカバレッジ閾値、architecture checkerが増えていない
- 実行計画を`completed/`へ移し、検証結果を記録する
