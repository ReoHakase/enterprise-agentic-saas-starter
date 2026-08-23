---
title: Database lifecycle
status: accepted
implementation: active
last_reviewed: 2026-08-24
---

# Database lifecycle

## 原則

- プライマリDBはTurso/libSQL、スキーマはSQLite/libSQL専用。
- `packages/db/drizzle-v3/`のSQLとスナップショットだけをマイグレーション履歴の正本にする。
- Drizzle v1更新を含む変更では単一の基準マイグレーションから新規データベースを作成し、過去の
  データベースからの更新を支援しない。
- 開発起動でも`drizzle-kit push`は使わず、`generate + migrate`を使う。
- 開発用初期データ投入は日常の`bun run dev`から分離し、必要なときだけ空のローカル開発DBへ
  決定的なサンプルテナントとIssueを追加する。
- リセットはローカルDBかつ明示的な確認文字列があるときだけ許可する。

## 基準マイグレーションと追記

追記専用履歴の判断は[ADR-006](decisions/ADR-006-migration-history-append-only.md)を正本にします。

Drizzle v1更新を含む変更では、
`packages/db/drizzle-v3/20260823163505_baseline/{migration.sql,snapshot.json}`だけを実行対象にします。
空のデータベースへ適用すると、現在のテーブル、列、インデックス、外部キー、検査制約、リポジトリ
所有のトリガー、現在有効なLunaの料金行を作成します。マイグレーション台帳にはこの基準
マイグレーションの1行だけを記録します。

本番データベースはまだ存在しません。過去の履歴を適用済みのデータベース、過去のマイグレーション
台帳、既存データを移行する経路は持ちません。ローカル開発データベースはリセットし、必要な場合だけ
開発用初期データを投入します。

基準マイグレーションは`main`へ取り込まれた時点から不変にします。以後のスキーマ変更とデータ移行は
`packages/db/drizzle-v3/<YYYYMMDDHHmmss>_<tag>/{migration.sql,snapshot.json}`を完全な新規
ディレクトリとして追加します。独自の読み込み処理、複数履歴の二重実行、別のマイグレーション台帳は
作りません。

## スキーマ変更

```sh
# 1. packages/db/src/schema を変更
bun run --cwd packages/db db:generate

# 2. 新しいv3 SQLとsnapshotをレビュー
git diff -- packages/db/drizzle-v3

# 3. migration historyと適用を検証
bun run --cwd packages/db db:check
bun run --cwd packages/db db:migrate
bun run --cwd packages/db test
```

基準マイグレーションでは現在のスキーマに加え、Drizzle Kitだけでは生成できないリポジトリ所有の
トリガーと現在有効なLunaの料金行が含まれることを確認します。基準マイグレーションが`main`へ
取り込まれた後に生成SQLがテーブルを再構築する場合は、既存列のコピー、既定値、既存データ補完、
外部キー作成順を必ず確認します。

### Better Auth 1.7のアカウント識別子

Better Auth 1.7ではアカウントを`(issuer, account_id)`で識別します。基準マイグレーションは最初から
`issuer NOT NULL`と`(issuer, account_id)`の一意制約を持ち、OAuth Provider 1.7のリソース、
クライアントアサーション、トークン、同意情報を含む最終スキーマを作成します。Better AuthのCLIで
生成した最終スキーマと照合し、Relations v2の認証`adapter`へ同じテーブルと`relations`を渡します。

新しい認証情報アカウントは`issuer = 'local:credential'`、新しいGitHubアカウントは
`issuer = 'local:oauth:github'`で作成します。既存行を補完するマイグレーションは持ちません。以前の
フィクスチャを持つローカルデータベースは、開発サーバーを停止して`bun run dev:db:reset`で作り直し、
必要な場合だけ新しい初期データを投入します。遠隔データベースへこのリセット手順を使いません。

Authのサーバー構成は環境ごとの単一resourceを`resources`へ登録し、requestでも完全一致を要求します。
resource管理ルートを公開せず、動的登録クライアントごとのresource行を作る導線も持たないため、1.7の
クライアント単位resource制約を明示的に無効にします。

## 開発用初期データ投入

`bun run dev`はlocal Tursoへの接続待機と`generate + migrate`だけを行い、seedやtestを実行しません。migration済みの空DBから通常のsignupを開始できるため、seedは初回起動やreset後の必須手順ではありません。fixtureが必要な場合だけ、full devの起動前または起動中にroot commandを使います。

```sh
bun run dev:db:seed
```

このcommandはhealthyなloopback API dev sessionがあれば既存Workerを再利用します。sessionがなければlocal Tursoが停止中の場合だけ一時起動し、`generate + migrate`、DB seed、`apps/api/.wrangler/state`を使う一時Wrangler経由のR2 reconcileを順に行います。終了時はcommand自身が起動したprocessだけを停止し、既存のdev processや永続化したDB/R2 stateには触れません。fixture provisioning用であり、test commandではありません。production seed commandとrootの`seed` aliasは用意せず、この実装自体もproduction、remote Turso、remote Workerを拒否します。

DB seedだけを明示実行する場合:

```sh
bun run --cwd packages/db db:seed
```

