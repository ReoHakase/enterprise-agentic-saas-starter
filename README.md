# 🚀 Enterprise Agentic SaaS Starter

組織, 権限, 監査, 認証付きファイル, メール, 可観測性, 製品Agentを備えた、
マルチテナントSaaSのスターターです。デモの業務領域は小さく保ちながら、本番運用を
前提とした境界と品質検査を実装しています。

開発環境, 設計, セキュリティ, テスト, デプロイの詳細は
[`docs/README.md`](docs/README.md)から参照できます。

> [!IMPORTANT]
> このリポジトリはUIのサンプルだけではありません。テナント分離, サーバー側認可,
> 監査, 機密情報の非漏洩, 決定的なテストを製品要件として扱います。

## ✨ 主な機能

- 🔐 Better Authによるマジックリンク, パスキー, GitHub OAuth, 組織セッション
- 🏢 組織を境界とするIssue, メンバー, 添付ファイル, 監査
- 🤖 非公開のMastra Agent Workerと、ストリーミング対応のAgent UI
- 🛠️ 読み取りツール, 明示的な承認を伴うIssue書き込み, Web検索, 画像入力
- 💬 Agentの会話, メンション, ページコンテキスト, 使用量, コンテキスト上限の表示
- 🗄️ Cloudflare R2, Images, Cacheを使う認証付きファイル配信
- ✉️ React Email, Mailpit, Cloudflare Email Sendingによるメール配送
- 📈 SentryとSpotlightによる、機密情報を除去した可観測性
- ✅ Oxlint, Oxfmt, Knip, jscpd, Vitest, Storybook, Playwrightによる品質検査

## 🏗️ システム構成

製品Agentは公開APIの内側に置きます。ブラウザーからAgent Workerへ直接接続せず、
Service Bindingだけを認証・認可の根拠にしません。

```text
ブラウザー
  └─ Web Worker
       Next.js / Agent UI
       └─ 認証付きHTTP
          API Worker
          Better Auth / 認可 / DB / R2 / 使用量
            ├─ AGENT_RUNTIME Service Binding
            │    Agent Worker
            │    Mastra / モデル / ツール / ストリーム
            └─ AGENT_INTERNAL_API named entrypoint
                 非公開Elysia / Drizzle / ドメインサービス
```

Agent WorkerはTurso, Better Auth, R2, Webを直接参照しません。APIが短命な権限証票,
現在有効な組織メンバーシップ, ツール権限, 冪等性, 監査を毎回検証します。Issueを変更する
ツールは、利用者の承認後もAPI側の認可を通過した場合だけ実行されます。詳細は
[`apps/agent`の設計](docs/architecture/apps/agent.md)と
[製品Agentのセキュリティ](docs/agent/architecture-security.md)を参照してください。

## 🧰 技術構成

| 領域         | 採用技術                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------- |
| ランタイム   | Bun `1.3.13`, Cloudflare Workers                                                             |
| モノレポ     | Bun workspaces, Turborepo                                                                    |
| Web          | Next.js `16`, React `19`, Tailwind CSS `4`, shadcn/Base UI, TanStack Query/Form/Table, Jotai |
| API          | Elysia, Eden, Valibot Standard Schema, envin                                                 |
| Agent        | Mastra, Vercel AI SDK, OpenRouter, Cloudflare Service Binding                                |
| 認証         | Better Auth, マジックリンク, パスキー, 組織プラグイン, GitHub OAuth                          |
| データベース | Turso/libSQL, Drizzle ORM, Drizzle Kit                                                       |
| ファイル     | Cloudflare R2, Images, Workers Cache                                                         |
| メール       | React Email, Mailpit, Cloudflare Email Sending                                               |
| 可観測性     | Sentry, Spotlight                                                                            |
| 品質         | Oxlint, Oxfmt, Knip, jscpd, Vitest, Storybook, Playwright                                    |

依存関係の版はルートの`workspaces.catalog`で固定しています。外部依存には`catalog:`、
リポジトリ内の依存には`workspace:*`を使います。

## 🗂️ ワークスペース

