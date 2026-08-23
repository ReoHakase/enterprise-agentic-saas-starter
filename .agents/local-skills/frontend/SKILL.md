---
name: frontend
description: enterprise-agentic-saas-starterのNext.js App Router、feature UI、TanStack Query/Form、Jotai、Storybook、accessibility、loading/error boundaryを変更するときに使う。
---

# Frontend

## 必読文書

- [Web設計](../../../docs/architecture/apps/web.md)
- [UI package設計](../../../docs/architecture/packages/ui.md)
- [Webテスト戦略](../../../docs/testing-strategy/apps/web.md)
- [テストケース設計・記述規約](../../../docs/testing-strategy/common/test-case-design.md)
- [Browser test記述規約](../../../docs/testing-strategy/common/browser-test-writing.md)
- [命名とlayer](../../../docs/architecture/naming-and-layers.md)
- observability変更時: [Observability](../../../docs/observability.md)

## Workflow

1. route composition、feature public entrypoint、domain-independent UIのownershipを確認する。
2. server dataはTanStack Query、formはTanStack Form、ephemeral stateだけをJotaiへ置く。
3. browser componentへnamed Storyを追加し、待機経路にはSuspense、Skeleton、Error Boundaryを揃える。
   静的状態へrender assertionだけの`play`を置かず、操作を持つstoryはGiven-When-Thenで記述する。
4. async routeには同じfeature viewを使う`loading.tsx`と`error.tsx`を追加する。
5. component test、Browser Mode、必要なW6 route testの順で検証する。同じcallback mappingをW2とW3で
   再検査せず、focus、keyboard、layout、URLなど各層だけが所有する結果を残す。
6. consoleのaccount menu変更では、保存済みアカウントをメニュー内へ表示する一方で端末から外す操作を公開しない。削除は招待画面の`AccountSwitcherDialog`だけが共有`controller`経由で扱い、未保存作業があるSign outの確認ダイアログはmobile drawer外の`ConsoleShell`が保持していることを確認する。
7. browser telemetryは固定Portless OTLP aliasへ直接送信し、Next.js relay、任意remote endpoint、export requestの再instrumentationを作らない。

## Validation

- `bun run --cwd apps/web lint`
- `bun run --cwd apps/web typecheck`
- `bun run --cwd apps/web test`
- `bun run test:browser`
- route境界変更時: `bun run test:e2e`

## 禁止事項

- API schema/typeをdeep importせず、`@enterprise-agentic-saas/api/client`だけを使う。
- feature間のprivate deep importやsame-feature alias importを作らない。
- persistent navigation/filter stateをlocal stateだけへ閉じない。
- accessibility violation、focused/disabled test、固定sleepでtestを通さない。
