---
id: PLAN-2026-001
title: 文書、source構成、品質ゲート、テスト、Codex harnessの全面移行
status: draft
created: 2026-07-24
owners:
  - repository-maintainers
linked_specs:
  - docs/architecture/knowledge-management.md
  - docs/architecture/naming-and-layers.md
  - docs/architecture/system-boundaries.md
  - docs/architecture/quality-enforcement.md
  - docs/architecture/codex-harness.md
  - docs/testing/README.md
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

段階的merge、legacy zone、warning-only期間、Knip/jscpd baselineを設けません。

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

- [ ] `docs/architecture/apps/`と`packages/`を追加
- [ ] `docs/testing/`をWeb/API/Agent/E2E/migration/VRTへ分割
- [ ] `docs/decisions/`とADRを追加
- [ ] `docs/exec-plans/`とtemplateを追加
- [ ] `docs/README.md`を新indexへ更新

### 1.2 metadata

- [ ] 規範文書を`proposed/planned`で開始
- [ ] VRTを`proposed/deferred`
- [ ] ADRを`proposed`
- [ ] planを`active`へ変更して作業開始
- [ ] metadata/link validation scriptを追加

### 1.3 local skillsとAGENTS

- [ ] root `AGENTS.md`を短いcontractへ置換
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
- [ ] `boundary.tsx`を具体名へ変更
- [ ] test/storyの過剰分割を整理

### 2.2 API

- [ ] moduleを`domain/schema/ports/service/repository/routes/module`へ整理
- [ ] routeからrepository直接callを削除
- [ ] serviceからElysia/Drizzle concrete importを削除
- [ ] error registryをfinite codeへ変更
- [ ] error handlerのtelemetry failureをsafeにする
- [ ] public/private Agent appを再確認

### 2.3 Agent

- [ ] generated type以外のhand-written codeを`apps/agent/src/mastra/**`へ移動
- [ ] `src/mastra/index.ts`をStudio entrypointにする
- [ ] `src/mastra/worker.ts`をproduction Worker entrypointにする
- [ ] `composition/agents/core/runtime/tools/adapters`へ整理
- [ ] toolを`schema/execute/tool`へ分ける
- [ ] 旧`src/runtime|tools|messages|usage|control-plane`等を削除
- [ ] import pathとtest pathを全更新
- [ ] StudioとWorkerが同じcompositionをloadすることを確認

### 2.4 E2E Agent Worker

- [ ] `src/mastra/test-support/scripted-model.ts`を追加
- [ ] `src/mastra/e2e/worker.ts`を追加
- [ ] `wrangler.e2e.toml`を追加
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
- [ ] 全違反をrefactorし、disable commentを残さない

### 3.2 architecture検査

- [ ] workspace deep import
- [ ] cross-feature deep import
- [ ] production -> test-support
- [ ] Agent old source root
- [ ] package -> app
- [ ] public entrypoint export

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
- [ ] `light`全interaction/a11y、`dark`theme-sensitiveだけ
- [ ] mock Agent fixtureをstory/browser/E1で共有
- [ ] VRT file/scriptを追加しない

### 4.2 API

- [ ] domain/service/repository/HTTP contractを分離
- [ ] repositoryはreal libSQL
- [ ] error corpus追加
- [ ] path mappingでAPI repository変更時にDB full test

### 4.3 Agent

- [ ] tool executor unit
- [ ] scripted model agent loop
- [ ] approval/resume/stream/usage
- [ ] private API + temporary DB integration
- [ ] paid evalをbrowserなしへ移動

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
- [ ] E4を1から2canaryへ縮小

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
- [ ] `PreToolUse`でpush、merge、deploy、`drizzle-kit push`をdeny
- [ ] `PreToolUse`で`.agents/skills/**`編集をdeny
- [ ] `PostToolUse`でprotected harness file変更を通知
- [ ] hook scriptをfixture JSONで直接test
- [ ] Codex session上で発火とdenyを確認

### 5.5 レビュー手順

- [ ] `test_planner`をimplementation前に実行
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
- [ ] paid jobをnightly/releaseへ分離

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
| 2026-07-24 | Ratchetを使わず全budgetを即時適用 | ユーザーが全面移行を選択したため |
| 2026-07-24 | VRTはdeferred | flaky運用を先に導入しない |

## 検証証跡

| command | 結果 | 証跡 |
| --- | --- | --- |
| pending | pending | pending |

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
- [ ] Oxlint budget violationゼロ
- [ ] Knip full/strict findingゼロ
- [ ] jscpd threshold以下
- [ ] `bun run check`成功
- [ ] `test:browser`成功
- [ ] free E2E成功
- [ ] production dry-run bundle成功
- [ ] reviewer write-denial probe成功またはfallbackが明示
- [ ] P0/P1 findingゼロ
- [ ] main migrationの変更ゼロ
- [ ] 一つのPRでmerge可能
