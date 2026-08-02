---
id: PLAN-2026-031
title: CIクリティカルパス短縮
status: completed
created: 2026-08-02
owners:
  - repository-maintainers
linked_specs:
  - docs/testing-strategy/common/ci-execution.md
  - docs/testing-strategy/apps/web.md
  - docs/testing-strategy/e2e.md
linked_adrs:
  - docs/decisions/ADR-007-workspace-testing-strategy.md
---

# CIクリティカルパス短縮

## 目的

無料の必須品質検査を省略せず、独立した型検査、テスト、ビルド、Storybook、E1構成をGitHub
Actionsのジョブへ分け、PRで結果を待つ時間を短縮します。

基準run `30748671356`では、`Quality`が352秒、`Browser · Web components`が354秒、
`Free E2E`が257秒でした。

## 対象外

- rootの公開スクリプトとローカルの全件実行順序
- Playwright公式コンテナ、独自CIイメージ、ブラウザーバイナリーキャッシュ
- 変更ファイルに基づくテスト選択
- タイムアウト、再試行、有料テスト
- 製品API、UI、依存パッケージ、lockfile

## 前提条件

- Issue #8とPR #9はopenで、計測対象headは`e43339c`です。
- `Quality`内の型検査、無料テスト、アプリケーションビルドに順序依存はありません。
- Storybookの各テーマ内は1ワーカーを維持し、CIのジョブ間だけを並列化します。
- OAuthとWebAuthnは直列のまま、Agentの決定的E1だけを最大3ワーカーで実行します。

## 変更対象path

- `.github/workflows/ci.yml`
- `turbo.json`
- `apps/web/package.json`
- `apps/web/playwright*.config.ts`
- `apps/web/scripts/**`
- `apps/web/test/app/**`
- `docs/architecture/quality-enforcement.md`
- `docs/testing-strategy/**`
- `docs/decisions/ADR-007-workspace-testing-strategy.md`

## 作業単位

1. 静的検査、型検査、無料テスト、ビルドを独立ジョブへ分け、`Quality`で集約します。
2. WebのStorybook 2テーマ、Browser Mode、Storybookビルドを独立ジョブへ分けます。
3. W6のCI、Playwright project、ログ上の名称を`Next.js integration`へ変更します。
4. 決定的E1へ`all`、`agent`、`auth`の内部profileを追加し、CIで2ジョブへ分けます。
5. 正本文書、ADR、PR本文を現在の実装と検証証跡へ同期します。

## 進捗

- [x] Qualityの独立ジョブと集約ジョブ
- [x] Web componentsの独立ジョブと集約ジョブ
- [x] Next.js integrationへの名称変更
- [x] 決定的E1のprofile分離
- [x] 決定的な反復検証と全必須品質検査
- [x] CIの3回計測とPR本文更新

## 判断記録

| 日付       | 判断                                                 | 理由                                                                      |
| ---------- | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| 2026-08-02 | GitHub Actionsのジョブ数よりPR待ち時間を優先する     | 公開リポジトリであり、現在は単一ジョブの直列処理が支配的                  |
| 2026-08-02 | Playwright公式コンテナとブラウザーキャッシュを見送る | NixとTursoを使うE1との共通化で独自保守対象が増えるため                    |
| 2026-08-02 | rootの公開スクリプトを変更しない                     | ローカル契約を安定させ、CI専用の分割を内部に閉じるため                    |
| 2026-08-02 | Agentのcancel scenarioを依存projectへ分ける          | Linux workerdで他scenarioと同時にstreamを切断するとWranglerが終了したため |
| 2026-08-02 | 2ユーザーの初回作成をsetup projectで直列実行する     | 3 workerが同じ新規userを同時作成するとBetter Authの一意制約と競合するため |
| 2026-08-02 | Web Storybookのfontを固定system stackへ分離する      | dependencyを変えず、static buildをGoogle Fontsの可用性から分離するため    |
| 2026-08-02 | menu起動をfocusとEnterで検証する                     | storyの目的と無関係なpointer geometryへの依存を除くため                   |

