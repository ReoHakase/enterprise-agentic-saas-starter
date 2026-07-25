---
name: shadcn
description: enterprise-agentic-saas-starterでshadcn/ui componentを検索、追加、更新、composeし、packages/uiとWebへ統合するときに使う。
---

# shadcn/ui

## 必読文書

- [UI package設計](../../../docs/architecture/packages/ui.md)
- [Web設計](../../../docs/architecture/apps/web.md)
- [Webテスト戦略](../../../docs/testing/web.md)

## Workflow

1. `components.json`と既存`packages/ui` componentを確認する。
2. `bunx --bun shadcn@latest search`と`docs`で既存componentを優先する。
3. CLIでsourceを追加し、domain-independentなprimitiveだけを`packages/ui`へ置く。
4. semantic token、既存variant、accessibility contractを維持してcomposeする。
5. named Story、interaction、a11y testを追加する。

## Validation

- `bun run --cwd packages/ui lint`
- `bun run --cwd packages/ui typecheck`
- `bun run --cwd packages/ui test`
- `bun run test:browser`

## 禁止事項

- `.agents/skills`やgenerated registry outputを手編集しない。
- domain-specific stateやAPI accessを`packages/ui`へ置かない。
- raw color、manual overlay z-index、semantic HTMLを損なうwrapperで上書きしない。
- browser behaviorをstatic Storyだけで完了扱いにしない。
