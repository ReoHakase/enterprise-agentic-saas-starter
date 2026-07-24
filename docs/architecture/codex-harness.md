---
title: Codex coding harness
status: proposed
implementation: planned
last_reviewed: 2026-07-24
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
enabled = true
max_concurrent_threads_per_session = 5
default_subagent_reasoning_effort = "medium"
interrupt_message = true
```

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

## Hooks

repository単位の`.codex/hooks.json`を使用し、hook scriptは`.codex/hooks/`へ置きます。

採用するhook:

| event | script | 責務 |
| --- | --- | --- |
| `SessionStart` | `session-start.ts` | active exec planと正本の場所を追加contextとして渡す |
| `PreToolUse` | `pre-tool-use-policy.ts` | `drizzle-kit push`とgenerated skill編集をhard denyする |
| `PostToolUse` | `post-tool-use-review.ts` | protected harness file変更時にADR、exec plan、独立レビューを通知する |

hook scriptはrepositoryのBun/TypeScript toolchainへ統一し、commandはgit rootから絶対位置を
解決します。Codexをsubdirectoryから開始しても`.codex/hooks/`を見失わないためです。

push、merge、deploy、destructive resetは明示承認を可能にするため`.codex/rules`で`prompt`にし、
hookで常時denyしません。一方、repository契約上いかなる通常作業でも許可しない`drizzle-kit push`と
generated skill直接編集だけはhookでもfail-closedにします。

Hooksは補助的なguardrailであり、次の代替にはしません。

- GitHub branch protection
- CI required check
- `.codex/rules`
- reviewerのread-only sandbox
- application側の認可

現時点では`type: "command"`だけを使用します。`prompt`と`agent` handlerは設定に書きません。
導入時はsafe/deny/malformed inputのfixtureでhook scriptを直接testし、Codex session上でも発火を
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
