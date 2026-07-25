# Agent Instructions

このrepositoryのagent向け文書とlocal skillは原則日本語で書く。日本語技術文書を更新する前に
[`docs/jargon.md`](docs/jargon.md)を読む。commit messageは既存運用に合わせる。

## 正本とrouting

- 文書の入口は[`docs/README.md`](docs/README.md)。
- 設計は`docs/architecture/`、test契約は`docs/testing-strategy/`、永続的判断は`docs/decisions/`、
  作業状態は`docs/exec-plans/active/`を正本にする。
- `.agents/local-skills/`はrepo-local skill artifactの編集元であり、`.agents/skills/`はNix生成先。
- 仕様や理由をskillへ複製しない。変更領域のskillが指定するdocs、ADR、active planを先に読む。
- 次回も必要な判断は先にdocsまたはADRへ反映し、手順や検証が変わる場合だけskillも更新する。
- root以外に`AGENTS.md`を追加しない。

## 作業手順

1. active exec planと変更領域のskillを読む。
2. `test_planner`でinvariant、必要なtest layer、paid testの要否を決める。
3. production/test codeをwriteするagentは`implementer`一体に限定する。
4. 最小のdeterministic checkから実装し、planのrequired commandまで広げる。
5. current diffをread-onlyのcorrectness、security、tests reviewerへ渡す。
6. findingを修正して検証とreviewを繰り返し、P0/P1または必須check失敗を残さない。

## source境界

- WebはNext.js compositionとdomain UI、APIはHTTP・authorization・transaction・DB adapterを所有する。
- Agentの手書きruntimeは`apps/agent/src/mastra/**`へ置く。
- UI packageはdomain-independent UI、DB packageはschema・migration・client・development toolingだけを所有する。
- workspace間importは`package.json#exports`で公開したentrypointだけを使う。
- API route schemaは`apps/api`へ閉じ、Webは`@enterprise-agentic-saas/api/client`だけをimportする。
- tenant dataはrepository queryとDB制約の両方で`organization_id`を境界にする。

## 品質とtest

- `bun run test`: external cloud、real browser、paid model不要のunit/integration。
- `bun run test:browser`: UI interactionとa11y。
- `bun run test:e2e`: free E2E。
- `bun run test:eval:agent`: paid model eval。
- `bun run test:e2e:full`: paid full-stack canary。
- Oxlint warning、Knip full/strict、jscpd findingをignoreやbaselineで隠さない。
- Cloudflare構成変更は`bun run build:cloudflare`、DB変更は`generate + migrate`と`db:check`を通す。

## 禁止事項

- 明示承認なしにproduction deploy、Git push、PR merge、remote DB変更を実行しない。
- `drizzle-kit push`を使わず、`main`に存在するmigrationを変更しない。
- `.agents/skills/`、generated file、lockfileを所有command以外で手編集しない。
- AgentからDB、Auth、Email、Webを直接importしない。
- reviewerからfileをwriteしない。
- secret、token、email本文、private URL、provider raw errorをlogやtelemetryへ出さない。