`db:seed`は`file:`またはlocalhost URLだけを受け入れます。同じローカルDBへ複数回実行でき、通常は
既存userがいれば省略します。Cloud Turso URLは、空DBであっても開発用`fake`データの投入前に
拒否します。Drizzle Seedは`1.0.0-rc.4`と生成器の`version`を明示し、同じseedから同じ意味の
フィクスチャを生成します。新規DBでは固定anchor user、organization、Issueとseed 42の通常データに
加え、file manifestのpending行、型付きowner、pending分を含むorganization usageを1つの
トランザクションで作成します。フィクスチャのバイト列はDBプロセスからR2へ直接書かず、ローカル
API Workerのbinding経由でready化します。認証プラグイン構成を変えた場合はBetter Auth CLIで
`auth.generated.ts`を一時ファイルへ再生成し、その差分から新しいv3マイグレーションも生成します。

ローカルデータを完全に作り直す場合はdev server停止後に`bun run dev:db:reset`を実行し、fixtureが
必要な場合だけ`bun run dev:db:seed`、その後`bun run dev`の順に実行します。開発用初期データ投入は
任意であり、リセットから自動実行しません。manifest rowを利用者が削除した後の通常seedでも
復活させません。

## 手動リセット

resetはローカルURLだけを受け入れ、確認文字列を要求します。

```sh
CONFIRM_DB_RESET=reset-local-development \
  bun run --cwd packages/db db:reset
```

このDB単体の操作はテーブルを削除し、保存済みのv3マイグレーションを再適用してからDBの開発用
初期データを投入します。R2 fixtureも含めて作り直す公開手順では、rootの`bun run dev:db:reset`後に
必要な場合だけ`bun run dev:db:seed`を実行します。Cloud Turso URL、本番、共有ステージングへは
使いません。

## 本番マイグレーション

本番データベースはまだ作成されていません。初回は空のデータベースへ基準マイグレーションを適用し、
過去のマイグレーション台帳やデータを取り込みません。本番への導入と遠隔データベースの作成・変更は
個別の明示承認が必要です。

1. バックアップと復元手段、マイグレーションSQLを確認する。
2. 同時に実行する導入処理を1本に制限する。
3. `TURSO_DATABASE_URL`と`TURSO_AUTH_TOKEN`を本番のシークレットから注入する。
4. API導入より先に`db:migrate`を1回だけ実行する。
5. `/health`、`/ready`、認証、テナント境界をスモークテストする。

```sh
bun run --cwd packages/db db:migrate
```

永続データベースの運用開始後に破壊的な列削除が必要になった場合は段階的に分割します。先に移行中の
両方の状態を扱えるコードを導入し、必要なデータ移行後に不要な列を削除してください。

`db:seed`は本番準備に使いません。マイグレーション後、最初の実ユーザーが通常の認証と
organization作成フローを通り、Better Authの標準処理で最初の`owner` membershipを得る経路を
使います。

Drizzle v1、Better Auth 1.7への更新作業は、本番への導入と遠隔データベースの変更を含みません。

## 切り戻し

永続データベースが存在しない間は、コードを切り戻してローカル開発データベースを再度リセットします。
基準マイグレーションが`main`へ取り込まれた後は基準を編集せず、追加のv3マイグレーションで前方修正
します。将来の本番データ切替前には別作業でバックアップ、件数、復元手順を確認します。

## Tenant整合性

- Issue番号はorganization単位でunique。
- commentとactivityは `(issue_id, organization_id)` の複合外部キーでparentと同じtenantに固定。
- membershipは `(organization_id, user_id)` をuniqueにし、同じuserのduplicate roleを作らない。
- memberがいるorganizationはexactly one `owner` とする。`role='owner'`のpartial unique indexが
  at-most-oneを保証し、at-least-oneはownership transferなどのapp transactionで維持する。
- memberがいないorganizationは認証・認可をfail closedにする。
- pending invitationは`admin` / `member` roleだけを許可する。
- 期限切れ時点でもstatusがpendingの履歴rowと、新しいactive pending rowの併存を許し、作成・再送の
  時間判定はBetter Auth native endpointへ委ねる。招待一覧はread時にstatusを変更せず期限切れを投影し、
  件数は`status = pending`かつ`expires_at > now`だけを数える。
- repository queryも `id + organization_id` を条件にする。
- migration testで異なるtenantのcomment挿入が失敗することを確認する。

## Organization招待メール

organization招待はBetter Authの標準invitation rowと`sendInvitationEmail`コールバックを使います。
`invitation_email_jobs`、配送attempt、lease、自動再試行は所有しません。メール送信はbest-effortで、失敗しても
invitation rowは維持します。DBテストでは現在のinvitation role制約を確認し、Authテストでは作成と
再送が標準endpointからemail commandを発行することを確認します。

## Organization削除job

`organization_deletion_jobs`はorganization本体をhard deleteした後もR2 cleanupとHTTP retry receiptを保持するため、意図的にorganizationへの外部キーを持ちません。代わりに次の不変条件をschema・repository・migration testで維持します。

- actor user IDとidempotency keyをuniqueにし、同じkeyの別organization利用を409にする。
- jobにはslug、email、token、本文を保存せず、削除に必要なopaque IDと低cardinality status/error codeだけを置く。
- transactionはjob作成、対象organizationを指す全sessionのactive organization解除、organization cascade deleteを一体で行う。
- scheduled workerはlease期限、attempt数、next retry時刻を使い、失敗jobをhot loopさせない。完了/失敗更新はclaim時の`attempts + locked_at`が一致する場合だけ行い、lease期限切れの旧workerが新workerの状態を上書きしない。
