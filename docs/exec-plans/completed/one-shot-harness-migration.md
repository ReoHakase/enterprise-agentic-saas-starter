---
id: PLAN-2026-001
title: 文書、source構成、品質ゲート、テスト、Codex harnessの全面移行
status: completed
created: 2026-07-24
completed: 2026-07-25
owners:
  - repository-maintainers
linked_specs:
  - docs/jargon.md
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
- [x] 作業開始時に`git status --short`がclean
- [ ] 現在のCIがgreen
- [ ] 現在のテスト時間と失敗を記録
- [ ] 現在のimport、Knip、jscpd、Oxlint上限の一覧を保存
- [ ] Codex version、project trustとcustom agents対応を確認
- [x] リポジトリ管理者を最終承認者として指定

## 作業単位 1 文書と知識管理

### 1.1 文書構成

- [x] `docs/architecture/apps/`と`packages/`を追加
- [x] `docs/jargon.md`を追加し、AGENTSとdocs indexから参照
- [x] `docs/testing/`をWeb/API/Agent/E2E/migration/VRTへ分割
- [x] `docs/decisions/`とADRを追加
- [x] `docs/exec-plans/`とtemplateを追加
- [x] `docs/README.md`を新indexへ更新

### 1.2 metadata

- [x] 規範文書を`proposed/planned`で開始
- [x] VRTを`proposed/deferred`
- [x] ADRを`proposed`
- [x] planを`active`へ変更して作業開始
- [x] metadataとlinkを文書規約として定義し、リポジトリ固有の検査scriptは置かない

### 1.3 local skillsとAGENTS

- [x] root `AGENTS.md`を短いcontractへ置換
- [x] nested `AGENTS.md`を追加せず、workspace固有routingをlocal skillへ限定
- [x] local skillsを必読文書、Workflow、Validationへ短縮
- [x] generated `.agents/skills`を削除/編集しない
- [x] Nix sync後にskill一覧とlinkを検証
- [x] 旧skillの長い規範本文を削除

## 作業単位 2 source構成

### 2.1 Web

- [x] feature public entrypointを作る
- [x] same-feature alias importをrelativeへ変更
- [x] cross-feature deep importをpublic entrypointへ変更
- [x] 大きいcomponentをcontroller/viewへ分割
- [x] `boundary.tsx`のような曖昧名を`suspense.tsx`または`error-boundary.client.tsx`へ変更
- [x] test/storyの過剰分割を整理
- [x] feature directory直下のReact `.tsx`を`components/**`へ移す
- [x] exported browser component名にnamed storyを用意し、Storybook/Browser Modeを実行する
- [x] apps/webのdomain/view storyを実行できるStorybook projectへ統合する
- [x] client render中に待機し得るcomponentへReactの`<Suspense>`、Skeleton、React Error Boundary、
      Browser Mode testを追加する
- [x] async Server Component routeへ`loading.tsx`、`error.tsx`、Playwright E2を追加する
- [x] Error Boundaryへsecret/private ID入りsentinelをthrowし、DOMと読み上げ領域へraw errorが
      出ないtestを追加する
- [x] route `loading.tsx` / `error.tsx`をfeatureのSkeleton/error表示へ委譲する薄いfileにする

### 2.2 API

- [x] moduleを`domain/schema/ports/service/repository/routes/module/public`へ整理
- [x] 別moduleへ公開する型とuse caseを`public.ts`の最小surfaceへ限定
- [x] cross-module private importを排除し、export-surface fixtureを追加
- [x] routeからrepository直接callを削除
- [x] serviceからElysia/Drizzle concrete importを削除
- [x] error registryをfinite codeへ変更
- [x] error handlerのtelemetry failureをsafeにする
- [x] public/private Agent appを再確認
- [x] Scalar/OpenAPIのconsumer-facing metadataを詳細な英語へ統一
- [x] app-owned operationの英語説明を各Elysia routeの`detail`へ置き、request/response/property説明を
      routeへ渡すValibot schema metadataへ置く
- [x] public API appのElysia route、Better Auth実生成operation、最終OpenAPIのexact unionを検証する
- [x] Better Auth schemaを複製せず、Elysia OpenAPI plugin内で生成fragmentの英語metadata/securityを
      補足する
