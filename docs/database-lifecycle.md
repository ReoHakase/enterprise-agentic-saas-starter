---
title: Database lifecycle
status: accepted
implementation: active
last_reviewed: 2026-08-23
---

# Database lifecycle

## 原則

- プライマリDBはTurso/libSQL、スキーマはSQLite/libSQL専用。
- `packages/db/drizzle-v3/`のSQLとスナップショットを実行対象の履歴の正本にする。
- `packages/db/drizzle/`は旧形式31件の不変な証拠として保持し、実行時に参照しない。
- 開発起動でも`drizzle-kit push`は使わず、`generate + migrate`を使う。
- 開発用初期データ投入は日常の`bun run dev`から分離し、必要なときだけ空のローカル開発DBへ
  決定的なサンプルテナントとIssueを追加する。
- リセットはローカルDBかつ明示的な確認文字列があるときだけ許可する。

## マイグレーション形式の切替

追記専用履歴の判断は[ADR-006](decisions/ADR-006-migration-history-append-only.md)を正本にします。

Drizzle 0.xの旧履歴をv3へ変換するときは、`packages/db/drizzle/**`を追跡対象外の一時ディレクトリへ
複製し、完全固定したDrizzle Kit `1.0.0-rc.4`の`drizzle-kit up`をその一時コピーだけへ実行します。
生成結果を`packages/db/drizzle-v3/**`へ追加し、旧履歴を直接変更しません。変換元31件と変換後31件の
時刻、意味名、SQL本文、`--> statement-breakpoint`を機械的に照合します。

既存のv3ディレクトリはSQLとスナップショットを一体として不変にし、新しいディレクトリの追加だけを
許可します。履歴検査は旧履歴の全差分と、既存v3ディレクトリの変更、削除、改名を拒否します。
ランタイム、テスト、Drizzle Kitの設定、開発コマンドはv3だけを読みます。

Drizzle v1の標準マイグレーターは、旧形式を適用済みの`__drizzle_migrations`へ`name`と
`applied_at`を追加します。既存の`id`、`hash`、`created_at`を保持し、変換後のディレクトリ名を
`name`へ既存データ補完します。旧行の`applied_at`は標準挙動どおり`NULL`のままです。その後、
適用済みのDDLを再実行せず新しいv3マイグレーションだけを適用します。
独自の読み込み処理、旧形式との二重実行、別の台帳は作りません。台帳行がローカル履歴へ対応しない
場合は、推測で修復せず失敗させます。

## スキーマ変更

```sh
# 1. packages/db/src/schema を変更
bun run --cwd packages/db db:generate

# 2. 新しいv3 SQLとsnapshotをレビューし、旧履歴が不変であることを確認
git diff -- packages/db/drizzle-v3
git diff --exit-code origin/main -- packages/db/drizzle

# 3. migration historyと適用を検証
bun run --cwd packages/db db:check
bun run --cwd packages/db db:migrate
bun run --cwd packages/db test
```

生成SQLがテーブルを再構築する場合、既存列のコピー、既定値、既存データ補完、外部キー作成順を
必ず確認します。旧形式のマイグレーションテストには以前のスキーマを再現したフィクスチャを置き、
role変換やデータ保持を検証します。

### Better Auth 1.7のアカウント識別子

Better Auth 1.7ではアカウントを`(issuer, account_id)`で識別します。移行は次の順で新しいv3
マイグレーションとして追加します。

1. `issuer`を一時的に`NULL`許容で追加し、OAuth Provider 1.7の新しいテーブル、列、インデックスを
   追記する。既存のOAuthクライアント、トークン、同意情報と`public`、`type`、認証方式を削除しない。
2. このリポジトリが信頼する`credential`を`local:credential`、GitHubを
   `local:oauth:github`へ既存データ補完する。未知のプロバイダー、`credential`の`account_id`と
   `user_id`の不一致、補完後の重複、秘密情報を持たない非公開OAuthクライアントは失敗時に拒否する。
3. `issuer`を`NOT NULL`にし、`(issuer, account_id)`の一意制約を追加する。

この段階移行は既存データを推測で別の識別子へ結び付けないためのものです。Better AuthのCLIで
生成した最終スキーマと照合し、Relations v2の認証`adapter`へ同じテーブルと`relations`を渡します。

旧版の開発用初期データ投入は`credential`の`account_id`へメールアドレスを入れていたため、その
フィクスチャを持つローカルDBも識別子不一致として意図的に拒否します。開発サーバーを停止して
`bun run dev:db:reset`でローカルデータを作り直し、必要な場合だけ新しい初期データを投入します。
既存行を手動で書き換えて移行を通さず、遠隔DBや本番DBへこのリセット手順を使いません。

MCP resourceのURLは環境固有なので、既存OAuthクライアントへ`oauth_client_resource`行をSQLで
推測して追加しません。Authのサーバー構成が単一resourceを`resources`へ登録し、requestでも
完全一致を要求したうえで、1.7のクライアント単位resource制約を明示的に無効にします。これにより
既存クライアントとトークンを再登録せず、従来と同じresource境界を維持します。

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

既存userがあるpre-file seed DBへfile fixtureだけを後付けしません。完全に作り直す場合はdev server停止後に`bun run dev:db:reset`を実行し、fixtureが必要な場合だけ`bun run dev:db:seed`、その後`bun run dev`の順に実行します。manifest rowを利用者が削除した後の通常seedでも復活させません。

## 手動リセット

resetはローカルURLだけを受け入れ、確認文字列を要求します。

```sh
CONFIRM_DB_RESET=reset-local-development \
  bun run --cwd packages/db db:reset
```

この操作はテーブルを削除し、保存済みのv3マイグレーションを再適用してから開発用初期データを
投入します。Cloud Turso URL、本番、共有ステージングへは使いません。

## 本番マイグレーション

1. バックアップと復元手段、マイグレーションSQLを確認する。
2. 同時に実行する導入処理を1本に制限する。
3. `TURSO_DATABASE_URL`と`TURSO_AUTH_TOKEN`を本番のシークレットから注入する。
4. API導入より先に`db:migrate`を1回だけ実行する。
5. `/health`、`/ready`、認証、テナント境界をスモークテストする。

```sh
bun run --cwd packages/db db:migrate
```

破壊的な列削除は段階的に分割します。先に新旧両方を読めるコードを導入し、既存データ補完後に
古い列を削除してください。

`db:seed`は本番準備に使いません。マイグレーション後、最初の実ユーザーが通常の認証と
organization作成フローを通り、Better Authの標準処理で最初の`owner` membershipを得る経路を
使います。

Drizzle v1、Better Auth 1.7への更新作業は、本番への導入と遠隔データベースの変更を含みません。
本番で初めて適用するときは、上記の手順と個別の明示承認が必要です。

## 切り戻し

Drizzle v1のマイグレーションを初めて適用する前は、変更全体を元の0.xランタイムへ戻せます。
標準マイグレーターが台帳へ`name`と`applied_at`を追加した後は、旧ランタイムへ戻す場合も追加列を
削除しません。新しいv3マイグレーションを適用した後は旧形式へ戻さず、追加のv3マイグレーションで
前方修正します。本番データの切替前には別作業でバックアップ、件数、復元手順を確認します。

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
