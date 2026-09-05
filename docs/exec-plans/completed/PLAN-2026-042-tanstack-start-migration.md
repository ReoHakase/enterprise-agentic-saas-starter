---
id: PLAN-2026-042
title: WebのTanStack Start移行とCloudflare Workers・Vite HMR標準化
status: completed
created: 2026-09-05
owners:
  - Codex
linked_specs:
  - docs/architecture/apps/web.md
  - docs/architecture/system-boundaries.md
  - docs/testing-strategy/apps/web.md
  - docs/local-development.md
  - docs/deployment-operations.md
linked_adrs: []
---

# WebのTanStack Start移行とCloudflare Workers・Vite HMR標準化

## 目的

`apps/web`をNext.jsとOpenNextからTanStack Start、TanStack Router、Vite、Cloudflare Vite pluginへ
移行する。公開URL、認証、OAuth、テナント境界、検索、文書、可観測性を維持し、ローカル開発と
Cloudflare Workersの実行モデルを同じVite構成へ統一する。

## 対象外

- `apps/emulate`のNext.js利用
- Remote databaseやCloudflare resourceの変更、本番配備
- Draft解除、review依頼、merge
- 有料Agent評価と`test:e2e:full`
- TanStack Startの実験的React Server Components

## 関連仕様とADR

- GitHub Issue #42
- `docs/architecture/apps/web.md`
- `docs/architecture/system-boundaries.md`
- `docs/testing-strategy/apps/web.md`
- `docs/local-development.md`
- `docs/deployment-operations.md`

## 前提条件

- Issue #42の`blocked by`は全て完了し、同じbranchを所有する未完了PRは存在しない。
- 実装基点は`origin/main`の`3aa43d3dee9b162a57b5017178633c7d02a952b5`とする。
- QueryClient、session、cookie、API clientをmodule-globalなrequest状態として共有しない。
- API Workerが認証callbackとauthorizationを所有し、Webへ同じendpointを複製しない。
- private画像は既存の認証付き取得経路を維持し、外部画像最適化へ渡さない。

## 変更対象path

- `apps/web/**`
- `packages/portless-topology/**`
- `.github/workflows/{ci,deploy}.yml`
- `package.json`、`bun.lock`、`turbo.json`、`knip.config.ts`、`oxlint.config.ts`
- `docs/architecture/**`、`docs/testing-strategy/**`
- `docs/{local-development,deployment-operations,observability,auth-tenancy-security,file-storage-r2}.md`
- `.agents/local-skills/{frontend,e2e-test}/SKILL.md`

## 作業単位

1. 移行前のHMR、route、redirect、認証、Query、Workers、CI契約を固定する。
2. TanStack Start、Router、Query SSR、Vite、Cloudflare Vite pluginの基盤を追加する。
3. requestごとのsession・tenant contextを保ったloader/server functionへconsole routeを移行する。
4. auth、OAuth、invitation、docs、search、LLM text endpointとmetadataをfile routeへ移行する。
5. Next.js navigation、画像、font、instrumentation依存を標準APIへ置換する。
6. Portless、Storybook、Playwright、W6、CI、Workers build/deploy設定をViteへ統一する。
7. 現在構成の正本文書とrepo-local skillを更新する。
8. 決定的な検査、無料browser/E2E、Cloudflare dry-run、HMR再計測、差分reviewを完了する。

## 進捗

- [x] Issue、blocker、parent、Assignee、linked branch、競合PR、最新mainを確認した
- [x] 移行前のroute、auth、Query、画像、tooling、CI契約を調査した
- [x] 移行前HMRを同じPortless URLとbrowserでwarm-up後各20回計測した
- [x] TanStack Startとrequest-scope基盤を実装した
- [x] 全routeとserver endpointを移行した
- [x] Workers、Vite、Portless、Storybook、Playwright、CIを統一した
- [x] 正本文書とrepo-local skillを更新した
- [x] 必須検査と移行後HMR計測を完了した
- [x] 現在の差分をreviewし、P0/P1と必須検査失敗を解消した

## 判断記録

| 日付       | 判断                                                                          | 理由                                                                                     |
| ---------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 2026-09-05 | TanStack Start `1.168.49`とRouter `1.170.32`を組み合わせる                    | Startの直接依存とRouterを一致させ、Vite 8とReact 19を維持するため                        |
| 2026-09-05 | `@tanstack/react-router-ssr-query`でrequestごとにQueryClientを作る            | 手書きhydrate処理を除き、request間のcookieとcache混線を防ぐため                          |
| 2026-09-05 | Cloudflare Vite pluginの`ssr` environmentを唯一のdev/build/preview経路にする  | localとWorkersのruntime差を減らし、Vite HMRを直接使うため                                |
| 2026-09-05 | ViteからWorkerへ渡す環境変数をAPI origin、local telemetry、test判定に限定する | 親processのsecretを取り込まず、Workersの`process.env`からdeployment-scopedな値を読むため |
| 2026-09-05 | Fumadocsは現行versionを維持する                                               | 既存Orama検索とMDX contractを変えないため                                                |
| 2026-09-05 | Next catalogとpatchは削除しない                                               | 対象外の`apps/emulate`が引き続きNext.jsを使用するため                                    |
| 2026-09-05 | WebのOpenNext cache bindingだけを外し、remote resourceは削除しない            | runtime移行と外部破壊操作を分離するため                                                  |
| 2026-09-05 | Tailwind CSSは公式`@tailwindcss/vite` pluginをWebとbrowser testで共用する     | PostCSS設定を残さず、productionとcomponent testで同じ変換経路を使うため                  |
| 2026-09-05 | macOSのVite watcherはpollingを使わず、`fsevents`だけを無効化する              | `EMFILE`を避けながらnative watcherと細粒度HMRを維持するため                              |
| 2026-09-05 | root Vitestは指定されたbrowser projectだけを読み込む                          | WebとUIのplugin・alias・Storybook設定を互いのtest scopeへ混在させないため                |
| 2026-09-05 | global function middlewareで生エラーを固定5xxへ変換し、CSRF保護を明示する     | frameworkのconsole・直列化へ原因を渡さず、`src/start.ts`追加前の暗黙保護も維持するため   |
| 2026-09-05 | Cloudflare標準観測でもWeb requestのqueryを除去する                            | アプリOTelを迂回するInvocation LogsへOAuth署名やserver function payloadを残さないため    |

