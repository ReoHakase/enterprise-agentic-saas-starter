---
name: developer-environment
description: enterprise-agentic-saas-starterのnix develop、Bun、agent-skills-nix、mcp-servers-nix、direnv、dotenvx、secret読み込み、MCP設定(nextjs/playwright/turso/context7)、開発環境bootstrap、agent向けドキュメント化ルールを変更するときに使う。
---

# Developer Environment

このskillは開発環境、secret注入、MCP、agent向けドキュメント化のルールを変えるときに使う。

## 方針

- 開発環境は `nix develop` で定義する。
- Bunはpackage manager/runtimeとして使う。
- repo固有skill artifactは `.agents/local-skills` を編集元としてgit管理する。設計仕様の正本は
  `docs/`とADRであり、skillへ規範本文を複製しない。
- `.agents/skills` は `agent-skills-nix` が生成するagent実行用ディレクトリとして扱い、直接編集しない。
- 外部skillとMCP設定は `agent-skills-nix` / `mcp-servers-nix` を `flake.lock` でpinし、`nix develop` の `sync-agent-config` で生成する。
- 生成されたskill（例: `.agents/skills/next-best-practices`, `.agents/skills/developer-environment`）はこのrepoで直接編集しない。
- direnvでrepoに入ったときの環境読込を行う。
- dotenvxでsecretをenvファイルから安全に読み込む。secretをsourceやdocsへ書かない。
- MCPはNext.js、Playwright、Turso、context7など、実装確認や最新仕様確認に使う。
- workspaceのパッケージ名は `@enterprise-agentic-saas/*`（`apps/*`・`packages/*`）。portlessで固定したいホスト名は `apps/web`・`apps/api`・`packages/db` の `package.json` の `portless.name` で指定する（ルートの `portless.json` は使わない）。
- portlessのTLDは `.localhost` を使う。webは `https://enterprise-agentic-saas.localhost`、APIは `https://api.enterprise-agentic-saas.localhost`、DBは `https://db.enterprise-agentic-saas.localhost`。
- Mastra Studioは`apps/agent/turbo.json`の`dev.with`でAgent Workerと並走させ、rootの`bun run dev`から起動する。Studio単独起動には`bun run dev:agent:studio`を残し、main checkoutでは`https://mastra-studio.enterprise-agentic-saas.localhost`を使う。linked worktreeではPortlessがprefixを付けたURLを使う。`dev:studio`には`MASTRA_AUTO_DETECT_URL=true`を渡し、browserからephemeralな`http://127.0.0.1:<port>`へ接続させず、Portlessのsame-origin `/api`を使う。StudioとAgent Workerは同じ`apps/agent/src/mastra/index.ts`をloadし、Studio専用agentやmock toolを作らない。
- `.localhost` はportlessのデフォルトTLDなので、`package.json` の `portless.tld` は書かない。`tld` は未知のkeyとして警告される。
- このrepoでは `bun run dev` がportlessを使う。packageごとの `dev` は `portless run <command>` にし、rootは `turbo run dev` で各packageのdevを起動する。stream のログ接頭辞を消すには `turbo run dev --log-prefix=none` とする（**`turbo.json` には未対応**で、root `package.json` の `dev` か手元のCLIで渡す）。並列ログは混線しやすいので、必要なら一時的に接頭辞付きへ戻す。
- API supervisorとAgentのPortless wrapperはHTTP listenerへ割り当て済み`PORT`を渡し、Wrangler inspectorには`--inspector-port 0`を渡してOSに空きportを割り当てさせる。APIのpackage scriptから`src/dev.ts`を迂回しない。迂回するとMailpit session、development seed session、repository-local Turso待機が失われる。複数Workerやlinked worktreeで既定`9229`を共有せず、固定DevTools endpointが必要な単独起動だけ`WRANGLER_INSPECTOR_PORT=9234`のように上書きできる。どちらも`0..65535`以外を起動前に拒否する。
- `bun run dev`はbuild済みartifactを起動しない。Webは`next dev --turbopack`でFast Refreshを維持し、APIはWrangler mainの`src/worker.ts`を`wrangler dev`でwatch/rebundleする。APIはBunの状態保持型HMRではなくWorker isolate再起動なのでmemory stateを引き継がないが、Turso、Wrangler R2 state、Mailpit DBはdiskへ永続化する。`src/dev.ts` supervisorや起動時envの変更だけはdevを再起動する。production相当のbuild確認は別の`bun run build:cloudflare`で行う。
- rootの公開開発commandは`bun run dev`、DB-onlyの`bun run dev:db`、停止中にlocal Tursoと対応R2 stateを消す`bun run dev:db:reset`、任意fixture用`bun run dev:db:seed`に揃える。rootの`seed` aliasやproduction seed commandは作らない。package内部の`db:*`はschema作業と診断用に維持する。
- 日常のdev起動はlocal Tursoの接続待機と`generate + migrate`までに閉じ、DB seed、R2 fixture reconcile、testを混ぜない。fixtureが必要な場合だけ`bun run dev:db:seed`を明示実行する。このcommandはhealthyなAPI dev sessionがあれば再利用し、なければlocal Tursoが停止中の場合だけ一時起動してmigrationを適用し、`apps/api/.wrangler/state`を使うloopback限定Wranglerを一時起動する。DB seedとR2 reconcile後は自身が起動したprocessだけを停止する。初回にfixtureが必要ならseed後に`bun run dev`、reset時はdev停止 → `dev:db:reset` → 任意の`dev:db:seed` → `dev`の順にする。production/remote targetは処理開始前に拒否する。
- `turso dev` は `PORT` envを読まないため、DBのportless scriptは `turso dev --port ${PORT:-8080}` のようにportlessが割り当てた `PORT` を明示的に渡す。
- local email inboxはNix dev shellの`pkgs.mailpit`を使う。`packages/email`の`dev`はReact Email previewを維持し、package-local `turbo.json`の`with`で`dev:mailpit`を並走させる。root `turbo.json`へpackage固有taskを増やさない。
- Mailpit UI/Send APIはmain checkoutで `https://mailpit.enterprise-agentic-saas.localhost`、React Email previewは `https://email.enterprise-agentic-saas.localhost` にする。linked worktreeではPortless prefixを分離境界にし、別worktreeの固定URLへ配送しない。MailpitのSMTP listenerは外部公開せず、loopbackのephemeral portを使う。
- workerdはPortlessの開発CAを信頼しないため、browserのMailpit UIはPortless HTTPSのまま、Workerからのapplication送信だけ同じMailpit instanceのdirect loopback HTTPを使う。Mailpit wrapperはmode、起動ごとのtoken、loopback URLだけをpermission制限した`packages/email/.local/mailpit-session.json`へ書き、API supervisorはsessionと`/api/v1/info`を確認してから`MAILPIT_URL`をWranglerへ注入する。終了時cleanupはtoken一致時だけ行い、stale/別processのsessionを消さない。明示envは別のlocal instanceやconsole fallbackを選ぶ場合だけ使う。
- APIをWranglerで起動してもdevelopment既定providerはMailpitを維持し、workerdからlocal inboxへapplication emailを送る。`EMAIL_PROVIDER=cloudflare`を明示した場合だけlocal `EMAIL` binding simulationを通す。実配送につながる`remote: true`を共有dev設定へ追加しない。
- Mailpit DBはgit管理外の `packages/email/.local/mailpit.db` に保存する。手動resetはroot devを停止してから `bun run --cwd packages/email mailpit:reset` を明示実行し、通常起動では削除しない。
- local GitHub OAuth emulatorはexact pinしたBun dependency `emulate`を`apps/github-emulator`からprogrammaticに起動する。Nixへglobal CLIを追加せず、本番runtime/Worker dependencyにも含めない。stateはmemoryのみで、process再起動を完全reset境界にする。
- emulator自身の`--portless`は固定`github.emulate.localhost` aliasをforce登録・削除し、linked worktreeと競合するため使わない。外側の`portless run`にaliasを所有させ、main checkoutでは`https://github.emulate.enterprise-agentic-saas.localhost`、linked worktreeではPortlessのprefix付きURLを使う。
- APIの`dev`/`dev:spotlight`は`portless get github.emulate.enterprise-agentic-saas`でworktree-awareな`GITHUB_OAUTH_EMULATOR_URL`を注入する。emulator側のcallbackも`portless get api.enterprise-agentic-saas`から組み立て、固定main URLを複製しない。APIのpackage-local `turbo.json`の`with`でfiltered devにもemulatorを含める。
- `emulate`のadvertised `baseUrl`はlistener bind addressを制限しない。fixture data/credentialだけを使い、production起動、remote advertised URL、debug raw request logをfail-fastで拒否する。
- Wrangler/OpenNext/Playwright/Storybookはroot catalogと各workspaceのdevDependencyに固定し、flakeへ別versionのglobal CLIを重ねない。`nix develop` のBunから `bun run --cwd <workspace> ...` で起動する。
- `flake.nix`から`bunx`で起動するMCP packageもbare nameにせずexact versionを指定する。生成configだけがNix storeにあっても、bare npm specでは同期時に取得versionが変わる。
- Cloudflare local envは各appの `.dev.vars`、共有key一覧は `.dev.vars.example` に置く。production secretはCloudflare/GitHub secretへ置き、`.dev.vars` をcommitしない。
- local/testの`EMAIL_FROM`は未設定でも`packages/email`の共通resolverが`noreply@example.test`を補う。本番は補わずenv validationでfail-fastするため、Cloudflareで検証済みsenderを必ず設定する。
- 人向けrunbookと規範文書の入口は `docs/README.md`。永続的な判断はdocsまたはADRへ先に反映し、
  skillは必読文書、作業手順、検証commandだけを案内する。

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

このrepoで設計判断、実装規約、失敗から得た運用知識が増えたら、まず`docs/`またはADRへ
反映する。skillの発火条件、必読文書、手順、検証commandが変わる場合だけ
`.agents/local-skills/<topic>`も更新する。

追加・更新の基準:

- agentが次回も同じ手順または検証を実行する必要がある。
- modelが一般知識だけでは間違えやすいrepo固有ルールである。
- CI、secret、MCP、Nix、Turso、Better Authなど、環境差分で失敗しやすい。
- 一度きりの説明ではなく、テンプレート利用者にも再利用される手順である。

設計理由、feature固有要件、test matrixはskillへ置かず、関連docsへのlinkで参照する。
`.agents/local-skills/README.md`のformatと禁止事項に従う。

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
