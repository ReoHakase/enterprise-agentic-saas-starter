---
id: PLAN-2026-027
title: Issue-first DataTableとURL同期
status: active
created: 2026-07-27
owners:
  - Codex
linked_specs:
  - docs/architecture/apps/web.md
  - docs/architecture/apps/api.md
  - docs/testing-strategy/apps/web.md
  - docs/testing-strategy/apps/api.md
linked_adrs: []
---

# Issue-first DataTableとURL同期

## 目的

Issues一覧を最初の利用者として、TanStack Tableの柔軟性を保つ共通DataTable、共有可能なURL状態、
テナント境界を持つAPI絞り込み、選択・列表示・ページ移動の一貫した操作を実装する。共通rendererを
Organizations、Members、Invitations、Sessionsへ展開し、feature固有の列と操作を維持する。

## 対象外

- DB schemaとmigration
- 行全体のクリック領域
- 列の並べ替え
- 有料Agent testと新しいfull E2E journey
- `ui_set_issue_query`の既存入出力変更

## 前提条件

- `packages/ui`はprimitiveだけを所有し、DataTable compositionは`apps/web/src/components/data-table`へ置く。
- feature側が`useReactTable`で`Table<TData>`を構築し、共通rendererは`flexRender`をそのまま使う。
- Issue URLは既存のprefixなしを維持し、別利用者は明示したprefixで同じparser factoryを利用できる。
- `agentThread`はtable所有queryへ含めず、Issuesの状態変更でも維持する。

## 変更対象path

- `apps/web/src/components/data-table/**`
- `apps/web/src/features/issues/**`
- `apps/web/src/features/organizations/components/organizations-page/**`
- `apps/web/src/features/members/components/{members-table,invitations-section,members-page}/**`
- `apps/web/src/features/account/components/sessions-panel/**`
- `apps/api/src/modules/issues/**`
- `apps/api/src/app.issue-operations.test.ts`
- `apps/web/src/features/issues/**/*.stories.tsx`
- `docs/architecture/apps/{web,api}.md`
- `docs/testing-strategy/apps/{web,api}.md`

## 作業単位

1. URL parser factory、選択prune、pagination、列表示永続化の純粋contractを追加する。
2. `Table<TData>`を受け取る共通DataTable root、header、body、toolbar、footerを追加する。
3. Issues固有column、複合filter、選択、列表示、paginationを接続する。
4. Issues APIへ複数値、範囲、期日、label候補、動的page sizeを追加する。
5. W1からW4、API実libSQL、Storybook storyを追加し、正本文書を更新する。
6. Organizations、Members、Invitations、Sessionsの手書きheader/body rendererを共通DataTableへ移行する。
7. MembersとInvitationsへ検索、絞り込み、sort、共通paginationを追加し、同一画面のURL namespaceを分離する。

## 進捗

- [x] 現行のWeb、API、test、正本文書を調査した
- [x] W1の共有contractを実装した
- [x] 共通DataTableとIssues UIを実装した
- [x] API絞り込みとlabel候補を実装した
- [x] storyと統合testを実装した
- [x] toolbar、sort、検索可能filter、期日popoverのresponsive UXを実装した
- [x] Organizations、Members、Invitations、Sessionsを共通rendererへ移行した
- [x] MembersとInvitationsへ検索、絞り込み、sort、共通paginationと独立したURL namespaceを追加した
- [ ] 必須検査を全て通した

## 判断記録

