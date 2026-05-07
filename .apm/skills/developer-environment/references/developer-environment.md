# Developer Environment Reference

## 役割

```txt
nix develop / direnv (use flake):
  flake.nix の devShell: bun（flake.lock 固定の nixpkgs の `pkgs.bun`）, turso-cli (turso), sqld, dotenvx, apm（[numtide/llm-agents.nix](https://github.com/numtide/llm-agents.nix) の `packages.<system>.apm`）
  checks.devShell で `nix flake check` が devShell ビルドを検証

direnv:
  .envrc は `use flake` のみ。portless 用の `NODE_EXTRA_CA_CERTS`（`~/.portless/ca.pem`）は `flake.nix` の devShell `shellHook` で設定する。
  長い `direnv: export` 行を抑えるには `config/direnv/direnv.toml` を `~/.config/direnv/direnv.toml` にコピーまたはマージ（`hide_env_diff`）。

dotenvx:
  secretをenvファイルから読み込む（devShell に nixpkgs の dotenvx を含める）

Turso local dev:
  `turso dev` は `sqld` をPATHから起動する。Turso CLIがあっても `sqld` が無いとlocal dev DBは起動しない。Cloud DB作成は `turso auth login` が前提。

品質ゲート（ローカル）:
  flake 変更時、lefthook pre-commit で Nix がある場合のみ `nix flake check`

CI:
  GitHub Actions の `nix` ジョブが `nix flake check` を Quality ジョブと並列実行

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