## 検証証跡

| command                                   | 結果 | 証跡                                                                 |
| ----------------------------------------- | ---- | -------------------------------------------------------------------- |
| profile別`--list`                         | 成功 | `all` 7件、`agent` 5件、`auth` 2件。未知profileは即時失敗            |
| Storybook light/dark、seed 17・83・101    | 成功 | 各seedでlight 205件、dark 76件                                       |
| Console Shell light、seed 17・83・101     | 成功 | semantic menu操作へ変更後、各seedで7件                               |
| Agent E1並列project `--repeat-each=3`     | 成功 | setup 1件とwrite、search、attachment 9件を3ワーカーで54.3秒          |
| Agent E1 cancel project `--repeat-each=3` | 成功 | setup、並列3件、1ワーカーのcancel 3件で計7件、42.7秒                 |
| Agent E1通常profile                       | 成功 | setup、並列3件、cancelの計5件、37.7秒                                |
| Auth E1 `--workers=1 --repeat-each=3`     | 成功 | 6件、37.8秒                                                          |
| `bun run check`                           | 成功 | lint、Knip、jscpd、format、typecheck、unit・integration test         |
| `bun run test:browser`                    | 成功 | Web/UI全件とNext.js integration、2分13秒                             |
| `bun run test:e2e`                        | 成功 | 未指定`all`で7件、1分5秒                                             |
| `bun run build`                           | 成功 | Emulateを含むworkspace build                                         |
| `bun run build:storybook`                 | 成功 | Web/UI。Webは外部font取得なしでstatic artifactを生成                 |
| `bun run build:cloudflare`                | 成功 | Web、API、Agentのdry-run build                                       |
| `nix flake check`                         | 成功 | aarch64-darwin対象                                                   |
| `git diff --check`                        | 成功 | whitespace errorなし                                                 |
| CI run `30752916540`                      | 修正 | cancelとの同時実行でLinux workerdが終了。依存project化後に再計測する |
| CI run `30753696597`                      | 修正 | 共有userの初回作成が競合。setup projectで直列認証して再計測する      |
| CI run `30754423942` attempt 2            | 修正 | Google Fonts取得失敗。固定system stackへ置換して再計測する           |
| CI run `30755342091`                      | 修正 | menuのpointer起動が不安定。focusとEnterによるsemantic操作へ置換する  |
| CI run `30755777092` attempts 1・2・3     | 成功 | 同一head `e43339c`で全jobが3回連続成功                               |

計測対象はqueue時間を除いた各jobの`started_at`から`completed_at`までです。

| 対象                | attempt 1 | attempt 2 | attempt 3 | 中央値 | 目標      |
| ------------------- | --------- | --------- | --------- | ------ | --------- |
| Quality最長lane     | 218秒     | 222秒     | 235秒     | 222秒  | 240秒以下 |
| Web components最長  | 178秒     | 201秒     | 194秒     | 194秒  | 240秒以下 |
| Free E2E最長profile | 221秒     | 199秒     | 214秒     | 214秒  | 220秒以下 |

## リスクとrollback

ジョブ分割はBun依存導入とブラウザー導入を複数ランナーで繰り返すため、総ランナー時間は増えます。
待ち時間の中央値が改善しない場合は集約ジョブと内部profileを維持したまま、短いlaneを再統合します。
テスト失敗時はタイムアウトや再試行を増やさず、状態分離と起動順序を修正します。

## 完了条件

- PRと`main`で全無料テストが実行され、集約ジョブが各laneの失敗を伝播します。
- `Quality`とWeb componentsの最長laneが240秒以下、無料E2Eの最長profileが220秒以下です。
- 同一commitの成功run 3件で、queue時間を除く中央値を記録します。
- 計画に記載した必須コマンドとGitHub CIが成功します。
- PR #9の本文が現在のジョブ構成、確認結果、リスクを説明しています。
