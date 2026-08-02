---
title: Database lifecycle
status: accepted
implementation: active
last_reviewed: 2026-07-25
---

# Database lifecycle

## 原則

- primary DBはTurso/libSQL、schemaはSQLite/libSQL専用。
- `packages/db/drizzle/` のSQLとsnapshotを履歴の正本にする。
- 開発起動でも `drizzle-kit push` は使わず、`generate + migrate` を使う。
- seedは日常の`bun run dev`から分離し、必要なときだけ空のlocal開発DBに決定的なサンプルtenant/Issueを追加する。
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

`bun run dev`はlocal Tursoへの接続待機と`generate + migrate`だけを行い、seedやtestを実行しません。migration済みの空DBから通常のsignupを開始できるため、seedは初回起動やreset後の必須手順ではありません。fixtureが必要な場合だけ、full devの起動前または起動中にroot commandを使います。

```sh
bun run dev:db:seed
```

このcommandはhealthyなloopback API dev sessionがあれば既存Workerを再利用します。sessionがなければlocal Tursoが停止中の場合だけ一時起動し、`generate + migrate`、DB seed、`apps/api/.wrangler/state`を使う一時Wrangler経由のR2 reconcileを順に行います。終了時はcommand自身が起動したprocessだけを停止し、既存のdev processや永続化したDB/R2 stateには触れません。fixture provisioning用であり、test commandではありません。production seed commandとrootの`seed` aliasは用意せず、この実装自体もproduction、remote Turso、remote Workerを拒否します。

DB seedだけを明示実行する場合:

```sh
bun run --cwd packages/db db:seed
```

seedは `file:` またはlocalhost URLだけを受け入れます。同じlocal DBへ複数回実行でき、通常は既存userがいればskipします。Cloud Turso URLは、空DBであっても開発用fake dataの投入前に拒否します。fresh DBでは固定anchor user/organization/Issueとseed 42の通常dataに加え、file manifestのpending row、typed owner、pending分を含むorganization usageを1 transactionで作成します。fixture bytesはDB processからR2へ直接書かず、local API Workerのbinding経由でready化します。認証plugin構成を変えた場合はBetter Auth CLIで `auth.generated.ts` を再生成し、その差分から新しいmigrationも生成します。

既存userがあるpre-file seed DBへfile fixtureだけを後付けしません。完全に作り直す場合はdev server停止後に`bun run dev:db:reset`を実行し、fixtureが必要な場合だけ`bun run dev:db:seed`、その後`bun run dev`の順に実行します。manifest rowを利用者が削除した後の通常seedでも復活させません。

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

`db:seed` は本番provisioningに使いません。migration後、最初の実ユーザーが通常の認証とorganization作成フローを通り、Better Authの標準処理で最初の`owner` membershipを得る経路を使います。

## Tenant整合性

- Issue番号はorganization単位でunique。
- commentとactivityは `(issue_id, organization_id)` の複合外部キーでparentと同じtenantに固定。
- membershipは `(organization_id, user_id)` をuniqueにし、同じuserのduplicate roleを作らない。
- memberがいるorganizationはexactly one `owner` とする。`0027_nostalgic_sugar_man`はlegacyの`super_admin`を`owner`へ変換し、`role='owner'`のpartial unique indexがat-most-oneを保証する。at-least-oneはownership transferなどのapp transactionで維持する。
- memberがいないlegacy organizationはmigrationで架空membershipを作らず、認証・認可をfail closedにする。復旧は監査可能な運用手順で実ユーザーを割り当てる。
- pending invitationは `admin` / `member` roleだけを許可し、legacyの `owner` / `super_admin` / null /未知roleはmigrationでexpiredにする。
- `0028_chubby_blackheart`はpending invitationのorganization・email partial unique indexを削除する。期限切れ時点でもstatusがpendingの履歴rowと、新しいactive pending rowの併存を許し、作成・再送の時間判定はBetter Auth native endpointへ委ねる。招待一覧はread時にstatusを変更せず期限切れを投影し、件数は`status = pending`かつ`expires_at > now`だけを数える。
- repository queryも `id + organization_id` を条件にする。
- migration testで異なるtenantのcomment挿入が失敗することを確認する。

## Organization招待メール

organization招待はBetter Authの標準invitation rowと`sendInvitationEmail`コールバックを使います。
`invitation_email_jobs`、配送attempt、lease、自動再試行は所有しません。メール送信はbest-effortで、失敗しても
invitation rowは維持します。migration testではlegacy `outbox`が削除され、invitation rowとrole変換が
保たれることを確認します。

## Organization削除job

`organization_deletion_jobs`はorganization本体をhard deleteした後もR2 cleanupとHTTP retry receiptを保持するため、意図的にorganizationへの外部キーを持ちません。代わりに次の不変条件をschema・repository・migration testで維持します。

- actor user IDとidempotency keyをuniqueにし、同じkeyの別organization利用を409にする。
- jobにはslug、email、token、本文を保存せず、削除に必要なopaque IDと低cardinality status/error codeだけを置く。
- transactionはjob作成、対象organizationを指す全sessionのactive organization解除、organization cascade deleteを一体で行う。
- scheduled workerはlease期限、attempt数、next retry時刻を使い、失敗jobをhot loopさせない。完了/失敗更新はclaim時の`attempts + locked_at`が一致する場合だけ行い、lease期限切れの旧workerが新workerの状態を上書きしない。
