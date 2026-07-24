# Agent Instructions

このリポジトリでは、skills、references、agent向けドキュメントは原則日本語で書く。commit messageだけは既存運用に合わせる。

## Skillsを優先する

設計判断、実装規約、失敗から得た知見、環境依存の注意点は、通常の長い `docs/` より先に `.agents/local-skills/` へ反映する。

`.agents/local-skills` はrepo-local skillの正本、`.agents/skills` はNixが生成するagent実行用ディレクトリ。`.agents/skills` は直接編集しない。

次に該当する情報を得たら、作業の一部として自発的に関連skillを更新する:

- 次回のagentも同じ判断をする必要がある。
- 一般的なモデル知識だけでは、このrepoの方針を誤りやすい。
- Nix、agent-skills-nix、mcp-servers-nix、direnv、dotenvx、MCP、Turso、Better Auth、Cloudflare、CIなど環境差分で失敗しやすい。
- テンプレート利用者に再利用される可能性がある。

既存skillに入らない関心ごとは、`description` で自然に発火できる単位の新しいskillとして追加する。巨大なumbrella skillにまとめない。

## Repo前提

このrepoは、機能としてはtodoアプリを題材にする。ただし設計対象は、グループ、権限、認証、監査、堅牢なCIを持つマルチテナントSaaS webアプリのテンプレートである。

## 運用上の不変条件

- DB schema変更は `packages/db/drizzle/` にmigrationを保存し、開発環境も `generate + migrate` を使う。通常起動で `push` やresetをしない。
- tenant dataはrepository queryとDB制約の両方で `organization_id` を境界にする。
- Web/APIのCloudflare構成を変えたら `bun run build:cloudflare` を通す。Elysia Cloudflare adapterはexperimentalなのでBun buildだけで完了扱いにしない。
- application error/log/traceはSentry SDKを正本にし、localはSpotlightを使う。CloudflareのSentry OTLP exportを同時に有効化して二重送信しない。
- production emailはCloudflare `EMAIL` bindingを使い、本文、URL/token、recipient全文、provider raw errorをlog/telemetryへ出さない。
- API route schemaは`apps/api`のValibot Standard Schemaへ閉じる。WebがAPI packageからimportしてよいのは`@enterprise-agentic-saas/api/client`だけで、`packages/validators`やAPI schema/typeのdeep importを作らない。
- browserのserver dataはTanStack Query、formはTanStack Form + Web-local Valibot、再取得不要な一時UI状態だけをJotaiで扱う。
- packageのOxlintは`--deny-warnings`で実行し、plugin warningをCIへ残さない。
- 人向けrunbookは `/docs` に置き、入口は `docs/README.md` へ追加する。

## Skill一覧

- `package-management`: workspace layout、依存方向、package exports、API client配置。
- `developer-environment`: `nix develop`、Bun、agent-skills-nix、mcp-servers-nix、direnv、dotenvx、MCP、secret読込、agent向け記録。
- `frontend`: Next.js、Cloudflare/OpenNext、web env、`packages/ui`、Storybook配置。
- `backend-api`: Elysia、`apps/api`、feature modules、Valibot、Eden、OpenAPI、Sentry observability。
- `database`: Turso/libSQL、Drizzle、SQLite schema、migration、DB plugin。
- `auth-email`: Better Auth、organization/role、auth client、auth callback、認証と認可境界。
- `email`: `packages/email`、React Email、Cloudflare Email Sending、console/noop sender、メールtemplate。
- `error-handling`: `AppError`、`Error.cause`、safe response、redaction、logging、telemetry error。
- `ci-quality`: GitHub Actions、oxlint、oxfmt、Vitest、Storybook test runner、Next build、CI品質ゲート。
- `e2e-test`: Playwright、auth/org/permission導線、tenant境界、E2E data、Playwright MCP。
- `file-storage-r2`: 認証付き`/files/*`、Cloudflare R2/Images、Turso metadata/quota、Issue attachment、local seed/reconcile。
- `agent-runtime`: Cloudflare Agents SDK、3 Worker境界、tool、承認、自動許可、Issue CRUD、chat画像、client state、active organization切り替え。

該当するskillの `SKILL.md` を先に読み、必要なときだけ同じskill内の `references/` を読む。

---

# リポジトリ共通契約

## 正本

- 文書の入口は`docs/README.md`
- 設計文書は`docs/architecture/`
- テスト契約は`docs/testing/`
- 永続的な設計判断は`docs/decisions/`
- 複雑な作業の現在状態は`docs/exec-plans/active/`
- local skillsは`.agents/local-skills/`を正本とし、生成先`.agents/skills/`を直接編集しない

## 必須手順

1. active exec planと関連仕様を読む
2. `test_planner`で変更に必要なtest layerを決める
3. production/test codeをwriteするagentは`implementer`一体に限定する
4. 最小のdeterministicな検証を実行する
5. current diffを別contextのread-only reviewerへ渡す
6. correctness、security、testsのfindingを`implementer`へ戻す
7. 修正後に検証とレビューを繰り返す
8. 必須checkが失敗したまま完了扱いにしない

## source構成

- `apps/web`はNext.js compositionとdomain-specific UIを所有する
- `apps/api`はHTTP、authorization、transaction、DB adapterを所有する
- `apps/agent`の手書きruntimeは`apps/agent/src/mastra/**`へ置く
- `packages/ui`はdomain-independent UIだけを所有する
- `packages/db`はschema、migration、client、development DB toolingだけを所有する
- workspaceを越えるimportは`package.json#exports`で公開したentrypointだけを使う

## 品質契約

- Oxlint warningはerrorとして扱う
- complexity、function size、file size、nesting budgetを迂回しない
- Knipのdead codeとdependency findingをignoreで隠さない
- jscpdのduplicateを広いignoreで隠さない
- unrelated changeでCI、lint、coverage、test、reviewer instructionを弱めない
- generated file、migration、lockfileを手編集する前に所有規則を確認する

## テスト契約

- `bun run test`は外部cloud、real browser、paid LLMを必要としないunit/integrationを全て含む
- UI interactionとa11yは`bun run test:browser`
- free E2Eは`bun run test:e2e`
- paid model evalは`bun run test:eval:agent`
- paid full-stack canaryは`bun run test:e2e:agent`
- VRTは現時点で実施しない

## 禁止事項

- production deploy、Git push、PR merge、remote DB変更を明示承認なしで実行しない
- `drizzle-kit push`を使用しない
- `main`に存在するmigrationを変更しない
- `apps/agent`からDB、Auth、Email、Webを直接importしない
- reviewer agentからfileをwriteしない
- protected harness fileの変更を通常feature changeへ混ぜない