## 検証証跡

| commandまたは操作                             | 結果        | 証跡                                                                                  |
| --------------------------------------------- | ----------- | ------------------------------------------------------------------------------------- |
| GitHub GraphQLと`git ls-remote`               | 成功        | blocker 20件完了、競合PRなし、基点SHAを確認                                           |
| 移行前 leaf HMR                               | 成功        | 20回、p50 147.6ms、p95 155.9ms、full reload 0、入力保持                               |
| 移行前 route HMR                              | 不安定      | 20回、p50 178.3ms、p95 5,000ms、HMR miss 6回                                          |
| 移行前 shared UI HMR                          | full reload | 20回、p50 387.8ms、p95 406.5ms、40 beforeunload、入力消失                             |
| 移行後 leaf HMR                               | 成功        | 20回、p50 69.0ms、p95 74.7ms、miss/full reload 0、入力保持                            |
| 移行後 route HMR                              | 成功        | 20回、p50 103.9ms、p95 111.9ms、miss/full reload 0、入力保持                          |
| 移行後 shared UI HMR                          | 成功        | 20回、p50 65.8ms、p95 93.5ms、miss/full reload 0、入力保持                            |
| sibling atomic renameと未知のTailwind utility | 成功        | いずれもHMRで反映し、full reload 0、入力保持                                          |
| `bun install --frozen-lockfile`               | 成功        | catalogとlockfileの整合を確認                                                         |
| root Oxlint `--print-config`とWeb lint        | 成功        | Router/Query pluginとerror規則を確認。Next.js規則なし、`--deny-warnings`成功          |
| `bun run check`                               | 成功        | lint、Knip full/strict、jscpd、format、全typecheck、unit/integration                  |
| `bun run test:browser`                        | 成功        | UI/Web Storybook、Browser Mode、TanStack Start Chromium 49件、WebKit代表経路1件       |
| `bun run test:e2e`                            | 成功        | 無料の認証・Agent・MCP OAuth E2E 12件                                                 |
| `bun run build:storybook`                     | 成功        | WebとUIのstatic build。Webの500KB超chunk warningのみ                                  |
| `bun run build:cloudflare`                    | 成功        | Web、API、Images、AgentのbuildとWrangler dry-run。配備なし                            |
| `nix flake check`                             | 成功        | `aarch64-darwin`のflake検査                                                           |
| linked worktreeのroot dev smoke               | 成功        | TanStack StartのDocs/auth/dashboard、API、Agent、Storybook、Cookie/CORS、OTLP signal  |
| main checkoutのroot dev smoke                 | 成功        | 移行前mainでも同じPortless URL、API、Agent、Storybook起動経路を確認                   |
| W6のVite preview実ブラウザーsmoke             | 成功        | 静的asset、SSR、認証redirect、Docs、検索、履歴、pending/error boundary                |
| `rg`とKnip full/strict                        | 成功        | Web runtime/configのNext/OpenNext 0。Emulate E2E用`NEXT_DIST_DIR`だけ対象外として維持 |
| 有料Agent評価、完全E2E、本番配備              | 未実行      | 対象外どおりremote stateと有料modelを変更・実行していない                             |
| 差分のsecurity・route・文書review             | 成功        | request scope、secret境界、redirect/error、URL契約、Next/OpenNext残存を確認           |

## リスクとrollback

最大のリスクはrequestをまたいだsession混線、opaque OAuth queryの破壊、tenant切替後の古いcache、
public/private画像境界の後退である。server functionはrequest headerを明示的に受け、membershipをAPIの
結果から解決し、QueryClientをrouter単位に作る。merge前は本branchを破棄して既存Next.js/OpenNext構成を
維持し、merge後に問題が判明した場合は本PR全体をrevertする。remote resource、database、production
stateは変更しない。

## 完了条件

- 現行URL、redirect、metadata、auth/OAuth/cookie、tenant、docs/search/LLM endpointが互換である
- WebのNext.jsとOpenNext依存、設定、生成物、runtime codeが残っていない
- Vite dev/build/previewと同じCloudflare Workers出力がPortless、CI、deployから使われる
- Router Query SSR integration、Router lint、Unpic公開画像境界が正しく接続される
- HMR 3対象を各20回計測し、full reloadなしで入力状態を維持する
- 必須の静的検査、unit、browser、無料E2E、Storybook、Cloudflare dry-run、Nix検査が成功する