```text
apps/
  web/                 Next.js, ドメインUI, Agent UI
  api/                 公開API, 非公開Agent制御面, 認可, 業務トランザクション
  agent/               Mastra Agent, モデル, ツール, ストリーム
  github-emulator/     ローカルとE2E用のGitHub OAuth emulator

packages/
  auth/                Better Authのサーバー, ブラウザークライアント
  db/                  Drizzleスキーマ, マイグレーション, DBクライアント
  email/               React Emailテンプレート, 配送`adapter`
  ui/                  ドメイン非依存の共通UI
  typescript-config/   共通TypeScript設定
```

ワークスペースを越える`import`は`package.json#exports`の公開入口だけを使います。

```text
apps/web   -> api/client, auth/client, ui
apps/api   -> auth, db, email
apps/agent -> api/agent-client
packages   -> appへ依存しない
```

APIのルートスキーマは`apps/api`が所有し、Webは
`@enterprise-agentic-saas/api/client`だけを利用します。Agentは
`@enterprise-agentic-saas/api/agent-client`以外のAPI入口やDB, Auth, Email, Webを
直接`import`しません。完全な規則は
[システム境界](docs/architecture/system-boundaries.md)を参照してください。

## 🚀 開発を始める

### 1. 🧑‍💻 開発環境を用意する

