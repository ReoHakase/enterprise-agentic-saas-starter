---
name: developer-environment
description: enterprise-agentic-saas-starterのnix develop、Bun、agent-skills-nix、mcp-servers-nix、direnv、dotenvx、secret読み込み、MCP設定(nextjs/playwright/turso/context7)、開発環境bootstrap、agent向けドキュメント化ルールを変更するときに使う。
---

# Developer Environment

このskillは開発環境、secret注入、MCP、agent向けドキュメント化のルールを変えるときに使う。

## 方針

- 開発環境は `nix develop` で定義する。
- Bunはpackage manager/runtimeとして使う。
- repo固有skillは `.agents/local-skills` を正本としてgit管理する。
- `.agents/skills` は `agent-skills-nix` が生成するagent実行用ディレクトリとして扱い、直接編集しない。
- 外部skillとMCP設定は `agent-skills-nix` / `mcp-servers-nix` を `flake.lock` でpinし、`nix develop` の `sync-agent-config` で生成する。
- 生成されたskill（例: `.agents/skills/next-best-practices`, `.agents/skills/developer-environment`）はこのrepoで直接編集しない。
- direnvでrepoに入ったときの環境読込を行う。
- dotenvxでsecretをenvファイルから安全に読み込む。secretをsourceやdocsへ書かない。
- MCPはNext.js、Playwright、Turso、context7など、実装確認や最新仕様確認に使う。
- workspaceのパッケージ名は `@enterprise-agentic-saas/*`（`apps/*`・`packages/*`）。portlessで固定したいホスト名は `apps/web`・`apps/api`・`packages/db` の `package.json` の `portless.name` で指定する（ルートの `portless.json` は使わない）。
- portlessのTLDは `.localhost` を使う。webは `https://enterprise-agentic-saas.localhost`、APIは `https://api.enterprise-agentic-saas.localhost`、DBは `https://db.enterprise-agentic-saas.localhost`。
- `.localhost` はportlessのデフォルトTLDなので、`package.json` の `portless.tld` は書かない。`tld` は未知のkeyとして警告される。
- このrepoでは `bun run dev` がportlessを使う。packageごとの `dev` は `portless run <command>` にし、rootは `turbo run dev` で各packageのdevを起動する。stream のログ接頭辞を消すには `turbo run dev --log-prefix=none` とする（**`turbo.json` には未対応**で、root `package.json` の `dev` か手元のCLIで渡す）。並列ログは混線しやすいので、必要なら一時的に接頭辞付きへ戻す。
- `bun run dev`はbuild済みartifactを起動しない。Webは`next dev --turbopack`でFast Refreshを維持し、APIはWrangler mainの`src/worker.ts`を`wrangler dev`でwatch/rebundleする。production相当のbuild確認は別の`bun run build:cloudflare`で行う。
- 日常のdev起動はlocal Tursoの接続待機と`generate + migrate`までに閉じ、DB seed、R2 fixture reconcile、testを混ぜない。fixtureが必要な場合だけdev稼働中の別terminalで`bun run seed:local`を明示実行する。reset後も`bun run dev`でmigrationを適用し、seedは任意にする。
- `turso dev` は `PORT` envを読まないため、DBのportless scriptは `turso dev --port ${PORT:-8080}` のようにportlessが割り当てた `PORT` を明示的に渡す。
- local email inboxはNix dev shellの`pkgs.mailpit`を使う。`packages/email`の`dev`はReact Email previewを維持し、package-local `turbo.json`の`with`で`dev:mailpit`を並走させる。root `turbo.json`へpackage固有taskを増やさない。
- Mailpit UI/Send APIはmain checkoutで `https://mailpit.enterprise-agentic-saas.localhost`、React Email previewは `https://email.enterprise-agentic-saas.localhost` にする。linked worktreeではPortless prefixを分離境界にし、別worktreeの固定URLへ配送しない。MailpitのSMTP listenerは外部公開せず、loopbackのephemeral portを使う。
- APIの`dev`/`dev:spotlight` scriptは、明示`MAILPIT_URL`がなければouter `portless run`より先に `portless get mailpit.enterprise-agentic-saas` を実行し、同じworktree-aware URLを子processへ注入する。共通resolverの固定URLはPortlessを介さない単体起動用fallbackに限定する。通常のlocal起動にemail envの複製を要求せず、明示envは別のlocal instanceやconsole fallbackを選ぶ場合だけ使う。
- Mailpit DBはgit管理外の `packages/email/.local/mailpit.db` に保存する。手動resetはroot devを停止してから `bun run --cwd packages/email mailpit:reset` を明示実行し、通常起動では削除しない。
- local GitHub OAuth emulatorはexact pinしたBun dependency `emulate`を`apps/github-emulator`からprogrammaticに起動する。Nixへglobal CLIを追加せず、本番runtime/Worker dependencyにも含めない。stateはmemoryのみで、process再起動を完全reset境界にする。
- emulator自身の`--portless`は固定`github.emulate.localhost` aliasをforce登録・削除し、linked worktreeと競合するため使わない。外側の`portless run`にaliasを所有させ、main checkoutでは`https://github.emulate.enterprise-agentic-saas.localhost`、linked worktreeではPortlessのprefix付きURLを使う。
- APIの`dev`/`dev:spotlight`は`portless get github.emulate.enterprise-agentic-saas`でworktree-awareな`GITHUB_OAUTH_EMULATOR_URL`を注入する。emulator側のcallbackも`portless get api.enterprise-agentic-saas`から組み立て、固定main URLを複製しない。APIのpackage-local `turbo.json`の`with`でfiltered devにもemulatorを含める。
- `emulate`のadvertised `baseUrl`はlistener bind addressを制限しない。fixture data/credentialだけを使い、production起動、remote advertised URL、debug raw request logをfail-fastで拒否する。
- Wrangler/OpenNext/Playwright/Storybookはroot catalogと各workspaceのdevDependencyに固定し、flakeへ別versionのglobal CLIを重ねない。`nix develop` のBunから `bun run --cwd <workspace> ...` で起動する。
- `flake.nix`から`bunx`で起動するMCP packageもbare nameにせずexact versionを指定する。生成configだけがNix storeにあっても、bare npm specでは同期時に取得versionが変わる。
- Cloudflare local envは各appの `.dev.vars`、共有key一覧は `.dev.vars.example` に置く。production secretはCloudflare/GitHub secretへ置き、`.dev.vars` をcommitしない。
- local/testの`EMAIL_FROM`は未設定でも`packages/email`の共通resolverが`noreply@example.test`を補う。本番は補わずenv validationでfail-fastするため、Cloudflareで検証済みsenderを必ず設定する。
- 人向けrunbookの入口は `docs/README.md`。repo固有の判断をskillへ先に反映し、実行手順と運用checklistを `/docs` に展開する。

