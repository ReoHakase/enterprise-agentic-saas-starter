# @enterprise-agentic-saas/db

Turso/libSQLとDrizzle ORMの単一DBクライアント、スキーマ、マイグレーション、開発用初期データ投入を
提供します。

## Entrypoints

| import                                         | 内容                                                        |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `@enterprise-agentic-saas/db`                  | singleton `db`、`Db`型                                      |
| `@enterprise-agentic-saas/db/development-seed` | local R2 reconcile用の固定anchor、file fixture path・digest |
| `@enterprise-agentic-saas/db/schema`           | auth/app table定義                                          |

`packages/auth` と `apps/api` からの依存を許可し、DB packageからauth/app/UIへの逆依存は禁止します。PostgreSQLや `DB_PROVIDER` 分岐は明示要求まで追加しません。

## Schemaとmigration

- `src/schema/auth.generated.ts`: Better Auth CLI生成を起点とするauth schema
- `src/schema/oauth-provider.ts`: Better Auth OAuth Provider CLI出力と照合するOAuthテーブル。既存の
  テナント固有インデックスを保持するため生成ファイルから分離する
- `src/schema/relations.ts`: 認証とOAuth Providerを統合したDrizzle Relations v2の正本
- `src/schema/app.ts`: Issue/comment/file/profile image/auditなどapp schema
- `fixtures/files/`: local R2へ投入する決定的なfile fixture
- `drizzle/`: Drizzle 0.xで作成した31件の読み取り専用履歴。実行時には参照しない
- `drizzle-v3/`: Drizzle v1が実行する追記専用のSQLとスナップショット

auth plugin変更時:

```sh
bunx auth@1.7.1 generate \
  --config packages/auth/src/index.ts \
  --output /tmp/enterprise-agentic-saas-auth.generated.ts \
  --yes
bun run --cwd packages/db db:generate
git diff -- packages/db/src/schema/auth.generated.ts \
  packages/db/src/schema/oauth-provider.ts \
  packages/db/src/schema/relations.ts \
  packages/db/drizzle-v3
git diff --exit-code origin/main -- packages/db/drizzle
```

OAuth Providerのtable contractをCLI出力と照合し、リポジトリ固有のindexとdefaultが
マイグレーション差分で消えていないことを確認します。CLI出力で`auth.generated.ts`を直接上書き
しません。新しいマイグレーションは`drizzle-v3/<timestamp>_<tag>/`へ追加し、既存のv3
ディレクトリと旧履歴を変更しません。開発中も`drizzle-kit push`は使いません。

旧形式からv3への変換が必要な場合だけ、追跡対象外の一時コピーへ固定版`drizzle-kit up`を実行します。
リポジトリ内の`drizzle/**`へ直接実行しません。詳細は
[`../../docs/decisions/ADR-006-migration-history-append-only.md`](../../docs/decisions/ADR-006-migration-history-append-only.md)
を参照してください。

## Env

| 変数                 | 必須      | 説明             |
| -------------------- | --------- | ---------------- |
| `TURSO_DATABASE_URL` | Yes       | Turso/libSQL URL |
| `TURSO_AUTH_TOKEN`   | Cloudのみ | Turso token      |

APIとDB workspaceで同じURL/tokenを使います。実値はpackage直下のignored `.env*` に置きます。

## Scripts

通常はrepo rootからTurbo経由で起動します。これにより `db:turso` も同時に起動し、接続待機と`generate + migrate`を行います。日常のdev起動ではseedやtestを実行しません。

```sh
bun run dev:db
```

package directoryで `bun run dev` だけを実行してもTurboの `with` 関係は適用されません。個別scriptは手動実行や診断用です。

```sh
bun run --cwd packages/db db:turso      # 永続化local Turso
bun run --cwd packages/db db:bootstrap  # local確認 → wait → generate → migrate
bun run --cwd packages/db db:generate
bun run --cwd packages/db db:check
bun run --cwd packages/db db:migrate
bun run --cwd packages/db db:seed       # local URL限定、既存userがいれば非破壊skip
bun run --cwd packages/db db:studio
bun run --cwd packages/db test
```

local DBを手動で作り直す場合だけ:

```sh
CONFIRM_DB_RESET=reset-local-development \
  bun run --cwd packages/db db:reset
```

開発用初期データ投入とリセットは`file:`またはlocalhost URLだけを許可します。リセットはさらに
確認文字列を要求し、マイグレーション台帳を含むテーブルを削除、保存済みのv3マイグレーションを
全適用してから開発用初期データを投入します。Cloud、ステージング、本番URLはどちらも拒否します。
本番準備では`db:seed`を使わず、
マイグレーション適用後に実ユーザーを通常の認証とorganization作成フローから初期管理者にします。

fresh seedは固定anchorと7件の `pending` file rowを作り、quotaにはpending bytesも含めます。R2 objectとimage metadataの確定はAPIのlocal reconcileが担当します。通常の再実行は既存userがあればskipするため、利用者が削除したfixture rowを復活させません。

DBとlocal R2のfixtureが必要な場合は、rootから明示実行します。full devの起動前でも、起動中でも利用できます。

```sh
bun run dev:db:seed
```

これはlocal fixture provisioning commandです。healthyなAPI dev sessionがあれば再利用し、なければlocal Tursoが停止中の場合だけ一時起動してmigrationを適用し、`apps/api/.wrangler/state`を使うloopback限定Wrangler経由でDB seedとR2 reconcileを行います。終了時はcommand自身が起動したprocessだけを停止します。通常のdevやtestには含まれず、production/remote targetは拒否します。rootの`seed` aliasとproduction seed commandはありません。

初回からfixtureが必要な場合は`bun run dev:db:seed`の後に`bun run dev`を起動します。local dataを完全に作り直す場合はdev停止後に`bun run dev:db:reset`、任意の`bun run dev:db:seed`、`bun run dev`の順に実行します。

詳細は [`../../docs/database-lifecycle.md`](../../docs/database-lifecycle.md) を参照してください。

## Test

`src/migrations/{fresh,upgrades,invariants,lifecycle}.test.ts`と`src/files.test.ts`は、v3履歴からの
新規DB構築、旧台帳からの標準v1更新とDDL非再実行、旧31件と変換後31件の対応、旧形式データ変換、
Better Auth 1.7の`issuer`移行、OAuthデータ保持、所属関係と単一`owner`の不変条件、ファイル所有者の
テナント外部キー、プロフィール画像の主体、準備完了状態、冪等性制約、容量と削除処理の制約、
フィクスチャのダイジェスト、開発用初期データ投入のトランザクションロールバック、再現性、
非破壊再実行、遠隔データベースへの投入拒否、実ファイルDBのリセットを検証します。
外部TursoやR2は必要ありません。
