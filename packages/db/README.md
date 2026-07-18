# @enterprise-agentic-saas/db

Turso/libSQL + Drizzle ORMのsingleton DB、schema、migration、開発seedを提供します。

## Entrypoints

| import | 内容 |
| --- | --- |
| `@enterprise-agentic-saas/db` | singleton `db`、`Db`型 |
| `@enterprise-agentic-saas/db/development-seed` | local R2 reconcile用の固定anchor、file fixture path・digest |
| `@enterprise-agentic-saas/db/schema` | auth/app table定義 |

`packages/auth` と `apps/api` からの依存を許可し、DB packageからauth/app/UIへの逆依存は禁止します。PostgreSQLや `DB_PROVIDER` 分岐は明示要求まで追加しません。

## Schemaとmigration

- `src/schema/auth.generated.ts`: Better Auth CLI生成を起点とするauth schema
- `src/schema/app.ts`: Issue/comment/file/auditなどapp schema
- `fixtures/files/`: local R2へ投入する決定的なfile fixture
- `drizzle/`: commitするSQL、snapshot、journal

auth plugin変更時:

```sh
bunx @better-auth/cli generate \
  --config packages/auth/src/index.ts \
  --output packages/db/src/schema/auth.generated.ts \
  --yes
bun run --cwd packages/db db:generate
git diff -- packages/db/src/schema/auth.generated.ts packages/db/drizzle
```

repo固有のindex/defaultがgenerator差分で消えていないことを確認します。開発中も `drizzle-kit push` は使いません。

## Env

| 変数 | 必須 | 説明 |
| --- | --- | --- |
| `TURSO_DATABASE_URL` | Yes | Turso/libSQL URL |
| `TURSO_AUTH_TOKEN` | Cloudのみ | Turso token |

APIとDB workspaceで同じURL/tokenを使います。実値はpackage直下のignored `.env*` に置きます。

## Scripts

通常はrepo rootからTurbo経由で起動します。これにより `db:turso` も同時に起動し、接続待機と`generate + migrate`を行います。日常のdev起動ではseedやtestを実行しません。

```sh
bunx turbo run dev --filter=@enterprise-agentic-saas/db
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

seedとresetは `file:` またはlocalhost URLだけを許可します。resetはさらに確認文字列を要求し、migration ledgerを含むtableを削除、保存済みmigrationを全適用してからseedします。Cloud/staging/production URLはどちらも拒否します。本番provisioningでは `db:seed` を使わず、migration適用後に実ユーザーを通常の認証・organization作成フローから初期管理者にします。

fresh seedは固定anchorと7件の `pending` file rowを作り、quotaにはpending bytesも含めます。R2 objectとimage metadataの確定はAPIのlocal reconcileが担当します。通常の再実行は既存userがあればskipするため、利用者が削除したfixture rowを復活させません。

DBとlocal R2のfixtureが必要な場合は、rootの`bun run dev`を起動したまま別terminalで明示実行します。

```sh
bun run seed:local
```

これはmigration確認、DB seed、R2 reconcileを行うfixture provisioning commandで、通常のdevやtestには含まれません。local dataを完全に作り直す場合はdev停止後に`bun run dev:data:reset`、`bun run dev`、任意の`bun run seed:local`の順に実行します。

詳細は [`../../docs/database-lifecycle.md`](../../docs/database-lifecycle.md) を参照してください。

## Test

`src/migrations.test.ts` と `src/files.test.ts` はin-memory/fresh DB、legacy data変換、membership/super admin invariant、file owner tenant FK、quota/cleanup制約、fixture digest、seedのtransaction rollback・再現性・非破壊再実行、remote seed拒否、実file DB resetを検証します。外部TursoやR2は必要ありません。