## Spotlight

- local observabilityは`bun run dev:spotlight`を入口にし、Spotlight sidecarとTurbo devを同時起動する。UI/sidecarは`http://localhost:8969`。
- browserは`NEXT_PUBLIC_SENTRY_SPOTLIGHT`、Next server/APIは`SENTRY_SPOTLIGHT`を使う。値`1`またはlocalhost系の`/stream` URLだけをdevelopmentで受け入れ、production/remote hostでは無効化する。
- Spotlight利用中は実Sentry DSNを使わずerror/log/traceを100% localへ送る。通常の`bun run dev`はSentry外送を行わない。
- `flake.nix`のSpotlight MCP packageはexact versionで固定し、`sync-agent-config`で他MCPと一緒に生成する。MCPを使う前にsidecarを起動する。

## Bun security scanner障害

- `bunfig.toml`のSocket scannerはdependency installをfail-closedにする。scanner APIの5xxを脆弱性なしとして扱わず、設定を恒久的に削除しない。
- localで外部scannerが繰り返し5xxになり作業継続が必要な場合だけ、`exact/linker/linkWorkspacePackages/saveTextLockfile/minimumReleaseAge`を同じ値にした一時bunfigを`bun install --config=<path>`へ渡す。一時fileは直後に削除し、通常configの`bun install --frozen-lockfile`を後で再実行する。
- CI/release installはscannerを迂回しない。外部障害ならdependency gateを失敗のまま保ち、復旧後に再実行する。

## agent向けドキュメント化

このrepoで設計判断・実装規約・失敗から得た運用知識が増えたら、通常の長い `docs/` より先に `.agents/local-skills/<topic>` へ反映する。

追加・更新の基準:

- agentが次回も同じ判断をする必要がある。
- modelが一般知識だけでは間違えやすいrepo固有ルールである。
- CI、secret、MCP、Nix、Turso、Better Authなど、環境差分で失敗しやすい。
- 一度きりの説明ではなく、テンプレート利用者にも再利用される。

外部skillの更新はskill本文を直接編集せず、`flake.lock` の input 更新で行う。

既存skillに入らない新しい関心ごとは、description発火が明確になる単位で新しいskillを作る。

## 迷ったとき

- setupやsecret注入ならこのskill。
- package境界なら `package-management`。
- Next.jsなら `frontend`。
- Elysia APIなら `backend-api`。
- Turso/Drizzleなら `database`。
- auth/emailなら `auth-email`。
- CIなら `ci-quality`。
- Playwright導線なら `e2e-test`。

具体的な `.envrc`、dotenvx、MCP、Nix例が必要なときだけ `references/developer-environment.md` を読む。
