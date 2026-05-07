# Developer Environment Reference

## 役割

```txt
nix develop:
  Bun, Node系CLI, apm, dotenvx, turso CLI, sqld, playwright dependenciesなどを定義

direnv:
  repoに入ったときnix developやenv読込を有効化

dotenvx:
  secretをenvファイルから読み込む

Turso local dev:
  `turso dev` は `sqld` をPATHから起動する。Turso CLIがあっても `sqld` が無いとlocal dev DBは起動しない。Cloud DB作成は `turso auth login` が前提。

APM:
  .apm/skills, instructions, promptsを管理

MCP:
  nextjs, playwright, turso, context7などで実装確認
```

## secret

- secret入りの `.env.development`, `.env.test`, `.env.local` はgitに入れない（各 **実行パッケージ** 直下。例: `apps/api/.env.local`, `packages/db/.env.local`）。
- 共有用のenv templateはsecret値を入れずに各パッケージの `.env.example` へ置く（ルート [`.env.example`](../../../.env.example) はパス索引）。
- Bun は **cwd** の `.env` → `NODE_ENV` に応じた `.env.development` / `.env.test` / `.env.production` → `.env.local` を自動読込する。`bun --cwd apps/api run dev` なら `apps/api/.env*` が読まれる。`bun --env-file=../../...` は使わない。
- ローカルでは API と DB で `TURSO_DATABASE_URL` を揃える（`apps/api` と `packages/db` に同じ値を書く）。
- secret値をskill/reference/docsに書かない。
- CIではGitHub Secretsやdotenvxの安全な注入を使う。
- public envは `NEXT_PUBLIC_*` だけ。

## agent向け記録

実装中にrepo固有の判断が増えたら、関連skillの `SKILL.md` に短く追加する。長いコード例や設定例は `references/` に移す。

新規skillにする目安:

- 既存skillのdescriptionでは発火しにくい。
- その関心ごとだけで独立したタスクが何度も発生する。
- agentが誤判断しやすい固有ルールがある。