- [x] OpenAPIの説明を持つYAML/YML/JSON、生成済みspec、独立metadata registryを追加しない
- [x] standard securityと`x-route-status` / `x-auth-context` / `x-audience`を全operationへ付ける
- [x] private Agent、development、test routeがpublic OpenAPIへ入らないようにする

### 2.3 Agent

- [x] generated type以外のhand-written codeを`apps/agent/src/mastra/**`へ移動
- [x] `src/mastra/index.ts`をStudio entrypointにする
- [x] `src/mastra/worker.ts`をproduction Worker entrypointにする
- [x] `composition/agents/core/runtime/tools/adapters`へ整理
- [x] toolを`schema/execute/tool`へ分ける
- [x] 旧`IssueAssistant`を`src/mastra/legacy/issue-assistant.ts`へ移動
- [x] Durable Object class exportと既存Wrangler `new_sqlite_classes`を保持
- [x] 旧endpointを`410 Gone`へ固定し、通常production runtimeからlegacy classへ到達不能にする
- [x] retention判断前にWrangler `deleted_classes`を追加しない
- [x] 旧`src/runtime|tools|messages|usage|control-plane`等を削除
- [x] import pathとtest pathを全更新
- [x] StudioとWorkerが同じcompositionをloadすることを確認

### 2.4 E2E Agent Worker

- [x] `src/mastra/test-support/scripted-model.ts`を追加
- [x] `src/mastra/e2e/worker.ts`を追加
- [x] `wrangler.e2e.jsonc`を追加
- [x] production env switchを作らない
- [x] production bundleからtest sentinel不在を検査

### 2.5 Packages

- [x] Auth client/server entrypoint isolation
- [x] DBからbusiness repositoryを排除
- [x] Email template/provider separation
- [x] UI primitive/pattern dependency
- [x] TypeScript configをruntime-freeにする
- [x] package exportsを明示化

## 作業単位 3 importと品質

### 3.1 Oxlint

- [x] root `oxlint.config.ts`からcommon budget helperをexport
- [x] production budgetをerrorで有効化
- [x] React/adapter/test overrideを追加
- [x] `import/no-cycle`等を有効化
- [x] workspace/layer別`no-restricted-imports`
- [x] generated/migrationだけを狭くexclude
- [x] 最終budgetを全sourceへ直接適用し、計測用resolverやbaselineを追加しない
- [x] 最終PRで6 ruleを`quality-enforcement.md`の最終目標値まで狭める
- [x] 全違反をrefactorし、disable commentを残さない

### 3.2 architecture contract

- [x] workspace deep import、package -> app、production -> test-supportをOxlint/Knipへ委譲
- [x] Agent old source rootとWeb feature component placementを設計文書とreview対象にする
- [x] exported browser componentのstoryをStorybook/Browser Modeで実行する
- [x] async Server Component routeのloading/error/retryをPlaywrightで実行する
- [x] OpenAPI metadata、route parity、秘密値非漏洩をAPI-owned testで検査
- [x] repo専用architecture checkerとESLintを置かない
- [x] 独自AST、module resolver、import graph、例外registryを追加しない

### 3.3 Knip

- [x] exact versionをcatalogへ追加
- [x] `knip.config.ts`を追加
- [x] full mode findingを全修正
- [x] `knip --strict` findingを全修正
- [x] broad ignoreを禁止
- [x] workspace dependencyを各packageへ明示

### 3.4 jscpd

- [x] exact versionをpin
- [x] `.jscpd.json`を追加
- [x] production codeだけをscan
- [x] `.jscpd.json`でproduction source rootと狭いignoreを明示
- [x] duplicateを3%以下へrefactor
- [x] baselineを作らない

### 3.5 script

- [x] `check:static`
- [x] `check`
- [x] test script 5個
- [x] root README/skillsのcommandを更新

## 作業単位 4 テスト

### 4.1 Web

- [x] happy-dom unit/DOMを維持
- [x] apps/webにBrowser Mode projectを追加
- [x] apps/web Storybookを追加またはdomain storyを実行可能にする
- [x] exported browser component名ごとにnamed storyを用意する
- [x] storyの実render、interaction、a11yをStorybook/Browser Modeで検査
- [x] `light`全interaction/a11y、`dark`theme-sensitiveだけ
- [x] loading/ready/error/retryを同一runで遷移させ、geometry、focus、overflowをBrowser Modeで検証
- [x] story/browserのAgent fixtureを最小のsynthetic dataへ集約
- [x] VRT file/scriptを追加しない