[Nix](https://nixos.org/)と[direnv](https://direnv.net/)を使う場合:

```sh
direnv allow
# または
nix develop

bun install --frozen-lockfile
```

開発シェルはBun, Turso CLI, `sqld`, Mailpit, dotenvx, Portlessなどを提供します。
起動時に`.agents/local-skills/`とNixで固定した外部`skill`を
`.agents/skills/`へ同期し、Codex, VS Code, Cursor用のMCP設定も生成します。手動で
同期する場合は次を実行します。

```sh
nix run .#sync-agent-config
```

`.agents/local-skills/`が編集元であり、生成先の`.agents/skills/`は手編集しません。

### 2. 🔐 ローカル環境変数を作る

```sh
cp apps/api/.env.example apps/api/.env.development
cp apps/api/.env.example apps/api/.env.local
cp apps/api/.env.test.example apps/api/.env.test
cp packages/db/.env.example packages/db/.env.development
```

APIとDBの`TURSO_DATABASE_URL`は同じ値にします。Bunはコマンドを実行した
ワークスペースの`.env*`を読むため、機密情報をルートへ集約しません。実値を含む`.env*`と
`.dev.vars`はコミットしないでください。

主なローカルURL:

| 用途                       | URL                                                        |
| -------------------------- | ---------------------------------------------------------- |
| Web                        | `https://enterprise-agentic-saas.localhost`                |
| API                        | `https://api.enterprise-agentic-saas.localhost`            |
| Agent Worker（内部接続用） | `https://agent.enterprise-agentic-saas.localhost`          |
| Mailpit                    | `https://mailpit.enterprise-agentic-saas.localhost`        |
| React Email                | `https://email.enterprise-agentic-saas.localhost`          |
| GitHub OAuth emulator      | `https://github.emulate.enterprise-agentic-saas.localhost` |

リンクした`worktree`ではPortlessがURLへ接頭辞を付けます。

### 3. ▶️ 開発サーバーを起動する

```sh
bun run dev
```

このコマンドはWeb, API Worker, Agent Worker, Turso, マイグレーション, Drizzle Studio,
永続化したローカルR2, Mailpit, React Email, GitHub OAuth emulatorを起動します。
開発用初期データの投入, R2フィクスチャの同期, テストは実行しません。初回はDBタスクが
マイグレーションを完了してからWebを開いてください。

固定のサンプル組織, Issue, ファイルが必要な場合だけ、次を実行します。

```sh
bun run dev:db:seed
```

DBだけを調査する場合:

```sh
bun run dev:db
```

`bun run dev`と`bun run dev:db`は同じローカルDBを所有するため、同時に起動しません。
ローカルデータを作り直す`bun run dev:db:reset`は確認文字列を要求し、リモート接続と本番環境を
拒否します。詳細は[ローカル開発](docs/local-development.md)と
[データベースのライフサイクル](docs/database-lifecycle.md)を参照してください。

### 4. 🤖 Agentを開発する

通常の`bun run dev`で、本番と同じ構成のAgent Workerも起動します。実モデルを使う場合だけ、
Git管理外の`apps/agent/.env.local`へ`OPENROUTER_API_KEY`を設定してください。通常の無料テストに
このシークレットは不要です。

Mastra Studioを単独で確認する場合:

```sh
bun run dev:agent:studio
```

Studio用に別のAgent定義や固定認証情報を作らず、本番Workerと同じMastra構成を読み込みます。
Agentの機能, 承認, 会話, 使用量, 運用は[製品Agent仕様](docs/agent/README.md)から参照できます。

## ✅ 検証

日常の必須検査:

```sh
bun run check
bun run build
```

`check`はOxlint, Knip, jscpd, Oxfmt, 型検査, 実ブラウザー・実LLMを必要としない
単体テストと統合テストを実行します。実行環境と費用が異なる検査は分離しています。

| コマンド                  | 対象                                                 | 外部費用    |
| ------------------------- | ---------------------------------------------------- | ----------- |
| `bun run test`            | Node, happy-dom, libSQL, Elysia, 決定的なAgentテスト | なし        |
| `bun run test:browser`    | Storybook, Vitest Browser Mode                       | なし        |
| `bun run test:e2e`        | Web, API, Agent, DB, 認証を接続する無料E2E           | なし        |
| `bun run test:eval:agent` | ブラウザーを使わない実モデル評価                     | LLM料金あり |
| `bun run test:e2e:full`   | 実モデルを含む完全E2EのE2                            | LLM料金あり |

Cloudflare構成を変更した場合:

```sh
bun run build:cloudflare
```

有料テストは明示的に実行する場合だけ`OPENROUTER_API_KEY`を渡します。通常のPRや
フォークからのPRでは実行せず、プロバイダーの生の応答, プロンプト, 非公開データを成果物へ
保存しません。

> [!NOTE]
> [`docs/testing-strategy/`](docs/testing-strategy/README.md)は、ワークスペース別のテスト所有権と
> 決定的E2E・完全E2Eへの整理を定める移行先の仕様です。現在は
> [`testing strategy全面移行`](docs/exec-plans/active/testing-strategy-migration.md)に沿って
> 移行中です。有料の完全E2Eは`test:e2e:full`だけを公開し、通常のPRでは実行しません。

## 📚 文書

- [開発者文書の入口](docs/README.md)
- [設計仕様の目次](docs/architecture/README.md)
- [システム境界](docs/architecture/system-boundaries.md)
- [製品Agent仕様](docs/agent/README.md)
- [テスト戦略仕様書](docs/testing-strategy/README.md)
- [認証・認可・マルチテナント](docs/auth-tenancy-security.md)
- [APIとOpenAPI](docs/api-openapi.md)
- [認証付きファイルストレージ](docs/file-storage-r2.md)
- [ローカル開発](docs/local-development.md)
- [デプロイと運用](docs/deployment-operations.md)
- [可観測性](docs/observability.md)
- [ADR](docs/decisions/README.md)
- [実行計画](docs/exec-plans/README.md)

## 📦 公開パッケージ入口

- `@enterprise-agentic-saas/api/client`: Web向けEdenクライアント
- `@enterprise-agentic-saas/api/agent-client`: Agent向け非公開制御面クライアント
- `@enterprise-agentic-saas/auth`: Better Authのサーバーファクトリ
- `@enterprise-agentic-saas/auth/client`: Better Authのブラウザークライアント
- `@enterprise-agentic-saas/db`: Drizzle/libSQLクライアントとスキーマ
- `@enterprise-agentic-saas/email`: React Emailと配送`adapter`
- `@enterprise-agentic-saas/ui`: 共通UI, `hook`, スタイル

## 🧩 shadcn/uiコンポーネントを追加する

リポジトリルートからWebの設定を指定します。

```sh
bunx --bun shadcn@latest add button -c apps/web
```

共通UIは`packages/ui/src/components/`へ生成されます。

```tsx
import { Button } from "@enterprise-agentic-saas/ui/components/button"
```

## ⚖️ ライセンス

Copyright 2026 白田連大 (Reo Hakuta)

このリポジトリは[Apache License 2.0](LICENSE)で公開しています。帰属情報は
[`NOTICE`](NOTICE)を参照してください。
