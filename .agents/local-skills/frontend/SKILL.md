---
name: frontend
description: enterprise-agentic-saas-starterのTanStack Start、TanStack Router、feature UI、TanStack Query/Form、Jotai、Storybook、accessibility、loading/error boundaryを変更するときに使う。
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

1. `src/routes/**`のルート合成、機能の公開入口、ドメイン非依存UIの所有権を確認する。
2. サーバーデータはTanStack Query、フォームはTanStack Form、再取得しない一時状態だけをJotaiへ置く。
   ルーターごとに`QueryClient`を作り、初期取得は`loader`と`createServerFn`を使って
   `ensureQueryData`へ接続する。手書きの復元処理とリクエストをまたぐキャッシュを作らない。
3. browser componentへnamed Storyを追加し、待機経路にはSuspense、Skeleton、Error Boundaryを揃える。
   静的状態へrender assertionだけの`play`を置かず、操作を持つstoryはGiven-When-Thenで記述する。
4. 非同期`loader`を持つルートには同じ機能の表示を使う`pendingComponent`、`errorComponent`、
   必要な`notFoundComponent`を設定する。
5. component test、Browser Mode、必要なW6 route testの順で検証する。同じcallback mappingをW2とW3で
   再検査せず、focus、keyboard、layout、URLなど各層だけが所有する結果を残す。
6. consoleのaccount menu変更では、保存済みアカウントをメニュー内へ表示する一方で端末から外す操作を公開しない。削除は招待画面の`AccountSwitcherDialog`だけが共有`controller`経由で扱い、未保存作業があるSign outの確認ダイアログはmobile drawer外の`ConsoleShell`が保持していることを確認する。
7. ブラウザーのテレメトリーは固定Portless OTLP aliasへ直接送信し、Web Workerの中継ルート、任意の
   外部送信先、送信リクエストの再計測を作らない。

## Validation

- `bun run --cwd apps/web lint`
- `bun run --cwd apps/web typecheck`
- `bun run --cwd apps/web test`
- `bun run test:browser`
- Web、API、Authの最終配線変更時: `bun run test:e2e`
- Worker、Vite設定変更時: `bun run build:cloudflare`

## 禁止事項

- API schema/typeをdeep importせず、`@enterprise-agentic-saas/api/client`だけを使う。
- feature間のprivate deep importやsame-feature alias importを作らない。
- persistent navigation/filter stateをlocal stateだけへ閉じない。
- `QueryClient`、セッション、Cookie、テナント状態をモジュール全体で共有しない。
- 認証付き画像をUnpicまたは公開画像の最適化経路へ渡さない。
- accessibility violation、focused/disabled test、固定sleepでtestを通さない。
