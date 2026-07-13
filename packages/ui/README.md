# @enterprise-agentic-saas/ui

shadcn/uiのBase UI実装、共通style、hookを提供するReact DOM packageです。Next.js page/layoutやfeature data fetchingは置きません。

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
bun run --cwd packages/ui test:storybook
```

- component interactionはTesting Libraryまたはstoryの `play` で検証する。
- Storybook Vitest browser testはlight/dark両方を実行する。
- a11y violationはwarningではなくtest failureにする。
- Next.jsを必要とするcompositionは `apps/web` 側でtestする。
