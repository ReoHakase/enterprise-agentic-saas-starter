# @enterprise-agentic-saas/ui

shadcn/uiのBase UI実装、共通スタイル、hookを提供するReact DOMパッケージです。TanStack Startのルート構成や機能固有のデータ取得は置きません。

## Entrypoints

```tsx
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import "@enterprise-agentic-saas/ui/globals.css"
```

新しいcomponentはrootからweb app configを対象に追加します。

```sh
bunx --bun shadcn@latest add button -c apps/web
```

Base UIを標準とし、iconはdecorativeなら `aria-hidden`、icon-only actionならaccessible nameを必須にします。

## Storybookとtest

```sh
bun run --cwd packages/ui storybook
bun run --cwd packages/ui test
bun run --cwd packages/ui build:storybook
bun run --cwd packages/ui test:browser
```

- component interactionはTesting Libraryまたはstoryの `play` で検証する。
- Storybook Vitest browser testはlight/dark両方を実行する。
- a11y violationはwarningではなくtest failureにする。
- TanStack Start固有の構成は`apps/web`側でテストする。
