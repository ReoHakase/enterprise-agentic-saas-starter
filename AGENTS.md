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
2. 不変条件、必要なテスト層、有料テストの要否を変更前に決める。
3. 既存変更を保持し、依頼された範囲だけを実装する。
4. 最小の決定的な検査から始め、planの必須commandまで広げる。
5. 現在の差分を仕様、security、テストの観点でレビューする。
6. 指摘を修正して検証とレビューを繰り返し、P0/P1または必須検査失敗を残さない。

## source境界

- WebはNext.js compositionとdomain UI、APIはHTTP・authorization・transaction・DB adapterを所有する。
- Agentの手書きruntimeは`apps/agent/src/mastra/**`へ置く。
- UI packageはdomain-independent UI、DB packageはschema・migration・client・development toolingだけを所有する。
- workspace間importは`package.json#exports`で公開したentrypointだけを使う。
- API route schemaは`apps/api`へ閉じる。WebはAPI clientを`@enterprise-agentic-saas/api/client`から、
  Agent公開contractを`@enterprise-agentic-saas/agent-contracts`から直接importする。
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
- secret、token、email本文、private URL、provider raw errorをproduction log、公開response、trace、
  remote telemetry、test・evalの出力やartifactへ出さない。標準`MessageHistory`はADR-012に従って
  利用者が入力した会話を保存するが、アプリとtoolが認証情報、private URL、生のprovider errorを
  Memoryへ追加しない。ADR-013の固定条件を満たす
  `NODE_ENV=development`のAPI・Agent・Webに限り、認証情報を除去したbounded cause chainを端末・
  ブラウザーconsoleとlocal Lokiへ出してよい。local Lokiは機密development dataとして扱い、共有・
  export・artifact添付をしない。