| 日付       | 判断                                                                 | 理由                                                            |
| ---------- | -------------------------------------------------------------------- | --------------------------------------------------------------- |
| 2026-07-27 | DataTable rendererは`Table<TData>`だけを受け、column定義を所有しない | interactive cellとTanStackの拡張性を損なわないため              |
| 2026-07-27 | IssuesのURL keyはprefixなしを維持する                                | 既存共有URLを壊さず、factoryの再利用性だけを追加するため        |
| 2026-07-27 | label候補はdistinct nameだけを返す                                   | popularityや利用件数を新しいdomain ruleにしないため             |
| 2026-07-27 | Statusは複数選択、Priorityは順序付きinclusive rangeにする            | 非連続statusとpriority順序をそれぞれ正しく表現するため          |
| 2026-07-27 | query更新中は直前行を保持してspinnerを重ねる                         | 結果0件へのflashとtable layout shiftを避けるため                |
| 2026-07-27 | client query hookをserver-safe barrelから分離する                    | Server Componentのproduction build graphを守るため              |
| 2026-07-27 | sticky cellは透明のまま、操作部だけ半透明surfaceとblurで保護する     | 横scroll下の文字を抑えつつ行の選択色と連続させるため            |
| 2026-07-27 | 期日はWebのrange Calendarで選び、日付とoffsetだけをAPIへ送る         | UI状態をtransportから除き、非UTC環境でもSQLの日界を合わせるため |
| 2026-07-27 | placeholder行は表示を維持しつつmutation操作を無効化する              | 古い行へ新しいquery scopeの更新を適用しないため                 |
| 2026-07-27 | 期日範囲の開始と終了日翌日のoffsetを独立して保持する                 | DST遷移と現在とは異なる季節のlocal日界を守るため                |
| 2026-07-27 | assignee 50件、label 20件へcanonical URL値を制限する                 | API query modelの配列上限と共有URLを一致させるため              |
| 2026-07-27 | 検索と列表示を単独control、FiltersとSortだけをgroupにする            | toolbarの主要操作と分類見出しの視覚階層を一致させるため         |
| 2026-07-28 | 期日popoverはpresetと入力を持たず、1か月のrange Calendarだけにする   | 狭いviewportで日付範囲の選択へ操作を集中させるため              |
| 2026-07-27 | Calendarは順序付き範囲を返し、外部URLの逆転範囲は破棄する            | 日付とDST境界offsetの対応を入れ替えずに保つため                 |
| 2026-07-27 | clear/reset/列表示/summary/選択barを操作scopeへ分離する              | URL状態を過剰に消去せず、狭い画面でも主要操作を保つため         |
| 2026-07-28 | Storybook light/darkを各1 workerで順次実行する                       | full runのproject/file並列時に発生した`No Preview`を防ぐため    |
| 2026-07-28 | 既存4表はrendererだけを移行し、状態と列定義はfeatureへ残す           | 共通化でdomain固有のsort、search、mutationを制限しないため      |
| 2026-07-28 | Membersはprefixなし、Invitationsは`inv_*`のURL keyを使う             | 同一画面の主表を簡潔にし、2表の検索・絞り込みを干渉させないため |
| 2026-07-28 | MembersとInvitationsは取得済みデータをclient-sideでpage分割する      | API契約を変えず共通footerへpage sizeとページ移動を統一するため  |

## 検証証跡

| command                    | 結果   | 証跡                                                                                                                      |
| -------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| Web unit全体               | 成功   | 91 files、416 tests。Members/InvitationsのURL namespace分離、検索、filter、sort、paginationと既存action回帰を含む         |
| API unit・実libSQL全体     | 成功   | 55 files、331 tests                                                                                                       |
| Web/API/UI lint・typecheck | 成功   | warningなし                                                                                                               |
| `bun run check`            | 成功   | final current diffで再実行。static、format、typecheck、全workspace unit・integrationが成功                                |
| `bun run test:browser`     | 成功   | exact commandがexit 0。UI Storybook 99、Web light 197・dark 78、Web browser 7、Chromium app 17、WebKit representative 1   |
| `bun run test:e2e`         | 成功   | 3 tests                                                                                                                   |
| `bun run build:storybook`  | 成功   | UI/Web static build成功                                                                                                   |
| Web `next build`           | 成功   | `test:browser`のproduction app buildで全routeを生成                                                                       |
| `bun run build:cloudflare` | 未完了 | API・Agent primary・Agent E2Eのdry-runとWeb OpenNext bundleは生成成功。Wranglerが終了表示後も停滞し、再実行は明示承認待ち |

## リスクとrollback

URL normalizationとAPI filterの不一致は別結果を共有する原因になる。parserからrequestとquery keyを
生成し、同一入力のW1で固定する。選択は現在結果に存在するIDだけへpruneし、組織・filter・page size変更時に
別scopeへ持ち越さない。rollbackは共通DataTable利用をIssues固有rendererへ戻し、API query追加を外す。
DB変更はない。

## 完了条件

- prefixあり・なしのURL parser、request、query keyが同じ正規化結果を使う
- Issuesで複数filter、選択、列表示、sticky列、responsive paginationが動作する
- APIがテナント境界、literal wildcard、安定sort、label候補上限を実libSQLで保証する
- required commandが全て成功し、P0/P1と必須検査失敗が残っていない