### 4.2 API

- [x] domain/service/repository/HTTP contractを分離
- [x] repositoryはreal libSQL
- [x] error corpus追加
- [x] 実appから生成したOpenAPIでoperation ID、tag、英語summary/description、security、
      `x-*`分類、主要schemaを検証
- [x] private Agent routeの非公開とScalarのauth非永続化、telemetry/Agent無効化を検証
- [x] 独自AST、metadata registry、巨大snapshot、汎用OpenAPI scannerを追加しない
- [x] 通常CIのfull `bun run test`でAPI変更時もDB full test

### 4.3 Agent

- [x] tool executor unit
- [x] scripted model agent loop
- [x] approval/resume/stream/usage
- [x] API-owned private app + temporary DB integration
- [x] G4をAgent-owned runtime/client contractとAPI-owned private app/migration済みDB suiteに分ける
- [x] G4でapp間private source importを作らず、実Service Binding配線はE2で検証
- [x] paid evalをbrowserなしへ移動
- [x] paid stack evalはAgent/APIを別isolateで起動し、public client/Service Bindingだけで接続
- [x] paid testを通常のfree gateから分離し、明示実行だけに限定
- [x] paid testの予算manifest、pricing validator、credential gatewayを追加しない

### 4.4 migration

- [x] `migrations.test.ts`を5fileへ分割
- [x] historical cutoffをtagへ変更
- [x] history check、schema drift、behaviourを分離
- [x] main migration immutability check
- [x] `forceRerunTriggers`

### 4.5 E2E

- [x] selectorを置かず、通常PRでfree E2Eを全件実行
- [x] E1/E2 projectを分ける
- [x] E2はscripted model Workerを使う
- [x] shared global resetをnamespace化
- [x] E1 mock APIを固定shell/route responseとone-shot fault/delayだけへ縮小
- [x] Chromium full、WebKit代表case
- [x] Next.js routeとServer Componentのloading/error/retryでpersistent shell、geometry、focus、
      overflowを検証
- [x] E4を規範文書でIDを固定した2 canaryへ縮小し、各1回だけ実行

## 作業単位 5 Codex harness

### 5.1 project設定

- [x] `.codex/config.toml`
- [x] custom agent 5file
- [ ] project trust時にload確認
- [ ] invalid config warningゼロ

### 5.2 read-only検証

- [ ] 各reviewerへtemporary probe fileのwriteを依頼
- [ ] writeが拒否される
- [ ] `git status --short`が変わらない
- [x] 失敗時はharnessをactiveにせずfallback手順を記録

### 5.3 Rules

- [x] push、merge、deployを保護
- [x] DB resetをprompt
- [x] rule inline testを確認
- [ ] project trustを確認

### 5.4 Hooks

- [x] `.codex/hooks.json`を追加
- [x] `SessionStart`でactive exec planを追加contextへ渡す
- [x] Rulesでpush、merge、deploy、destructive resetをprompt
- [x] `PreToolUse`で`drizzle-kit push`をdeny
- [x] `PreToolUse`で`.agents/skills/**`編集をdeny
- [x] quote結合と単純な変数代入を解決し、obfuscated指定も代表payloadでdeny
- [x] `PostToolUse`でprotected harness file変更を通知
- [x] hook scriptをinlineの代表payloadで直接test
- [ ] Codex session上で発火とdenyを確認

### 5.5 レビュー手順

- [ ] `test_planner`をimplementation前に実行
- [ ] `test_planner`が変更componentごとのstory、client Browser Mode、Server Component route E2の
      要否を返す
- [ ] `implementer`だけがwrite
- [x] 三reviewerをcurrent diffへ実行
- [x] finding formatを検証
- [x] P0/P1ゼロ
- [x] P2 waiverなし
- [x] 修正後にre-review

このrunではリポジトリ管理者の明示指示により、project custom agentの`test_planner`と
sole-writer手順を使わず、`gpt-5.6-sol` ultraの並列agentで実装と独立reviewを行いました。

