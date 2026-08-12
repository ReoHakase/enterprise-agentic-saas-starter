---
id: ADR-014
title: pre-commitのVitest Test Projects選択
status: accepted
date: 2026-08-12
owners:
  - repository-maintainers
related:
  - ADR-007-workspace-testing-strategy.md
---

# ADR-014 pre-commitのVitest Test Projects選択

## 背景

pre-commitはコミットメッセージ、整形、静的検査を短時間で検査し、テストはpre-pushの
`bun run check`とPR・`main`で全件実行している。ワークスペース単位で`related`を実行すると、共有
パッケージの変更から利用側アプリケーションのテストへ至る静的`import`を追跡できない。複数
ワークスペースを同時に変更した場合はVitestプロセスも重複し、同じテストを複数回選択する可能性がある。

Vitestの公式[Test Projects](https://vitest.dev/guide/projects)契約では、root configが`defineConfig`で
`test.projects`を定義し、そのprojectとして読み込むconfig fileは`defineProject`で定義する。rootと
workspaceの双方が同じprojectを`defineConfig`で定義すると、設定の責務が重複し、current working
directory（cwd）によって読み込むconfigとproject名が変わる。

## 決定

`lefthook.yml`の単一コマンドが`{staged_files}`をリポジトリルートの
`vitest related --config vitest.config.ts --project='*-unit' --run --coverage=false`へ渡す。コマンド内で
`git diff`、`jq`、独自selector、workspace別Vitest起動を使わない。Lefthook側でも対象workspaceや
test種別を`glob`と`exclude`で分類せず、全staged pathに対する選択をVitestへ委ねる。

既存のroot `vitest.config.ts`を唯一の`defineConfig`とし、Vitest標準のTest Projectsとして常時使う。
`apps/*/vitest.config.ts`と`packages/*/vitest.config.ts`はconfig pathとして登録し、各fileは単一の
単体テストprojectを`defineProject`で定義する。Web/UIのBrowser ModeとStorybook project、projectでは
定義できないglobal coverage、`forceRerunTriggers`はrootが所有する。新しいconfigファイルや選択scriptは
追加しない。

各workspaceのテストscriptは`--config ../../vitest.config.ts`と一意な`--project`を明示する。rootからでも
workspaceからでも同じroot configとproject graphを使い、cwdによるconfig探索へ依存しない。単体テストの
project名は`*-unit`へ統一し、Browser ModeとStorybookは別名にする。LefthookはVitestのproject wildcardで
`*-unit`だけを選ぶ。

rootの`forceRerunTriggers`へマニフェスト、Vitest/Vite設定、setup、`tsconfig.json`、DB
マイグレーション、スキーマ、Drizzle設定を明示する。これらの変更ではLefthookが選択した全`*-unit`
projectを実行する。Browser Mode、Storybook、E2E、有料モデルテストは選択しない。

削除ファイルを検出する別処理や全件fallbackは設けず、他のstaged fileと同じく削除後のpathをVitestへ
渡す。現在ツリーに存在しないmoduleはVitestの静的依存graphから関連付けできず、関連テストが0件になる
場合がある。この制約はpre-pushの`bun run check`、PR、`main`の全件テストで補完する。

リポジトリルートの`bun run test`はroot Test Projectだけを明示選択した後、Turbo経由で各workspaceの
テストを実行する。workspace scriptは一度に1 projectを選び、rootのglobal coverageがそのprojectの既存
includeと閾値を適用する。commit-msgのcommitlintはコミットメッセージ検査に限定する。

## 理由

- Vitestの`related`が1つのTest Projects graphを使うため、共有パッケージから利用側のテストまで
  ワークスペースをまたいで選択できる。
- 全staged fileを1つのVitestプロセスへ渡すため、Lefthookコマンドごとの重複起動と重複選択を作らない。
- rootの`defineConfig`と各workspaceの`defineProject`へ責務を分け、公式Test Projectsの型と探索規則に
  合わせる。
- Test Projectではprojectごとのcoverage設定を持てないため、全件テストはTurbo経由で1 projectずつ
  実行し、rootのglobal coverageへ選択projectの既存閾値を適用する。
- 部分テストへカバレッジ閾値を適用すると全体閾値を満たせないため、関連実行ではカバレッジを無効にする。
- 設定変更の不確実性はVitest標準の`forceRerunTriggers`で扱い、選択ロジックをshellへ複製しない。

## 検討した代替案

- rootへ全workspaceの単体テスト設定をinlineで複製する: workspace側の通常実行設定と責務が重複し、
  `defineProject`を使う公式構成から外れるため採用しない。
- 各workspace configを独立した`defineConfig`として維持する: cwdによってrootとworkspaceの異なるconfigを
  読み込み、project graphと名前が変わるため採用しない。
- Lefthookからworkspace別に`vitest related`を実行する: 共有パッケージから利用側への依存を追跡できず、
  複数変更でVitestプロセスとテスト選択が重複するため採用しない。
- shellまたは内部scriptで削除、workspace、fallbackを分類する: Vitestが持つTest Projectsと依存graphの
  外側に第二の選択規則を作るため採用しない。
- `vitest run --changed`だけを使う: staged fileだけでなくunstaged fileも選択するため、pre-commitの
  staged-only契約に合わず採用しない。
- Browser Mode、E2E、有料テストも`related`で選択する: 実行環境、費用、起動条件が単体・統合テストと異なり、
  pre-commitの短時間契約を壊すため採用しない。

## 結果

通常のコミットでは変更に関係するテストを全Test Projectsから1回だけ選択し、トリガー変更では全Node
テストを実行する。静的graphへ接続できない削除path、計算された`import(filepath)`、実ブラウザー、全構成の
回帰は関連選択の保証外だが、pre-push、PR、`main`の全件テストが検出経路として残る。部分テストで
カバレッジ成果物を生成しないため、カバレッジ報告の正本は全件テストに限定される。

## 強制方法

- `lefthook.yml`からroot configを使う単一の`vitest related`だけを呼ぶ。
- root `vitest.config.ts`だけが`defineConfig`、global coverage、Browser/Storybook project、
  `forceRerunTriggers`を定義する。
- `apps/**`と`packages/**`のVitest configは単一の単体テストprojectを`defineProject`で定義する。
- 全Vitest scriptはroot configと一意なproject名を明示する。
- `docs/architecture/quality-enforcement.md`と`docs/testing-strategy/common/ci-execution.md`でlocal hookと
  PR・`main`の全件testの境界を説明する。
- `bun run check`とCIのquality laneは全件test契約を維持する。

## 検証

- Test Projectsのtest file一覧に重複、Browser Mode、Storybook、E2Eがないこと
- 共有パッケージの代表sourceから利用側を含むTest Projectsの`related`選択
- Web/UIの代表sourceに対する単体テスト選択
- マニフェスト、設定、setup、`tsconfig.json`、DBの`forceRerunTriggers`
- 存在しないpathがVitest標準の0件成功になること
- root以外のVitest configが`defineProject`だけを使うこと
- rootとworkspaceからの起動が同じprojectを選択すること
- Lefthookの関連テストcommandに`git diff`、`jq`、独自scriptがないこと
- Lefthookに関連テスト用のworkspace `glob`または`exclude`がないこと
- `bun run check`
