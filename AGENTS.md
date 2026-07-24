# Agent Instructions

このリポジトリでは、skills、references、agent向けドキュメントは原則日本語で書く。commit messageだけは既存運用に合わせる。

## Docsを正本にする

仕様、設計理由、テスト戦略、運用上の不変条件は`docs/`とADRを正本にする。local skillへ
規範本文を複製せず、発火条件、必読文書、作業順序、検証commandだけを置く。

`.agents/local-skills`はrepo-local **skill artifactの編集元**、`.agents/skills`はNixが生成する
agent実行用ディレクトリ。どちらも設計仕様の正本ではなく、`.agents/skills`は直接編集しない。

次に該当する場合は、先に関連docsまたはADRを更新し、skillの手順や必読文書にも影響するときだけ
関連skillを更新する:

- 次回のagentも同じ判断をする必要がある。
- 一般的なモデル知識だけでは、このrepoの方針を誤りやすい。
- Nix、agent-skills-nix、mcp-servers-nix、direnv、dotenvx、MCP、Turso、Better Auth、Cloudflare、CIなど環境差分で失敗しやすい。
- テンプレート利用者に再利用される可能性がある。

既存skillに入らない作業手順は、`description`で自然に発火できる単位の新しいskillとして追加する。
巨大なumbrella skillにまとめない。

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

Skill一覧とformatは[`.agents/local-skills/README.md`](.agents/local-skills/README.md)を参照する。
変更領域に該当するskillを選び、skillが指定するdocsと必要なreferenceを読む。

---

# リポジトリ共通契約

## 正本

- 文書の入口は`docs/README.md`
- 設計文書は`docs/architecture/`
- テスト契約は`docs/testing/`
- 永続的な設計判断は`docs/decisions/`
- 複雑な作業の現在状態は`docs/exec-plans/active/`
- local skill artifactは`.agents/local-skills/`を編集元とし、生成先`.agents/skills/`を直接編集しない

## 必須手順

1. active exec planを読む
2. 変更領域のskillを選び、そのskillが指定するarchitecture、testing、ADRを読む
3. `test_planner`で変更に必要なtest layerを決める
4. production/test codeをwriteするagentは`implementer`一体に限定する
5. 最小のdeterministicな検証を実行する
6. current diffを別contextのread-only reviewerへ渡す
7. correctness、security、testsのfindingを`implementer`へ戻す
8. 修正後に検証とレビューを繰り返し、必須checkが失敗したまま完了扱いにしない

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
