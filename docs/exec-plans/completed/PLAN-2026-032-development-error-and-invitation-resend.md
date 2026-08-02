---
id: PLAN-2026-032
title: Next devエラー可視化とBetter Auth招待再送修正
status: completed
created: 2026-08-03
owners:
  - repository-maintainers
linked_specs:
  - docs/observability.md
  - docs/auth-tenancy-security.md
  - docs/database-lifecycle.md
linked_adrs:
  - docs/decisions/ADR-013-local-raw-errors-in-logs-only.md
---

# Next devエラー可視化とBetter Auth招待再送修正

## 目的

Next.js開発overlayへreporter自身ではなく認証情報除去済みの元エラーstackと`cause`を渡し、
Better Auth標準の招待再送契約を妨げているDB indexをappend-only migrationで除去します。

## 対象外

- 利用者向けtoast、画面レイアウト、Better Authの公開HTTP response
- Workerdのbackground taskとcompatibility flag
- DB・R2 seed、production deploy、remote DB
- Grafana MCPの機能追加

## 前提条件

- Lokiで確認した2件の再送500は、どちらも
  `invitation_pending_organization_email_uidx`違反です。
- Better Auth 1.6.25は、期限内の`resend: true`では既存rowを更新し、期限切れrowを検索対象から
  外して新しいinvitationを作ります。
- WebのQuery・Mutation observerは元の`BetterFetchError`を保持しており、原因を失う箇所は
  `reportDevelopmentCauseChain`の`console.error`投影です。

## 変更対象path

- `apps/web/src/lib/development-error.ts`
- `apps/web/src/lib/development-error.test.ts`
- `apps/web/e2e/full/real-agent.spec.ts`
- `packages/auth/src/index.test.ts`
- `packages/db/src/schema/auth.generated.ts`
- `packages/db/drizzle/**`
- `packages/db/src/migrations/invariants.test.ts`
- `apps/api/src/modules/organizations/**`
- `docs/decisions/ADR-013-local-raw-errors-in-logs-only.md`
- `docs/observability.md`
- `docs/auth-tenancy-security.md`
- `docs/database-lifecycle.md`

## 作業単位

1. Webの認証情報除去済みcause recordから安全な`Error.cause`ツリーを再構築し、consoleへ起点ごとに
   1回渡します。
2. Better Auth CLIの生成結果とrepo固有indexを照合し、招待unique indexだけをdesired schemaから
   除外してDrizzle migrationを生成します。
3. native endpointのactive再送、期限切れ更新、履歴保持とAPI件数を実DBテストで固定します。
4. 正本文書を実装へ同期し、無料gate、ローカルLGTM、有料full E2Eを順に検証します。
5. 変更を責務ごとのConventional Commitに分け、PR #9を更新します。

## 進捗

- [x] Lokiとcodeから再送500とNext overlayの原因を特定
- [x] Webの安全なError console投影と単体テスト
- [x] Better Auth標準再送に合わせたschema、migration、Auth・DB・APIテスト
- [x] 正本文書の同期
- [x] package別検査とrootの無料gate
- [x] 実ローカル導線とLGTMの再確認
- [x] GPT-5.6 Luna有料full E2E
- [x] commit、push、PR #9更新とCI確認

## 判断記録

| 日付       | 判断                                                       | 理由                                                                         |
| ---------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 2026-08-03 | consoleは安全化した`Error`ツリーを起点ごとに1回出す        | Next overlayへ元stackを示しつつ、生の認証情報とcause recordの重複を防ぐため  |
| 2026-08-03 | Lokiは従来どおり1 causeにつき1 structured recordを維持する | trace IDから各原因を検索できる既存契約を壊さないため                         |
| 2026-08-03 | 招待pending unique indexだけを削除する                     | Better Authの時間判定による標準再送をDB制約が妨げているため                  |
| 2026-08-03 | Workerd警告を本変更で推測修正しない                        | 再送500はメール送信前のSQL制約違反で完結し、警告との因果が確認できないため   |
| 2026-08-03 | IssueリンクはAgent thread queryを含む値をcanonicalとする   | soft navigation後も同じAgent paneを開いたままにする製品・Storybook契約のため |

## 検証証跡

| command                                  | 結果 | 証跡                                                                |
| ---------------------------------------- | ---- | ------------------------------------------------------------------- |
| Better Auth CLIのtemporary schema生成    | 成功 | 標準schemaに招待pending unique indexがないことを確認                |
| `bun run --cwd packages/db db:generate`  | 成功 | `0028_chubby_blackheart.sql`が対象indexの`DROP INDEX`だけを生成     |
| Web development error focused test       | 成功 | 7件。console 1回、cause、stack、上限、redaction、sink分離           |
| DB migration focused test                | 成功 | 8件。fresh DBと0027からのupgradeで期限切れ履歴と新active rowが併存  |
| Better Auth native endpoint focused test | 成功 | 16件。activeは同じID、期限切れ後は新ID、その後は新active IDを更新   |
| API organization repository focused test | 成功 | 期限内pendingだけを`invitationCount`へ算入                          |
| Web・API・Auth・DB package gate          | 成功 | Web 482件、API 343件、Auth 64件、DB 64件。全lint・typecheck成功     |
| `bun run --cwd packages/db db:check`     | 成功 | schema履歴とdriftなし                                               |
| `bun run check`                          | 成功 | 全12 workspaceの静的解析、型検査、unit・integration test            |
| `bun run test:browser`                   | 成功 | Storybook light/dark、Browser Mode、Chromium 17件、WebKit 1件       |
| `bun run test:e2e`                       | 成功 | 決定的free E2E 7件、2 worker                                        |
| `bun run build:cloudflare`               | 成功 | Web、API、AgentのCloudflare buildとdry-run                          |
| `nix flake check`                        | 成功 | current systemのapp、package、dev shell、skill check                |
| 実ローカル招待再送                       | 成功 | expired履歴と新active rowが併存し、active再送は同じIDの期限を更新   |
| Grafana MCP Loki・Tempo                  | 成功 | 修正前500と修正後200をrequest/trace IDで相関し、Tempoにraw原因なし  |
| 修正後のWorkerdログ                      | 成功 | 期限切れ・active再送の双方でcross-request Promise警告は再現せず     |
| GPT-5.6 Luna full E2E                    | 成功 | 3件、1 worker、retry 0。thread付きcanonical Issueリンクも再読込確認 |
| PR #9 CI                                 | 成功 | head `0455bc5`、run `30761536800`。全Quality・Browser・E2E lane成功 |

CI初回は`Free E2E · Agent workflows`の`bun ci`中に、外部Socket Security Scannerのfree modeが
5分でtimeoutしました。Playwright開始前の外部要因であり、failed-only rerunでは同じheadのAgent E2Eが
3分37秒で成功しました。

## リスクとrollback

index削除後はDB単体では同一organization・emailのactive pending重複を拒否しません。作成・再送入口を
Better Auth native endpointへ限定し、標準の時間判定と更新処理を正本にします。rollbackでindexを戻すと
期限切れpending履歴と新active rowが併存するDBへ適用できないため、旧制約への単純な再作成は行いません。
問題があればnative endpointを一時停止し、データを監査してから別migrationを設計します。

## 完了条件

- Next dev overlayがreporter位置ではなく安全化された元stackとcauseを表示します。
- activeと期限切れの招待再送がBetter Auth native endpointで成功し、一覧・件数が時間判定と一致します。
- fresh migrationと0027からのupgradeが既存invitation rowを保持します。
- 全無料gate、ローカルLGTM受入、有料full E2E、PR #9のCIが成功します。
