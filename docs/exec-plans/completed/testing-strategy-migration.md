---
id: PLAN-2026-007
title: testing strategy全面移行
status: completed
created: 2026-07-26
completed: 2026-07-26
owners:
  - repository-maintainers
linked_specs:
  - ../../testing-strategy/README.md
linked_adrs:
  - ../../decisions/ADR-007-workspace-testing-strategy.md
---

# testing strategy全面移行

## 目的

現行code、architecture文書、testing strategyをworkspace別のテスト所有権へ揃え、`docs/testing-strategy/`をテスト契約の正本にする。

## 対象外

- 視覚回帰テストの実装
- production deploy、Git push、remote DB変更
- paid secretを使う`test:e2e:full`の実行
- repository専用architecture checkerの追加

## 関連仕様とADR

- [テスト戦略仕様書](../../testing-strategy/README.md)
- [ADR-007 workspace別テスト戦略](../../decisions/ADR-007-workspace-testing-strategy.md)
- [Web architecture](../../architecture/apps/web.md)
- [API architecture](../../architecture/apps/api.md)
- [Agent architecture](../../architecture/apps/agent.md)

## 前提条件

- Agentの手書きruntime rootは`apps/agent/src/mastra/**`を維持する
- Web feature公開面は`index.ts`と`server.ts`へ分離する
- WebとUIのcomponentは常にdirectoryへ置く
- E2は明示承認とpaid secretがあるrelease workflowだけで実行する

## 変更対象path

- `apps/**`
- `packages/**`
- `.github/workflows/**`
- `.agents/local-skills/**`
- `.codex/hooks/**`
- `docs/**`
- `package.json`
- `turbo.json`

## 作業単位

1. testing strategy、ADR、実行計画を確定する
2. API platform境界を移動する
3. Web feature公開境界とcontroller、fixtureを移動する
4. Web componentをdirectory化する
5. UI componentをdirectory化する
6. StorybookをCSF NextとMSW 2へ移行する
7. package所有testとfixtureを整備する
8. Web W1-W6を整備する
9. E1/E2 configとscriptを分離する
10. coverage対象と閾値を確定する
11. 通常CIが全無料suiteを実行する契約を確認する
12. 文書、skill、hookを新しい正本へ切り替える

## 進捗

- [x] testing strategyの合意事項を文書へ反映した
- [x] ADR-007とactive exec planを作成した
- [x] API platform境界を移動した
- [x] Web feature公開境界を移動した
- [x] Web componentをdirectory化した
- [x] UI componentをdirectory化した
- [x] StorybookをCSF Nextへ移行した
- [x] package所有testを整備した
- [x] W1-W6を実装した
- [x] E1/E2を分離した
- [x] coverageを確定した
- [x] 通常CIの全無料suite実行を確認した
- [x] 文書をcutoverしplanをcompletedへ移した

## 判断記録

| 日付       | 判断                                           | 理由                                                           |
| ---------- | ---------------------------------------------- | -------------------------------------------------------------- |
| 2026-07-26 | Agent runtimeは`src/mastra/**`へ集約する       | ADR-005と現行codeへ整合させる                                  |
| 2026-07-26 | repository専用architecture checkerを追加しない | 既存のexports、lint、Knip、build、package testで境界を強制する |
| 2026-07-26 | paid full-stackは`test:e2e:full`だけを公開する | 旧commandを残さず費用境界を明確にする                          |
| 2026-07-26 | componentを常にdirectoryへ置く                 | test、story、fixtureのcolocationを一貫させる                   |
| 2026-07-26 | private subcomponentは親storyで検証できる      | publicな利用面へstoryを集中させる                              |
| 2026-07-26 | CI変更選択は後続作業へ分離する                 | selector用のscriptを増やさず、今回は全無料suiteを維持する      |

## 検証証跡

