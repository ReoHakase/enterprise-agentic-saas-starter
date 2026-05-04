---
name: developer-environment
description: enterprise-agentic-saas-starterのnix develop、Bun、APM、direnv、dotenvx、secret読み込み、MCP設定(nextjs/playwright/turso/context7)、開発環境bootstrap、agent向けドキュメント化ルールを変更するときに使う。
---

# Developer Environment

このskillは開発環境、secret注入、MCP、agent向けドキュメント化のルールを変えるときに使う。

## 方針

- 開発環境は `nix develop` で定義する。
- Bunはpackage manager/runtimeとして使う。
- APMはagent skills/instructions/promptsの管理に使う。
- direnvでrepoに入ったときの環境読込を行う。
- dotenvxでsecretをenvファイルから安全に読み込む。secretをsourceやdocsへ書かない。
- MCPはNext.js、Playwright、Turso、context7など、実装確認や最新仕様確認に使う。

## agent向けドキュメント化

このrepoで設計判断・実装規約・失敗から得た運用知識が増えたら、通常の長い `docs/` より先に `.apm/skills/<topic>` へ反映する。

追加・更新の基準:

- agentが次回も同じ判断をする必要がある。
- modelが一般知識だけでは間違えやすいrepo固有ルールである。
- CI、secret、MCP、Nix、Turso、Better Authなど、環境差分で失敗しやすい。
- 一度きりの説明ではなく、テンプレート利用者にも再利用される。

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
