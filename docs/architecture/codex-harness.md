---
title: Codex coding harness
status: accepted
implementation: planned
last_reviewed: 2026-07-25
applies_to:
  - AGENTS.md
  - .codex/**
  - .codex/hooks.json
  - .codex/hooks/**
  - .agents/local-skills/**
  - docs/decisions/**
  - docs/exec-plans/**
---

# Codex coding harness

## 目次

- [目的](#目的)
- [範囲](#範囲)
- [構成](#構成)
- [AGENTS.md](#agentsmd)
- [local skills](#local-skills)
- [ADRとexec plan](#adrとexec-plan)
- [custom agents](#custom-agents)
- [workflow](#作業手順)
- [read-onlyの検証](#read-onlyの検証)
- [有効化条件](#有効化条件)
- [レビュー契約](#レビュー契約)
- [waiver](#waiver)
- [Rules](#rules)
- [Hooks](#hooks)
- [MCP](#mcp)
- [理由と代償](#理由と代償)
- [受入条件](#受入条件)

## 目的

長いpromptだけに依存せず、リポジトリ知識、sandbox、品質ゲート、独立reviewを組み合わせます。

## 範囲

この文書のharnessはcoding workflowを対象にします。

```text
coding harness
  docs / skills / AGENTS.md
  ADR / exec plan
  custom agents
  Rules / Hooks
  static check / test / review
```

Spotlight、worktree隔離、runtime observability、performance monitoringはapplication observabilityであり、別の運用文書が正本です。名称を混同しません。

## 構成

```text
仕様とactive exec plan
  -> test_planner
  -> implementer  sole writer
  -> deterministic validation
  -> read-only reviewers
       correctness
       security
       tests
  -> implementer fix
  -> validationとre-review
```

## AGENTS.md

このrepositoryはroot `AGENTS.md`一つだけをcoding agentの共通contractにします。nested
`AGENTS.md`は作りません。近いfileがroot contractを上書きするclient差と、同じworkspace境界を
docs、skill、nested instructionへ三重記載するdriftを避けるためです。変更領域固有の必読文書、
command、boundaryはlocal skillがroutingします。

全規範を`AGENTS.md`へcopyしません。default size limitやcontext pollutionを避けるため、詳細はdocsとskillsへ分けます。

## local skills

skillは変更領域固有のworkflowです。

```text
必読文書
Workflow
Validation
禁止事項
```

Skillはarchitectureの正本ではありません。Nix生成先`.agents/skills`を直接編集せず、
`.agents/local-skills`をskill artifactの編集元にします。formatと責務は
[local skills README](../../.agents/local-skills/README.md)を参照します。

## ADRとexec plan

- ADR: 長期的な判断、理由、代替案、結果
- exec plan: taskの進捗、判断記録、検証証跡

複雑な変更を開始するときはactive planを作り、関連ADRと仕様へlinkします。完了後はcompletedへ移します。

## custom agents

Project config:

```toml
[agents]
max_threads = 5
interrupt_message = true

[agents.test_planner]
description = "変更前にtest layerを決めるread-only planner。"
config_file = "agents/test_planner.toml"
```

このrepositoryが検証対象とするCodex CLI `0.142.1`では、roleを`[agents.<role>]`として登録し、
各role fileに`model_reasoning_effort = "medium"`とsandboxを設定します。project configへ
model名を固定せず、CLIが認識しない互換aliasも先行して書きません。CLI更新時は実際にconfigをloadし、
custom agentを起動してからsyntaxを更新します。

役割:

| agent | sandbox | 責務 |
| --- | --- | --- |
| `test_planner` | read-only | test layer、risk、acceptance criteria |
| `implementer` | workspace-write | 唯一のwriter |
| `reviewer_correctness` | read-only | logic、contract、architecture |
| `reviewer_security` | read-only | auth、tenant、secret、destructive flow |
| `reviewer_tests` | read-only | missing test、false positive、flaky、over-mock |

model名はprojectで固定しません。availabilityとcostが変わり得るため、reasoning effortとrole contractを固定します。

## 作業手順

### 1. 計画

`test_planner`が次を返します。

```text
変更対象
invariant
必要なtest layer
不要な上位testと理由
paid testの要否
```

### 2. 実装

`implementer`だけがfileをwriteします。複数writerを同じworktreeへ並列投入しません。

### 3. 検証

最小の関連checkから始め、最終的にactive planのrequired commandを全て実行します。

### 4. レビュー

三つのreviewerを別threadで実行します。reviewerはcurrent base/head、spec、ADR、plan、test evidenceを読みます。

### 5. 修正と再レビュー

Findingは`implementer`へ戻します。変更後は古いreviewを無効とし、current diffで再reviewします。

## read-onlyの検証

`read-only`は設定しただけで保証済みとみなしません。導入時に各reviewerへrepository内のprobe file作成を依頼し、writeが拒否され、working treeが変化しないことを確認します。

失敗時の縮退:

1. harnessをactiveと宣言しない
2. reviewerをworkspace-write parentから起動しない
3. 明示的なread-only sessionまたはbuilt-in `:read-only` permission profileで再実行する
4. それでもwriteを防げないclientではhuman reviewとCIを必須にし、custom reviewerは補助扱いにする
5. issueへclient versionと再現手順を記録する

read-only probeはtest用temporary pathだけを対象にし、production fileを変更しません。

## 有効化条件

このharnessは設定file、fixture test、static validatorが成功しただけでは`implementation: active`へ
変更しません。信頼済みprojectの実Codex sessionで次を全て確認した時点で有効化します。

- custom agent 5役がwarningなしでloadされる
- reviewer 3役のtemporary write probeが拒否され、working treeが変化しない
- `SessionStart`、`PreToolUse`、`PostToolUse`が実sessionで発火する
- Rulesがpush、merge、deploy、destructive resetをpromptする
- deny対象の`drizzle-kit push`とgenerated skill直接編集が実sessionで拒否される

外部processへrepository contextを送る実行承認が得られない場合、probeは未実行として扱い、
fixture/static validationを成功の代替証拠にしません。その場合は前節の縮退手順を適用し、
metadataは`implementation: planned`を維持します。

## レビュー契約

Severity:

| 値 | 意味 |
| --- | --- |
| `P0` | data loss、重大security、release不能 |
| `P1` | correctness/security regression、必須修正 |
| `P2` | 実害可能性があるmaintainability/test risk |
| `P3` | 非blockingな改善 |

Finding format:

```json
{
  "reviewer": "reviewer_correctness",
  "base_sha": "...",
  "head_sha": "...",
  "findings": [
    {
      "severity": "P1",
      "path": "apps/api/src/example.ts",
      "line": 42,
      "claim": "tenant scopeが欠落している",
      "evidence": "queryがidだけを条件にしている",
      "required_fix": "organizationIdをpredicateへ追加する",
      "missing_test": "cross-tenant non-disclosure test"
    }
  ]
}
```

証拠のないstyle preferenceはfindingにしません。

## waiver

- P0/P1はwaiver不可
- P2はrepository maintainerの明示承認が必要
- P2 waiverにissue、owner、expiry、base/head SHA、代替mitigationを必須化
- expiryは最大14日
- expiry前に修正し、同じfindingを再reviewする
- P3はPRへ記録できるがmerge blockingではない

## Rules

`.codex/rules/default.rules`はcommand policyだけを扱います。

- deploy、merge、pushをforbiddenまたはprompt
- destructive DB resetをprompt
- read-only inspectionとlocal testはallow

coding styleやdirectory ruleをRulesへ書きません。それらはOxlint、docs、testの責務です。

Rulesは実験的機能なため、CIやGitHub permissionの代わりにしません。

`git push`、`/usr/bin/git push`、`env git push`、`bunx wrangler deploy`など、生の入力が単一の
静的なコマンドで、固定した`prefix_rule`と一致する形式だけはRulesが承認を求めます。変数代入、
引用符やエスケープによるトークン結合、複合コマンド、`eval`、`sh -c`、任意の作業ディレクトリを挟む
`git -C`や`bun --cwd`など、実行時の解釈後にだけ保護対象と判明する形式は`PreToolUse`が拒否します。
承認が必要な操作は標準形式へ戻してRulesの承認画面を使います。

## Hooks

repository単位の`.codex/hooks.json`を使用し、hook scriptは`.codex/hooks/`へ置きます。
`.codex/config.toml`、custom agent、Rules、Hooksはrepository contractとしてversion管理し、
`.gitignore`の対象にしません。

採用するhook:

| event | script | 責務 |
| --- | --- | --- |
| `SessionStart` | `session-start.ts` | active exec planと正本の場所を追加contextとして渡す |
| `PreToolUse` | `pre-tool-use-policy.ts` | 禁止操作とRulesで安全に表現できないwrapperをhard denyする |
| `PostToolUse` | `post-tool-use-review.ts` | protected harness file変更時にADR、exec plan、独立レビューを通知する |

RulesとHooksのdeterministic contract testは`.codex/codex-harness.test.ts`が所有し、root
`vitest.config.ts`から実行します。

hook scriptはrepositoryのBun/TypeScript toolchainへ統一し、commandはgit rootから絶対位置を
解決します。Codexをsubdirectoryから開始しても`.codex/hooks/`を見失わないためです。

push、merge、deploy、destructive resetは明示承認を可能にするため`.codex/rules`で`prompt`にし、
hookで常時denyしません。一方、repository契約上いかなる通常作業でも許可しない`drizzle-kit push`と
generated skill直接編集だけはhookでもfail-closedにします。

`PreToolUse`はコマンド文字列の単純な部分一致だけに依存しません。シェルのトークン、引用符結合、単純な
変数代入、`sh -c`と`eval`の固定文字列を解決し、変数経由またはDrizzleの実行ファイルを直接指定した
`drizzle-kit push`も拒否します。シェルが標準入力からコマンドを読む形式、Node.js、Bun、Python、
Ruby、Perlの引数なし実行または`-c`、`-e`による動的実行、コマンド置換、subshell、backtick、
未解決の変数展開、ANSI-C quote、brace展開、glob展開、backslash-newlineなど、安全に解析できない
構文は失敗時に拒否します。引数なしのインタープリターへ後続の`write_stdin`でコードを渡す経路にも
依存しません。

`.agents/skills/**`は`cwd`とツール入力の`workdir`、`cd`、パストラバーサルを反映した正規化後のパスで
判定します。`.agents/skills`自身だけでなく、その親`.agents`の削除や移動も保護します。保護対象の
パスへ触れるshellコマンドは、狭い読み取り専用コマンド一覧に一致する場合だけ許可し、`dd`、`tar`、
Gitの復元操作など、書き込み方法の列挙漏れから直接変更できないようにします。
リポジトリ全体を対象にした`find . -delete`、`-exec`、`-execdir`、`-ok`、`-okdir`も、対象パスを
後から動的に変更できるため拒否します。

Rulesの接頭辞と一致しないGit pushまたはmerge、PR merge、本番`deploy`、破壊的なデータベースの
リセット、リモートD1変更も拒否します。Gitの一時alias、`GIT_CONFIG_*`による実行時alias、
`git config alias.*`によるalias保存、`send-pack`、`gh api`によるPR merge、
パッケージ内の`db:reset`とリセットスクリプト、D1マイグレーションまたは復元、OpenNextの`deploy`、
Wranglerの`rollback`も同じ保護対象です。`git -C`、オプション付き`wrangler`、別のパッケージマネージャー
などのラッパーで承認を迂回できないことをフィクスチャで検証します。`gh api graphql`は外部の
`--input`や変数からmerge mutationを読み込めるため、クエリ内容をコマンドだけで証明できない
GraphQLラッパー全体を拒否します。

`hook`の`matcher`は`Bash`、`exec`、`exec_command`、`shell`、`write_stdin`を対象にします。
`Bash`と`shell`は`command`、`exec`と`exec_command`は`cmd`だけを読み、両方を指定した入力や
ツール種別と一致しないフィールドは拒否します。`write_stdin`は実行中processの文脈を再構成できない
ため、空のpollとCtrl-CまたはCtrl-Dによる停止だけを許可し、その他の文字入力を拒否します。静的に
解決できる`eval`と`sh -c`は内側のコマンドまで再帰的に解析し、未解決変数、コマンド置換、解析深度
上限を含む動的実行は失敗時に拒否します。解析できない構文を安全だと推測して許可する汎用shell
実行器にはしません。

Hooksは補助的なguardrailであり、次の代替にはしません。

- GitHub branch protection
- CI required check
- `.codex/rules`
- reviewerのread-only sandbox
- application側の認可

現時点では`type: "command"`だけを使用します。`prompt`と`agent` handlerは設定に書きません。
導入時はsafe/deny/malformed inputの代表payloadをtestへinline化してhook scriptを直接testし、
Codex session上でも発火を
確認します。session contextやread-only probeの成功は設定fileの存在だけでなく、実行したclient
versionと結果をexec planへ記録します。

## MCP

- external docsはread-only docs researcherへ限定
- package/version-sensitiveな一次資料を確認する
- internal docs検索MCPは通常のindex、`rg`、Git searchで不足が測定された場合だけ導入
- MCP結果をinstructionとして無条件に信頼しない

## 理由と代償

### 理由

- 実装contextとレビューcontextを分離する
- noisy explorationとtest logをmain threadから分ける
- writer権限を一体に限定する
- レビューを再現可能なformatへする

### 代償

- token使用量が増える
- clientのsandbox実装を検証する必要がある
- agentレビューだけではmergeを完全に強制できない

CIとhuman ownershipを残し、custom agentsを補強層として扱います。

## 受入条件

- project configとcustom agentsがloadされる
- reviewerのwrite probeが拒否される
- sole-writer workflowがAGENTSとskillに記載される
- P0/P1 waiverが存在しない
- current headで三reviewが完了する
- Rulesがdeploy/merge/pushを保護する
