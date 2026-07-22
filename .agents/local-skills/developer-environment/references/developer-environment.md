# Developer Environment Reference

## 役割

```txt
nix develop / direnv (use flake):
  flake.nix の devShell: bun（flake.lock 固定の nixpkgs の `pkgs.bun`）, turso-cli (turso), sqld, dotenvx, curl, jq
  flake.nix は inputs / skill bundle / MCP config / sync-agent-config / devShell / public outputs を1ファイルにまとめ、各blockの担当をコメントで明示する
  `sync-agent-config`: agent-skills-nix の local install script + mcp-servers-nix flake-parts module の VS Code workspace shellHook + Codex/Cursor向け symlink を合成する
  checks.devShell / checks.agent-skills で `nix flake check` が検証

direnv:
  .envrc は `use flake` のみ。portless 用の `NODE_EXTRA_CA_CERTS`（`~/.portless/ca.pem`）は `flake.nix` の devShell `shellHook` で設定する。
  長い `direnv: export` 行を抑えるには `config/direnv/direnv.toml` を `~/.config/direnv/direnv.toml` にコピーまたはマージ（`hide_env_diff`）。

dotenvx:
  secretをenvファイルから読み込む（devShell に nixpkgs の dotenvx を含める）

Turso local dev:
  `turso dev` は `sqld` をPATHから起動する。Turso CLIがあっても `sqld` が無いとlocal dev DBは起動しない。Cloud DB作成は `turso auth login` が前提。

workspace CLI:
  Wrangler/OpenNext/Playwright/Storybookはroot catalogでversion固定し、package scriptから実行する。Nix dev shellへ同じCLIを追加してversion sourceを二重化しない。

品質ゲート（ローカル）:
  flake 変更時、lefthook pre-commit で Nix がある場合のみ `nix flake check`

CI:
  GitHub Actions の `nix` ジョブが `nix flake check` を Quality ジョブと並列実行

agent skills:
  repo固有skillは `.agents/local-skills` が正本。`.agents/skills` はrepo-local skillと外部skillをまとめたNix生成物なので、repo内で直接編集しない。

MCP:
  VS Code workspace の `.vscode/mcp.json` は `mcp-servers-nix.flakeModule` の `config.mcp-servers.shellHook` に任せる
  Codex の `.mcp.toml` と Cursor の `.cursor/mcp.json` は module の自動 symlink 対象外なので、`mcp-servers-nix.lib.mkConfig` と `sync-agent-config` 内の薄い symlink で補助生成する
  next-devtools-mcp, chrome-devtools-mcpなどは nixpkgs の `pkgs.bun` から `bunx` を起動する
```

## secret

- secret入りの `.env.development`, `.env.test`, `.env.local` はgitに入れない（各 **実行パッケージ** 直下。例: `apps/api/.env.local`, `packages/db/.env.local`）。
- 共有用のenv templateはsecret値を入れずに各パッケージの `.env.example` へ置く（例: [`apps/api/.env.example`](../../../../apps/api/.env.example)、[`packages/db/.env.example`](../../../../packages/db/.env.example)）。
- Bun は **cwd** の `.env` → `NODE_ENV` に応じた `.env.development` / `.env.test` / `.env.production` → `.env.local` を自動読込する。`bun --cwd apps/api run dev` なら `apps/api/.env*` が読まれる。`bun --env-file=../../...` は使わない。
- ローカルでは API と DB で `TURSO_DATABASE_URL` を揃える（`apps/api` と `packages/db` に同じ値を書く）。
- secret値をskill/reference/docsに書かない。
- CIではGitHub Secretsやdotenvxの安全な注入を使う。
- Cloudflare Worker local envは `apps/*/.dev.vars`、key templateは `.dev.vars.example`。productionはCloudflare vars/secretsとGitHub Environmentを使う。
- public envは `NEXT_PUBLIC_*` だけ。

## agent向け記録

実装中にrepo固有の判断が増えたら、`.agents/local-skills` にある関連skillの `SKILL.md` に短く追加する。長いコード例や設定例は `references/` に移す。

新規skillにする目安:

- 既存skillのdescriptionでは発火しにくい。
- その関心ごとだけで独立したタスクが何度も発生する。
- agentが誤判断しやすい固有ルールがある。