## 作業単位 6 CIとGit hook

### 6.1 Free E2E

- [x] checkout `fetch-depth: 0`
- [x] 通常PR、fork PR、mainでfull free suite
- [x] path selectorとbase SHA fallbackを追加しない

### 6.2 CI job

- [x] `quality`
- [x] `static-quality`
- [x] `browser`
- [x] `free-e2e`
- [x] `cloudflare-dry-run`
- [x] paid jobを明示実行、nightly、releaseへ分離
- [x] fork PRと通常PRのrequired checkへpaid secretを渡さない

### 6.3 Git hook

- [x] pre-commitをfast checkへ限定
- [x] pre-pushで`bun run check`
- [x] browser/E2E/paidをhookへ入れない

## 最終検証

```sh
bun install --frozen-lockfile
nix flake check
bun run check
bun run test:browser
bun run test:e2e
bun run --cwd apps/api test -- openapi --coverage.enabled=false
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

このrunではリポジトリ管理者の明示指示により、paid testとその予算検証を実行していません。

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

- [x] 規範文書を`accepted/active`へ変更
- [x] ADRを`accepted`へ変更
- [x] plan completion criteriaを確認
- [x] planを`completed`へ変更し`completed/`へ移動
- [x] 旧docs/skillの重複がない
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
| 2026-07-24 | paid evalをbrowserなしのread/write 2 case各3 trial、E4を固定2 canaryへ分離 | model behaviorとfull-stack配線の費用・原因を分離する |
| 2026-07-24 | `docs/agent/` pathは維持しproduct Agentと明記 | renameのlink churnよりindexでの責務分離を優先する |
| 2026-07-24 | root `AGENTS.md`だけを使いnested fileを作らない | client差による上書きとdocs/skillsとの三重管理を避ける |
| 2026-07-24 | exported browser componentをStorybook対象にする | UI stateの発見可能性とa11y/interaction gateを保つため |
| 2026-07-24 | DOM geometry testを必須にし、pixel VRTはdefer | layout shiftをdeterministicに検出しつつbaseline運用を増やさないため |
| 2026-07-24 | Scalar向けmetadataは英語、repo規範文書は日本語 | consumer-facing API品質とrepositoryの言語契約を両立するため |
| 2026-07-24 | OpenAPI説明はElysia route/schema/pluginのTypeScriptだけを正本にする | route実装とのdriftを防ぎ、YAML/JSONや別metadata registryとの二重管理を作らないため |
| 2026-07-24 | リポジトリ管理者が全面移行仕様を`accepted`として承認 | 規範文書とADRを提案状態から切り替える明示承認を受けたため |
| 2026-07-24 | 今回の実装はcustom agentの`test_planner` / sole-writer手順を使わず、`gpt-5.6-sol` ultraの並列agentで実行 | リポジトリ管理者がこのrunに限ってproject agent指示を上書きしたため。harness自体の実session検証証跡には数えない |
| 2026-07-24 | paid evalとpaid full-stack canaryを実行しない | model費用を伴う実行の明示承認は受けておらず、free testだけをこのrunの検証対象にしたため |
| 2026-07-24 | external `codex exec`によるlive probeを実行せず、Codex harnessを`implementation: planned`に保つ | repository contextを外部processへ送るapprovalが実行前に拒否されたため。fixture/static validatorはlive発火やread-only sandboxを証明しない |
| 2026-07-24 | push、PR merge、production deployをこのrunでは実行しない | 明示承認のない外部変更を避け、working treeを一つのPRへ載せられる状態までを対象にするため |
| 2026-07-24 | OpenAPI単独検証ではcoverageを無効化し、coverage thresholdは`bun run check`のfull suiteで強制 | file filter実行のassertion成功をglobal coverage不足で偽陰性にせず、coverage gate自体は弱めないため |
| 2026-07-25 | paid testの予算検証、credential gateway、独自attestationを実装しない | 管理者が不要と判断し、local test/toolingの保守コストを最小化するよう明示したため |
| 2026-07-25 | `part-*`によるtest file分割を禁止し、責務を表すfilenameへ再構成 | lint上限回避のための機械的分割を残さないため |
| 2026-07-25 | quality gateはOxlint、Knip、jscpd、実testへ委譲し、repo固有scriptを最小化 | 独自AST、module graph、mock repositoryの重複実装と保守コストを避けるため |
| 2026-07-25 | `tooling/quality`を廃止し、Oxlint helperをroot、Codex testを`.codex/`、workflow testを`.github/`へ置き、文書checkerは追加しない | ownerと実行境界をfile配置へ反映し、汎用品質tooling directoryとリポジトリ固有checkerの保守を避けるため |
| 2026-07-25 | ESLintとrepo専用architecture checkerを追加しない | 配置やsemantic contractのために第二のlint stackと独自scannerを保守しないため |
| 2026-07-25 | Lefthookがlint可能なstaged fileを検出したとき`bun run lint`を実行する | custom staged selectorを削除し、rootとworkspace configを常に同じ経路で検証するため |
| 2026-07-25 | free E2Eをpathで選択せず通常PRでも全件実行する | selector、base SHA fallback、fixtureを廃止し、無料suiteの判定漏れをなくすため |

## 検証証跡

| command | 結果 | 証跡 |
| --- | --- | --- |
| `bun install --frozen-lockfile` | pass | lockfile変更なし、2026-07-25 |
| `nix flake check` | pass | `checks.aarch64-darwin.agent-skills`とdevShell |
| `bun run check` | pass | Oxlint、Knip full/strict、jscpd、format、typecheck、free unit/integration。repository policy testとCodex harness testを含む |
| `bun run test:browser` | pass | UI 30件、Web 109件 |
| `bun run test:e2e` | pass | E1 core 8件、route contract 9件、scripted Agent E2 1件、OAuth/WebAuthn E2 2件 |
| `bun run --cwd apps/api test -- openapi --coverage.enabled=false` | pass | 実app生成OpenAPI contract 1件 |
| `bun run build` | pass | 全workspace build |
| `bun run build:storybook` | pass | WebとUIのStorybook static build |
| `bun run build:cloudflare` | pass | Web OpenNext、API Worker、Agent production/E2 Worker dry-run |
| `bun run --cwd packages/db db:check` | pass | migration history、schema、behaviour |
| `git diff --exit-code origin/main -- .agents/skills` | pass | generated skill直接変更なし |
| `git diff --exit-code origin/main -- packages/db/drizzle` | pass | main migration変更なし |
| source残存検査 | pass | `part-*`なし、`paid-model-gateway`なし、Agent hand-written sourceは`src/mastra/**`へ集約 |
| local harness規模 | pass | `tooling/quality`と文書checkerを廃止し、Codex testは`.codex/`、workflow policy testは`.github/`へ所有を分離 |
| current diffのcorrectness/security/tests独立review | pass | 修正後の再reviewでP0〜P2 findingゼロ、2026-07-25 |
| paid test / 予算検証 | not run | リポジトリ管理者の明示指示により対象外 |

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

- [x] docs/ADR/planがaccepted/completed
- [x] skillsとAGENTSが新正本を参照
- [x] app/package sourceが目標構造
- [x] Agent hand-written runtimeが`src/mastra/**`
- [x] `IssueAssistant`のclass exportと`new_sqlite_classes`が維持され、旧endpointが`410 Gone`
- [x] Agent Wrangler migrationに`deleted_classes`が追加されていない
- [x] Oxlintが最終目標budget（production/React 500 lines、test 1000 lines等）で違反ゼロ
- [x] Knip full/strict findingゼロ
- [x] jscpd threshold以下
- [x] exported browser componentにnamed storyがあり、Storybook/Browser Mode testが成功
- [x] clientの主要な待機状態にSuspense/Skeleton/Error Boundary/Browser Mode testがある
- [x] async Server Component routeにloading.tsx/error.tsx/Playwright E2があり、geometry test成功
- [x] 実app生成OpenAPIのoperation ID、英語metadata、security分類、主要schema、Scalar設定test成功
- [x] `bun run check`成功
- [x] `test:browser`成功
- [x] free E2E成功
- [x] production dry-run bundle成功
- [x] reviewer write-denial probe成功またはfallbackが明示
- [x] P0/P1 findingゼロ
- [x] main migrationの変更ゼロ
- [x] 一つのPRでmerge可能
