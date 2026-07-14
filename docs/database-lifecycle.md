# Database lifecycle

## 原則

- primary DBはTurso/libSQL、schemaはSQLite/libSQL専用。
- `packages/db/drizzle/` のSQLとsnapshotを履歴の正本にする。
- 開発起動でも `drizzle-kit push` は使わず、`generate + migrate` を使う。
- seedは既存データを破壊せず、空のlocal開発DBに決定的なサンプルtenant/Issueを追加する。
- resetはlocal DBかつ明示的な確認文字列があるときだけ許可する。

## Schema変更

```sh
# 1. packages/db/src/schema を変更
bun run --cwd packages/db db:generate

# 2. SQLとsnapshotをレビュー
git diff -- packages/db/drizzle

# 3. migration historyと適用を検証
bun run --cwd packages/db db:check
bun run --cwd packages/db db:migrate
bun run --cwd packages/db test
```

生成SQLがtable rebuildを行う場合、既存列のcopy、default/backfill、外部キー作成順を必ず確認します。legacy migration testには以前のschemaを再現したfixtureを置き、role変換やdata保持をassertします。

## Seed

```sh
bun run --cwd packages/db db:seed
```

seedは `file:` またはlocalhost URLだけを受け入れます。同じlocal DBへ複数回実行でき、通常は既存userがいればskipします。Cloud Turso URLは、空DBであっても開発用fake dataの投入前に拒否します。認証plugin構成を変えた場合はBetter Auth CLIで `auth.generated.ts` を再生成し、その差分から新しいmigrationも生成します。

## 手動reset

resetはローカルURLだけを受け入れ、確認文字列を要求します。

```sh
CONFIRM_DB_RESET=reset-local-development \
  bun run --cwd packages/db db:reset
```

この操作はtableをdropし、保存済みmigrationを再適用してseedします。Cloud Turso URL、本番、共有stagingへは使いません。

## 本番migration

1. backup/restore手段とmigration SQLを確認する。
2. deploy concurrencyを1本に制限する。
3. `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` をproduction secretから注入する。
4. API deployより先に `db:migrate` を一度だけ実行する。
5. `/health`、`/ready`、認証、tenant境界をsmoke testする。

```sh
bun run --cwd packages/db db:migrate
```

破壊的な列削除はexpand/contractで分割します。先に新旧両方を読めるcodeをdeployし、backfill後に古い列を削除してください。

`db:seed` は本番provisioningに使いません。migration後、最初の実ユーザーが通常の認証とorganization作成フローを通り、transaction内で最初の `super_admin` membershipを得る経路を使います。

## Tenant整合性

- Issue番号はorganization単位でunique。
- commentは `(todo_id, organization_id)` の複合外部キーでparentと同じtenantに固定。
- membershipは `(organization_id, user_id)` をuniqueにし、同じuserのduplicate roleを作らない。
- memberがいるorganizationはexactly one `super_admin` とする。migrationはduplicateをrepairし、`role='super_admin'` のpartial unique indexがat-most-oneを保証する。at-least-oneはownership transferなどのapp transactionで維持する。
- memberがいないlegacy organizationはmigrationで架空membershipを作らず、認証・認可をfail closedにする。復旧は監査可能な運用手順で実ユーザーを割り当てる。
- pending invitationは `admin` / `member` roleだけを許可し、legacyの `owner` / `super_admin` / null /未知roleはmigrationでexpiredにする。
- repository queryも `id + organization_id` を条件にする。
- migration testで異なるtenantのcomment挿入が失敗することを確認する。

## Invitation email job

`invitation_email_jobs`は各invitationに最大1件だけ存在し、`invitation_id`へ`ON DELETE CASCADE`するdurable outboxです。invitation・audit・jobは同じtransactionで作成します。job自体にはemail、token、URL、organization/user IDを保存せず、status、attempt、lease、next retry、allowlist済みerror codeだけを置きます。

schema変更時は`db:generate`でmigrationとsnapshotを生成し、migration testで列allowlist、unique invitation、cascade、status/attempt/error code check、claim indexを確認します。emailの取消・期限切れやinvitation削除後にorphan jobを残さず、retry可能な失敗だけをscheduled processorが再claimします。

## Organization削除job

`organization_deletion_jobs`はorganization本体をhard deleteした後もR2 cleanupとHTTP retry receiptを保持するため、意図的にorganizationへの外部キーを持ちません。代わりに次の不変条件をschema・repository・migration testで維持します。

- actor user IDとidempotency keyをuniqueにし、同じkeyの別organization利用を409にする。
- jobにはslug、email、token、本文を保存せず、削除に必要なopaque IDと低cardinality status/error codeだけを置く。
- transactionはjob作成、対象organizationを指す全sessionのactive organization解除、organization cascade deleteを一体で行う。
- scheduled workerはlease期限、attempt数、next retry時刻を使い、失敗jobをhot loopさせない。完了/失敗更新はclaim時の`attempts + locked_at`が一致する場合だけ行い、lease期限切れの旧workerが新workerの状態を上書きしない。
