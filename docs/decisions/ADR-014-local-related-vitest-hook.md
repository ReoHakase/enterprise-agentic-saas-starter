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
`bun run check`とPR・`main`で全件実行している。ワークスペースごとにVitest設定、`unit` project、
カバレッジ閾値が分かれているが、ワークスペース単位で`related`を実行すると、共有パッケージの変更から
そのパッケージを使うアプリケーションのテストへ至る静的`import`を追跡できない。複数ワークスペースを
同時に変更した場合はVitestプロセスも重複し、同じテストを複数回選択する可能性がある。

## 決定

pre-commitに限り、`lefthook.yml`の単一コマンドが`{staged_files}`をリポジトリルートの
`VITEST_RELATED=1 vitest related --config vitest.config.ts --run --coverage=false`へ渡す。既存の
`vitest.config.ts`は`VITEST_RELATED=1`のときだけVitest標準のTest Projectsでリポジトリルート、
各Nodeワークスペース、Web/UIの`unit` projectを1つのVitestプロセスへ登録する。Browser Mode、
Storybook、E2E、有料モデルテストは登録しない。

リポジトリルートの選択用設定にある`forceRerunTriggers`へマニフェスト、Vitest/Vite設定、setup、
`tsconfig.json`、DBマイグレーション、スキーマ、Drizzle設定を明示する。これらの変更ではTest Projectsに
登録した全Nodeテストを実行する。削除ファイルはpre-commitコマンド内の
`git diff --cached --diff-filter=D`で検出し、リポジトリルートの`bun run test`へ縮退する。文書、
ワークフロー、lockfileなどテストと静的な関係がないファイルだけの変更では、テストコマンドを起動しない。

pre-pushの`bun run check`、PR、`main`の全件テスト、リポジトリルートの公開テストスクリプトは
変更しない。commit-msgのcommitlintもコミットメッセージ検査に限定する。

## 理由

- Vitestの`related`が各Test ProjectのVite依存グラフを使うため、共有パッケージから利用側のテストまで
  ワークスペースをまたいで選択できる。
- 全staged fileを1つのVitestプロセスへ渡すため、Lefthookコマンドごとの重複起動と重複選択を作らない。
- Web/UIの既存設定内で`unit` projectの定義を通常実行と選択実行から共有し、alias、setup、`include`を
  リポジトリルートへ複製しない。
- 部分テストへカバレッジ閾値を適用すると全体閾値を満たせないため、カバレッジを無効にする。
  カバレッジはpre-push、PR、`main`の全件テストで維持する。
- 選択の不確実性をリポジトリルートの`forceRerunTriggers`と削除ファイル専用の全件実行で扱い、
  テストを黙って省略しない。

## 検討した代替案

- Lefthookからワークスペース別に`vitest related`を実行する: 共有パッケージから利用側への依存を
  追跡できず、複数変更でVitestプロセスとテスト選択が重複するため採用しない。
- pre-commitでリポジトリルートの`bun run test`を全件実行する: 安全だが無関係なワークスペースの
  起動時間を毎回負担するため採用しない。pre-pushとPR・`main`の全件テストは維持する。
- リポジトリルートの内部スクリプトでワークスペースを分類する: Vitestが持つTest Projectsと
  依存グラフを再実装するため
  採用しない。
- `vitest run --changed`だけを使う: staged fileだけでなくunstaged fileも選択するため、pre-commitの
  staged-only契約に合わず採用しない。
- Browser Mode、E2E、有料テストも`related`で選択する: 実行環境、費用、起動条件が単体・統合テストと異なり、
  pre-commitの短時間契約を壊すため採用しない。

## 結果

通常のコミットでは変更に関係するテストを全Test Projectsから1回だけ選択し、トリガー変更では全Node
テストを、削除ではリポジトリルートの単体・統合テストを安全側へ選択する。静的`import`で追跡できない
`import(filepath)`や実ブラウザー・全構成の回帰は`related`選択の保証外だが、pre-push、PR、`main`の全件テストが
検出経路として残る。部分テストでカバレッジ成果物を生成しないため、カバレッジ報告の正本は全件テストに
限定される。

## 強制方法

- `lefthook.yml`のpre-commitからリポジトリルートの選択用設定を使う単一の`vitest related`を呼ぶ。
- 既存の`vitest.config.ts`を`VITEST_RELATED=1`でTest Projectsへ切り替え、rootの
  `forceRerunTriggers`、Web/UIの共有`unit` project定義、削除ファイル用の
  `git diff --diff-filter=D`で境界を固定する。
- `docs/architecture/quality-enforcement.md`と`docs/testing-strategy/common/ci-execution.md`でlocal hookと
  PR・`main`の全件testの境界を説明する。
- `bun run check`とCIのquality laneは全件test契約を維持する。

## 検証

- 共有パッケージの代表ソースコードから利用側を含むTest Projectsの`related`選択
- 複数ワークスペース変更でテストファイルとVitestプロセスが重複しないこと
- 設定、マニフェスト、setup、`tsconfig.json`、DBの`forceRerunTriggers`、削除ファイルの全件実行
- Browser Mode、Storybook、E2E、文書、ワークフロー、lockfileの非対象判定
- `bun run check`
