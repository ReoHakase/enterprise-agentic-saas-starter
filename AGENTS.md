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
4. 採用済みの言語、runtime、framework、CLIの標準機能を先に検討し、同等の独自wrapper、script、
   設定を増やさず、repository全体のmaintenance surfaceの増減を確認する。
5. 未使用項目の削除は呼び出し元0件だけで決めず、公開entrypoint、CI、Nix、文書、動的command、
   linked `worktree`と利用者向け運用経路を確認する。
6. 最小の決定的な検査から始め、planの必須commandまで広げる。
7. 現在の差分を仕様、security、テストの観点でレビューする。
8. 指摘を修正して検証とレビューを繰り返し、P0/P1または必須検査失敗を残さない。

## source境界

- WebはNext.js compositionとdomain UI、APIはHTTP・authorization・transaction・DB adapterを所有する。
- Agentの手書きruntimeは`apps/agent/src/mastra/**`へ置く。
- UI packageはdomain-independent UI、DB packageはschema・migration・client・development toolingだけを所有する。
- workspace間importは`package.json#exports`で公開したentrypointだけを使う。
- API route schemaは`apps/api`へ閉じる。WebはAPI clientを`@enterprise-agentic-saas/api/client`から、
  Agent公開contractを`@enterprise-agentic-saas/agent-contracts`から直接importする。
- tenant dataはrepository queryとDB制約の両方で`organization_id`を境界にする。

## 品質とtest

- テストを追加または変更する前に、要求振る舞いをGiven-When-Thenで表し、最低十分な所有層と
  上位層に残す固有の配線を決める。既存テストを統合または削除する場合も同様とする。詳細は
  [`docs/testing-strategy/common/test-case-design.md`](docs/testing-strategy/common/test-case-design.md)と、
  [`docs/testing-strategy/README.md`](docs/testing-strategy/README.md)から対象ワークスペースに対応する
  テスト戦略文書を読む。
- IssueとPRは`要求振る舞い`と`テスト設計`を分け、予定する確認と実行済みの結果を混ぜない。詳細は
  [`docs/architecture/issue-pr-authoring.md`](docs/architecture/issue-pr-authoring.md)に従う。
- `bun run test`: external cloud、real browser、paid model不要のunit/integration。
- `bun run test:browser`: UI interactionとa11y。
- `bun run test:e2e`: free E2E。
- `bun run test:eval:agent`: paid model eval。
- `bun run test:e2e:full`: paid full-stack canary。
- Oxlint warning、Knip full/strict、jscpd findingをignoreやbaselineで隠さない。
- Cloudflare構成変更は`bun run build:cloudflare`、DB変更は`generate + migrate`と`db:check`を通す。

## GitHubへの提出

- 利用者がIssueまたはPR単位の実装、修正、継続、次段階への進行を依頼した場合、同じリポジトリの
  対応ブランチへのGit push、Draft PRの作成・更新、現在のheadに対するCI確認までを通常工程に含め、
  操作ごとの承認を求めない。
- 説明、診断、レビュー、読み取り専用、ローカル限定、commitのみ、push禁止など、利用者が指定した
  狭い境界を優先する。
- 履歴を書き換えたブランチはリモートの`ref`とSHAを再取得し、対象`ref`と期待SHAを固定した
  `--force-with-lease`だけで更新する。別担当、別ブランチ、別PR、未解決依存、予期しないリモート更新が
  あれば停止する。

## 禁止事項

- 明示承認なしにPRのDraft解除、レビュー依頼、マージ、本番配備、リモートDB変更、外部サービスの
  破壊的変更、有料テストを実行しない。
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
