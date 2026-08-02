---
id: PLAN-2026-031
title: CIクリティカルパス短縮
status: active
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

- Issue #8とPR #9はopenで、現在のブランチとhead `e92a45a`に対応しています。
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
- [ ] CIの3回計測とPR本文更新

## 判断記録

| 日付       | 判断                                                 | 理由                                                     |
| ---------- | ---------------------------------------------------- | -------------------------------------------------------- |
| 2026-08-02 | GitHub Actionsのジョブ数よりPR待ち時間を優先する     | 公開リポジトリであり、現在は単一ジョブの直列処理が支配的 |
| 2026-08-02 | Playwright公式コンテナとブラウザーキャッシュを見送る | NixとTursoを使うE1との共通化で独自保守対象が増えるため   |
| 2026-08-02 | rootの公開スクリプトを変更しない                     | ローカル契約を安定させ、CI専用の分割を内部に閉じるため   |

## 検証証跡

| command                                | 結果 | 証跡                                                         |
| -------------------------------------- | ---- | ------------------------------------------------------------ |
| profile別`--list`                      | 成功 | `all` 6件、`agent` 4件、`auth` 2件。未知profileは即時失敗    |
| Storybook light/dark、seed 17・83・101 | 成功 | 各seedでlight 205件、dark 76件                               |
| Agent E1 `--workers=3 --repeat-each=3` | 成功 | 12件、3分0秒                                                 |
| Auth E1 `--workers=1 --repeat-each=3`  | 成功 | 6件、37.8秒                                                  |
| `bun run check`                        | 成功 | lint、Knip、jscpd、format、typecheck、unit・integration test |
| `bun run test:browser`                 | 成功 | Web/UI全件とNext.js integration、2分13秒                     |
| `bun run test:e2e`                     | 成功 | 未指定`all`で6件、1分4秒                                     |
| `bun run build`                        | 成功 | Emulateを含むworkspace build                                 |
| `bun run build:storybook`              | 成功 | Web/UI。sandbox外のfont取得を許可して再実行                  |
| `bun run build:cloudflare`             | 成功 | Web、API、Agentのdry-run build                               |
| `nix flake check`                      | 成功 | aarch64-darwin対象                                           |
| `git diff --check`                     | 成功 | whitespace errorなし                                         |

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
