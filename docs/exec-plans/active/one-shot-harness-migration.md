---
id: PLAN-2026-001
title: 文書、source構成、品質ゲート、テスト、Codex harnessの全面移行
status: active
created: 2026-07-24
owners:
  - repository-maintainers
linked_specs:
  - docs/architecture/knowledge-management.md
  - docs/architecture/naming-and-layers.md
  - docs/architecture/system-boundaries.md
  - docs/architecture/quality-enforcement.md
  - docs/architecture/codex-harness.md
  - docs/architecture/apps/web.md
  - docs/architecture/apps/api.md
  - docs/architecture/apps/agent.md
  - docs/api-openapi.md
  - docs/testing/README.md
  - docs/testing/web.md
  - docs/testing/api.md
  - docs/testing/agent.md
  - docs/testing/e2e.md
  - docs/agent/architecture-security.md
  - docs/agent/operations.md
linked_adrs:
  - docs/decisions/ADR-001-docs-and-skills-source-of-truth.md
  - docs/decisions/ADR-002-layering-and-import-boundaries.md
  - docs/decisions/ADR-003-test-command-and-cost-model.md
  - docs/decisions/ADR-004-codex-independent-review.md
  - docs/decisions/ADR-005-agent-runtime-under-src-mastra.md
  - docs/decisions/ADR-006-migration-history-append-only.md
---

# 文書、source構成、品質ゲート、テスト、Codex harnessの全面移行

## 目次

