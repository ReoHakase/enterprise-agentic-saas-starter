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

該当するskillの `SKILL.md` を先に読み、必要なときだけ同じskill内の `references/` を読む。