| command                               | 結果    | 証跡                                                    |
| ------------------------------------- | ------- | ------------------------------------------------------- |
| Markdown formatとlink検査             | success | 76 Markdown fileのlocal linkと全1108 fileのformatが成功 |
| workspace lint、typecheck、test       | success | 9 workspaceすべて成功                                   |
| `bun run check`                       | success | static、format、typecheck、rootとworkspace testが成功   |
| `bun run test:browser`                | success | UI 30、Web 109、W6 Chromium 16、WebKit 1 tests          |
| `bun run test:e2e`                    | success | 決定的E1 3 tests                                        |
| Storybook、Cloudflare、Nix build      | success | Storybook 2、Cloudflare 3、Nix flake checkが成功        |
| `bun run --cwd apps/api lint`         | success | warningなし                                             |
| `bun run --cwd apps/api typecheck`    | success | 型errorなし                                             |
| `bun run --cwd apps/api test`         | success | 55 files、319 tests。localhost利用のためsandbox外で実行 |
| `bun run --cwd apps/web lint`         | success | feature公開入口移行後、warningなし                      |
| `bun run --cwd apps/web typecheck`    | success | feature公開入口移行後、型errorなし                      |
| `bun run --cwd apps/web test`         | success | 70 files、317 tests                                     |
| Web component directory検査           | success | app-wideとfeature componentの直下fileなし               |
| `bun run --cwd packages/ui lint`      | success | warningなし                                             |
| `bun run --cwd packages/ui typecheck` | success | 公開subpath維持後、型errorなし                          |
| `bun run --cwd packages/ui test`      | success | 8 files、20 tests                                       |
| Web、UI Storybook CSF形式検査         | success | 全22 storyが`preview.meta`と`meta.story`を使用          |
| `bun run --cwd apps/web lint`         | success | CSF NextとMSW追加後、warningなし                        |
| `bun run --cwd apps/web typecheck`    | success | Next.js Vite framework追加後、型errorなし               |
| `bun run --cwd packages/ui lint`      | success | CSF Next移行後、warningなし                             |
| `bun run --cwd packages/ui typecheck` | success | CSF Next移行後、型errorなし                             |
| Web、UI Storybook build               | success | Storybook 10.5.3で両方のstatic buildが成功              |
| `bun run --cwd packages/auth test`    | success | 7 files、54 tests                                       |
| `bun run --cwd packages/db test`      | success | 11 files、44 tests。file DB concurrencyを含む           |
| `bun run --cwd packages/email test`   | success | 2 files、34 tests                                       |
| GitHub emulator test                  | success | 4 files、21 tests                                       |
| TypeScript config fixture compile     | success | Bun、Worker、React library、Next.jsの4 fixtureが成功    |
| Web W1、W2、W5                        | success | 70 files、317 tests                                     |
| Web W3、W4                            | success | 24 files、109 tests。10 dark storyを対象外にした        |
| Web W6 Chromium                       | success | 16 Playwright tests                                     |
| Web W6 WebKit代表                     | success | 1 Playwright test                                       |
| Web Storybook build                   | success | CSF Next、MSW global handlerを含むstatic buildが成功    |
| 決定的E1                              | success | 実stackとscripted modelで3 Playwright tests             |
| E2 config静的検査                     | success | 2 canaryを列挙し、有料実行は未実施                      |
| E2 approval、secret guard             | success | どちらか一方が欠ける場合はserver起動前に拒否            |
| root公開test script                   | success | 費用境界別の5 scriptだけを公開                          |
| `bun run test`                        | success | root 23 tests、9 workspaceの全testが成功                |
| Node coverage threshold               | success | 8 workspaceで実測値の整数切り下げ以上を強制             |
| Web browser coverage                  | success | 109 tests、独立reportを`coverage/browser`へ生成         |
| UI browser coverage                   | success | 30 tests、独立reportを`coverage/browser`へ生成          |

## リスクとrollback

大量のrenameでimport、package export、story discoveryが壊れる可能性がある。各checkpointを独立commitにし、path限定のlint、typecheck、testで失敗原因を局所化する。rollbackはcheckpoint単位のrevertで行い、既存migration履歴やgenerated fileを手編集しない。

## 完了条件

- current code、architecture、testing strategyが同じ配置とcommandを指す
- 無料suiteとbuildがすべて成功する
- paid E2が通常検証から隔離される
- 廃止したtest文書、旧分類、旧commandが残らない
- `*.public.ts`、CSF 3、feature root本番`.tsx`が残らない
- planをcompletedへ移し、最終検証証跡を記録する