- [目的](#目的)
- [一括切替](#一括切替)
- [対象外](#対象外)
- [前提条件](#前提条件)
- [作業単位 1 文書と知識管理](#作業単位-1-文書と知識管理)
- [作業単位 2 source構成](#作業単位-2-source構成)
- [作業単位 3 importと品質](#作業単位-3-importと品質)
- [作業単位 4 テスト](#作業単位-4-テスト)
- [作業単位 5 Codex harness](#作業単位-5-codex-harness)
- [作業単位 6 CIとGit hook](#作業単位-6-ciとgit-hook)
- [最終検証](#最終検証)
- [レビュー](#レビュー)
- [有効化](#有効化)
- [判断記録](#判断記録)
- [検証証跡](#検証証跡)
- [リスクとrollback](#リスクとrollback)
- [完了条件](#完了条件)

## 目的

リポジトリを仕様に記載した最終状態へ一つのPRで全面移行します。

## 一括切替

段階的merge、品質gate対象外のlegacy zone、warning-only期間、Knip/jscpd baselineを設けません。
既存Durable Objectの削除事故を防ぐ`src/mastra/legacy/**` retention enclaveは全品質gateの対象にし、
通常runtimeから到達不能にするため、この禁止には含めません。

branch内では作業単位ごとにcommitできますが、各commitは同じPR内に留めます。最終検証が全てgreenになるまでmergeしません。

## 対象外

- product featureの追加
- VRTの導入
- production deploy
- database data migrationの実行
- GitHub organization rulesetの変更
- internal docs検索MCPの導入

## 前提条件

- [ ] feature変更を一時停止し、migration branchを最新mainへrebase
- [ ] `git status --short`がclean
- [ ] 現在のCIがgreen
- [ ] 現在のテスト時間と失敗を記録
- [ ] 現在のimport、Knip、jscpd、Oxlint上限の一覧を保存
- [ ] Codex version、project trustとcustom agents対応を確認
- [ ] リポジトリ管理者を最終承認者として指定

## 作業単位 1 文書と知識管理

### 1.1 文書構成

- [x] `docs/architecture/apps/`と`packages/`を追加
- [x] `docs/testing/`をWeb/API/Agent/E2E/migration/VRTへ分割
- [x] `docs/decisions/`とADRを追加
- [x] `docs/exec-plans/`とtemplateを追加
- [x] `docs/README.md`を新indexへ更新

### 1.2 metadata

- [x] 規範文書を`proposed/planned`で開始
- [x] VRTを`proposed/deferred`
- [x] ADRを`proposed`
- [x] planを`active`へ変更して作業開始
- [ ] metadata/link validation scriptを追加

### 1.3 local skillsとAGENTS

- [ ] root `AGENTS.md`を短いcontractへ置換
- [ ] nested `AGENTS.md`を追加せず、workspace固有routingをlocal skillへ限定
- [ ] local skillsを必読文書、Workflow、Validationへ短縮
- [ ] generated `.agents/skills`を削除/編集しない
- [ ] Nix sync後にskill一覧とlinkを検証
- [ ] 旧skillの長い規範本文を削除

## 作業単位 2 source構成

### 2.1 Web

- [ ] feature public entrypointを作る
- [ ] same-feature alias importをrelativeへ変更
- [ ] cross-feature deep importをpublic entrypointへ変更
- [ ] 大きいcomponentをcontroller/viewへ分割
- [ ] `boundary.tsx`のような曖昧名を`suspense.tsx`または`error-boundary.client.tsx`へ変更
- [ ] test/storyの過剰分割を整理
- [ ] feature directory直下のReact `.tsx`を`components/**`へ移す
- [ ] browserからimportできる全componentを、実componentを描画するnamed storyで検証する
- [ ] apps/webのdomain/view storyを実行できるStorybook projectへ統合する
- [ ] client render中に待機し得るcomponentへReactの`<Suspense>`、Skeleton、React Error Boundary、
      Browser Mode testを追加する
- [ ] async Server Component routeへ`loading.tsx`、`error.tsx`、Playwright E2を追加する
- [ ] Error Boundaryへsecret/private ID入りsentinelをthrowし、DOMと読み上げ領域へraw errorが
      出ないtestを追加する
- [ ] route `loading.tsx` / `error.tsx`をfeatureのSkeleton/error表示へ委譲する薄いfileにする

### 2.2 API

- [ ] moduleを`domain/schema/ports/service/repository/routes/module/public`へ整理
- [ ] 別moduleへ公開する型とuse caseを`public.ts`の最小surfaceへ限定
- [ ] cross-module private importを排除し、export-surface fixtureを追加
- [ ] routeからrepository直接callを削除
- [ ] serviceからElysia/Drizzle concrete importを削除
- [ ] error registryをfinite codeへ変更
- [ ] error handlerのtelemetry failureをsafeにする
- [ ] public/private Agent appを再確認
- [ ] Scalar/OpenAPIのconsumer-facing metadataを詳細な英語へ統一
- [ ] app-owned operationの英語説明を各Elysia routeの`detail`へ置き、request/response/property説明を
      routeへ渡すValibot schema metadataへ置く
- [ ] public API appのElysia route、Better Auth実生成operation、最終OpenAPIのexact unionを検証する
- [ ] Better Auth schemaを複製せず、Elysia OpenAPI plugin内で生成fragmentの英語metadata/securityを
      補足する
- [ ] OpenAPIの説明を持つYAML/YML/JSON、生成済みspec、独立metadata registryを追加しない
- [ ] standard securityと`x-route-status` / `x-auth-context` / `x-audience`を全operationへ付ける
- [ ] private Agent、development、test routeがpublic OpenAPIへ入らないようにする

### 2.3 Agent

- [ ] generated type以外のhand-written codeを`apps/agent/src/mastra/**`へ移動
- [ ] `src/mastra/index.ts`をStudio entrypointにする
- [ ] `src/mastra/worker.ts`をproduction Worker entrypointにする
- [ ] `composition/agents/core/runtime/tools/adapters`へ整理
- [ ] toolを`schema/execute/tool`へ分ける
- [ ] 旧`IssueAssistant`を`src/mastra/legacy/issue-assistant.ts`へ移動
- [ ] Durable Object class exportと既存Wrangler `new_sqlite_classes`を保持
- [ ] 旧endpointを`410 Gone`へ固定し、通常production runtimeからlegacy classへ到達不能にする
- [ ] retention判断前にWrangler `deleted_classes`を追加しない
- [ ] 旧`src/runtime|tools|messages|usage|control-plane`等を削除
- [ ] import pathとtest pathを全更新
- [ ] StudioとWorkerが同じcompositionをloadすることを確認

### 2.4 E2E Agent Worker

- [ ] `src/mastra/test-support/scripted-model.ts`を追加
- [ ] `src/mastra/e2e/worker.ts`を追加
- [ ] `wrangler.e2e.jsonc`を追加
- [ ] production env switchを作らない
- [ ] production bundleからtest sentinel不在を検査

### 2.5 Packages

- [ ] Auth client/server entrypoint isolation
- [ ] DBからbusiness repositoryを排除
- [ ] Email template/provider separation
- [ ] UI primitive/pattern dependency
- [ ] TypeScript configをruntime-freeにする
- [ ] package exportsを明示化

## 作業単位 3 importと品質

### 3.1 Oxlint

- [ ] common budget config moduleを追加
- [ ] production budgetをerrorで有効化
- [ ] React/adapter/test overrideを追加
- [ ] `import/no-cycle`等を有効化
- [ ] workspace/layer別`no-restricted-imports`
- [ ] generated/migrationだけを狭くexclude
- [ ] source再編の各作業単位でprofile別の最大値と95 percentileを記録して上限を狭める
- [ ] 最終PRで6 ruleを`quality-enforcement.md`の最終目標値まで狭める
- [ ] 全違反をrefactorし、disable commentを残さない

### 3.2 architecture検査

- [ ] workspace deep import
- [ ] cross-feature deep import
- [ ] production -> test-support
- [ ] Agent old source root
- [ ] package -> app
- [ ] public entrypoint export
- [ ] browserからimportできるcomponent -> 実componentを描画するnamed Storybook story
- [ ] clientで待機し得るcomponent -> Suspense / Skeleton / Error Boundary / Browser Mode test
- [ ] async Server Component route -> loading.tsx / error.tsx / Playwright E2
- [ ] OpenAPI人向けmetadata -> Elysia route `detail` / route Valibot metadata / Elysia OpenAPI plugin
- [ ] OpenAPI YAML/JSON、生成済みspec、独立metadata registryの禁止pathとproduction import

をresolved pathで検査するscriptを追加します。

### 3.3 Knip

- [ ] exact versionをcatalogへ追加
- [ ] `knip.config.ts`を追加
- [ ] full mode findingを全修正
- [ ] `knip --strict` findingを全修正
- [ ] broad ignoreを禁止
- [ ] workspace dependencyを各packageへ明示

### 3.4 jscpd

- [ ] exact versionをpin
- [ ] `.jscpd.json`を追加
- [ ] production codeだけをscan
- [ ] production/test/config/root scriptの代表fixtureでscan対象を検証
- [ ] duplicateを3%以下へrefactor
- [ ] baselineを作らない

### 3.5 script

- [ ] `check:static`
- [ ] `check`
- [ ] test script 5個
- [ ] root README/skillsのcommandを更新

## 作業単位 4 テスト

### 4.1 Web

- [ ] happy-dom unit/DOMを維持
- [ ] apps/webにBrowser Mode projectを追加
- [ ] apps/web Storybookを追加またはdomain storyを実行可能にする
- [ ] browserからimportできる全componentをnamed storyで実際に描画する
- [ ] story coverage checkでmissing/orphan/実component非参照/例外metadataを検査
- [ ] `light`全interaction/a11y、`dark`theme-sensitiveだけ
- [ ] loading/ready/error/retryを同一runで遷移させ、geometry、focus、overflowをBrowser Modeで検証
- [ ] mock Agent fixtureをstory/browser/E1で共有
- [ ] VRT file/scriptを追加しない

### 4.2 API

- [ ] domain/service/repository/HTTP contractを分離
- [ ] repositoryはreal libSQL
- [ ] error corpus追加
- [ ] GitHub plugin/OAuth emulator両modeをfresh processで起動して実Better Auth operation集合を検証
- [ ] 英語metadataのfield別下限/fallback拒否、security、`x-*`分類、OpenAPI 3.0.3、
      Scalar safetyを検証
- [ ] app-owned説明がElysia `detail`/Valibot metadataから生成され、外部YAML/JSON sourceがないことを検証
- [ ] final OpenAPIのexample/default/header/cookieを再帰走査するcredential/PII leakage gateを追加
- [ ] public/library route exactly-onceとprivate/dev/test route absenceを検証
- [ ] path mappingでAPI repository変更時にDB full test

### 4.3 Agent

- [ ] tool executor unit
- [ ] scripted model agent loop
- [ ] approval/resume/stream/usage
- [ ] API-owned private app + temporary DB integration
- [ ] G4をAgent-owned runtime/client contractとAPI-owned private app/migration済みDB suiteに分ける
- [ ] G4でapp間private source importを作らず、実Service Binding配線はE2で検証
- [ ] paid evalをbrowserなしへ移動
- [ ] paid stack evalはAgent/APIを別isolateで起動し、public client/Service Bindingだけで接続
- [ ] `apps/agent/evals/eval-budgets.json`へcase/profile/workflowのtoken、tool、time、cost上限を実装
- [ ] pricing/usage不明、hard maximum超過、stale case IDをfailするbudget validatorを追加

### 4.4 migration

- [ ] `migrations.test.ts`を5fileへ分割
- [ ] historical cutoffをtagへ変更
- [ ] history check、schema drift、behaviourを分離
- [ ] main migration immutability check
- [ ] `forceRerunTriggers`

### 4.5 E2E

- [ ] selector scriptを一つ追加
- [ ] E1/E2 projectを分ける
- [ ] E2はscripted model Workerを使う
- [ ] shared global resetをnamespace化
- [ ] Chromium full、WebKit代表case
- [ ] Next.js routeとServer Componentのloading/error/retryでpersistent shell、geometry、focus、
      overflowを検証
- [ ] E4を規範文書でIDを固定した2 canaryへ縮小し、各1回だけ実行

## 作業単位 5 Codex harness

### 5.1 project設定

- [ ] `.codex/config.toml`
- [ ] custom agent 5file
- [ ] project trust時にload確認
- [ ] invalid config warningゼロ

### 5.2 read-only検証

- [ ] 各reviewerへtemporary probe fileのwriteを依頼
- [ ] writeが拒否される
- [ ] `git status --short`が変わらない
- [ ] 失敗時はharnessをactiveにせずfallback手順を記録

### 5.3 Rules

- [ ] push、merge、deployを保護
- [ ] DB resetをprompt
- [ ] rule inline testを確認
- [ ] project trustを確認

### 5.4 Hooks

- [ ] `.codex/hooks.json`を追加
- [ ] `SessionStart`でactive exec planを追加contextへ渡す
- [ ] Rulesでpush、merge、deploy、destructive resetをprompt
- [ ] `PreToolUse`で`drizzle-kit push`をdeny
- [ ] `PreToolUse`で`.agents/skills/**`編集をdeny
- [ ] `PostToolUse`でprotected harness file変更を通知
- [ ] hook scriptをfixture JSONで直接test
- [ ] Codex session上で発火とdenyを確認

### 5.5 レビュー手順

- [ ] `test_planner`をimplementation前に実行
- [ ] `test_planner`が変更componentごとのstory、client Browser Mode、Server Component route E2の
      要否を返す
- [ ] `implementer`だけがwrite
- [ ] 三reviewerをcurrent diffへ実行
- [ ] finding formatを検証
- [ ] P0/P1ゼロ
- [ ] P2 waiverがあればowner、issue、expiry、SHAを確認
- [ ] 修正後にre-review

## 作業単位 6 CIとGit hook

### 6.1 Base SHA

- [ ] PR base/headを明示
- [ ] checkout `fetch-depth: 0`
- [ ] fork/unknownでfull free suiteへfallback

### 6.2 CI job

- [ ] `quality`
- [ ] `static-quality`
- [ ] `browser`
- [ ] `free-e2e`
- [ ] `cloudflare-dry-run`
- [ ] paid jobをfingerprint変更のtrusted-SHA承認run、nightly、releaseへ分離
- [ ] fork PRの`agent-eval-gate`をexact head treeへ紐づけ、未承認/stale resultでmergeさせない

### 6.3 Git hook

- [ ] pre-commitをfast checkへ限定
- [ ] pre-pushで`bun run check`
- [ ] browser/E2E/paidをhookへ入れない

## 最終検証

```sh
bun install --frozen-lockfile
nix flake check
bun run check
bun run test:browser
bun run test:e2e
bun run --cwd apps/api test -- openapi
bun run build
bun run build:storybook
bun run build:cloudflare
bun run --cwd packages/db db:check
```

Agent behaviourを変更した場合:

```sh
bun run test:eval:agent
```

Release candidateだけ:

```sh
bun run test:e2e:agent
```

追加確認:

```sh
rg 'apps/agent/src/(runtime|tools|messages|usage|control-plane)' apps docs .agents
find apps/agent/src -type f | sort
git diff --name-status origin/main -- packages/db/drizzle
```

## レビュー

1. correctness reviewer
2. security reviewer
3. tests reviewer
4. リポジトリ管理者

レビューは最終headで実行します。変更後の古いレビューは無効です。

## 有効化

- [ ] 規範文書を`accepted/active`へ変更
- [ ] ADRを`accepted`へ変更
- [ ] plan completion criteriaを確認
- [ ] planを`completed`へ変更し`completed/`へ移動
- [ ] 旧docs/skillの重複がない
- [ ] 一つのPRとしてmerge

## 判断記録

| 日付 | 判断 | 理由 |
| --- | --- | --- |
| 2026-07-24 | 段階mergeを行わず一つのPRでcutover | 新旧規則の並存を避ける |
| 2026-07-24 | Agent codeを`src/mastra/**`へ集約 | ownershipとgate対象を明確にする |
| 2026-07-24 | main baselineを作らず、branch内で上限を段階的に狭めて最終目標を全面適用 | 一括移行を保ちつつ、責務分割と同時に無理なくhard gateを縮小するため |
| 2026-07-24 | VRTはdeferred | flaky運用を先に導入しない |
| 2026-07-24 | Oxlint初期budgetはmigration-friendlyな3段階 | 一括移行でwaiverと無意味な分割を生まない |
| 2026-07-24 | testはsize budgetだけ緩め、import/security境界は共通 | test経由のarchitecture迂回を防ぐ |
| 2026-07-24 | paid evalをbrowserless 3 profile、E4を固定2 canaryへ分離 | model behaviorとfull-stack配線の費用・原因を分離する |
| 2026-07-24 | `docs/agent/` pathは維持しproduct Agentと明記 | renameのlink churnよりindexでの責務分離を優先する |
| 2026-07-24 | root `AGENTS.md`だけを使いnested fileを作らない | client差による上書きとdocs/skillsとの三重管理を避ける |
| 2026-07-24 | browserからimportできる全componentをStorybook対象にする | UI stateの発見可能性とa11y/interaction gateを例外なく保つため |
| 2026-07-24 | DOM geometry testを必須にし、pixel VRTはdefer | layout shiftをdeterministicに検出しつつbaseline運用を増やさないため |
| 2026-07-24 | Scalar向けmetadataは英語、repo規範文書は日本語 | consumer-facing API品質とrepositoryの言語契約を両立するため |
| 2026-07-24 | OpenAPI説明はElysia route/schema/pluginのTypeScriptだけを正本にする | route実装とのdriftを防ぎ、YAML/JSONや別metadata registryとの二重管理を作らないため |

## 検証証跡

| command | 結果 | 証跡 |
| --- | --- | --- |
| `bun run format:check` | pass | 696 files、2026-07-24 |
| `git diff --check d23af9f --` | pass | whitespace errorなし |
| docs metadata/link/anchor/ADR/reachability検査 | pass | 全docs 52文書、ADR 6件、全件が入口から到達可能 |
| `git diff --exit-code d23af9f -- .agents/skills .github/skills` | pass | generated skill直接変更なし |
| `nix flake check` | pass | `checks.aarch64-darwin.agent-skills`とdevShell |
| current docs diffのcorrectness/security/tests独立review | pass | P0〜P2 findingゼロ、2026-07-24 |

## リスクとrollback

### リスク

- PRが非常に大きい
- path moveでmerge conflictが増える
- strict budget対応で不自然な分割が起きる
- Knip/jscpd false positive
- Codex read-onlyがclient差で機能しない

### 緩和策

- feature変更の一時停止
- branch内でworkstream commit
- semantic file moveを先に行い、logic changeを分ける
- 全checkと独立レビュー
- read-only probe failure時のfallback

### rollback

部分mergeしません。失敗時はPR全体を中止またはmerge後に単一revertします。旧規則と新規則を選択的に混在させません。

## 完了条件

- [ ] docs/ADR/planがaccepted/completed
- [ ] skillsとAGENTSが新正本を参照
- [ ] app/package sourceが目標構造
- [ ] Agent hand-written runtimeが`src/mastra/**`
- [ ] `IssueAssistant`のclass exportと`new_sqlite_classes`が維持され、旧endpointが`410 Gone`
- [ ] Agent Wrangler migrationに`deleted_classes`が追加されていない
- [ ] Oxlintが最終目標budget（production/React 500 lines、test 1000 lines等）で違反ゼロ
- [ ] Knip full/strict findingゼロ
- [ ] jscpd threshold以下
- [ ] browserからimportできるcomponentのstory coverage 100%、missingと実component非参照storyゼロ
- [ ] clientで待機し得る全componentにSuspense/Skeleton/Error Boundary/Browser Mode testがある
- [ ] async Server Component routeにloading.tsx/error.tsx/Playwright E2があり、geometry test成功
- [ ] Scalar/OpenAPI metadataが詳細な英語で、両auth modeのroute coverage/parity test成功
- [ ] OpenAPIの説明がElysia route/schema/pluginのTypeScript内にあり、外部YAML/JSON description
      sourceがない
- [ ] Agent paid eval budget manifestが全caseを覆い、hard maximumとworkflow cap検査が成功
- [ ] `bun run check`成功
- [ ] `test:browser`成功
- [ ] free E2E成功
- [ ] production dry-run bundle成功
- [ ] reviewer write-denial probe成功またはfallbackが明示
- [ ] P0/P1 findingゼロ
- [ ] main migrationの変更ゼロ
- [ ] 一つのPRでmerge可能
