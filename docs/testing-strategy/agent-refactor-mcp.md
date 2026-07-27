---
title: AgentリファクタとMCP導入テスト戦略
status: proposed
implementation: planned
last_reviewed: 2026-07-28
applies_to:
  - apps/agent/**
  - apps/api/src/modules/agent/**
  - apps/api/src/mcp/**
  - apps/web/src/features/agent/**
  - packages/agent-contracts/**
  - packages/agent-tools/**
  - packages/auth/**
  - packages/db/**
  - apps/web/e2e/**
related:
  - ../architecture/agent-runtime-and-mcp.md
  - ../agent/runtime-reliability.md
  - ../agent/mcp-integration.md
  - ../exec-plans/active/agent-refactor-and-mcp.md
---

# AgentリファクタとMCP導入テスト戦略

## 目的

既存のworkspace別番号を維持し、対象範囲と実行速度が番号とともに増える設計を崩しません。

- Agentは`G1`から`G5`
- APIは`A1`から`A5`
- Webは`W1`から`W6`
- Authは`AUTH1`から`AUTH4`
- E2Eは`E1`と`E2`

`packages/agent-contracts`と`packages/agent-tools`に独自のテスト層番号は追加しません。package自身は
静的検査とcolocatedな実行時契約テストを所有し、consumer固有のvalidationとcompositionは既存層でも
検査します。

## Package検査

対象:

```text
packages/agent-contracts/**
packages/agent-tools/**
```

検査:

- typecheck
- oxlint
- knip
- package exports
- circular dependency
- `apps/*`への依存禁止
- `packages/db`、`packages/auth`への依存禁止
- Zod import禁止
- 公開tool inputにorganization、user、session、grant、tokenがない
- tool ID重複がない
- Valibot schemaが未知field、上限超過、tenant/capability fieldを拒否する
- Mastra `createTool` factoryがfake `AgentToolExecutor`へ検証済みinputを1回だけ渡す

package testは新しい公開番号を持たず`bun run test`へ含めます。Valibot schemaのconsumer境界値はA1と
G2、Agent compositionはG2、MCP登録はA4でも検査します。

## Agent G1からG5

| 名前                             | Testing Trophy 分類 | テスト内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 実物として使うもの                                                                       | 差し替えるもの                                        | 対象コード/ファイル                                                              | Test Runner                                | 実行速度           | CI時間課金以外の費用 | 量                     |
| -------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------ | ------------------ | -------------------- | ---------------------- |
| **Agent中核単体テスト G1**       | 単体                | <ul><li>abort、disconnect、provider error、timeoutを別状態へ分類する</li><li>Stopではsubmission IDを保持せず、disconnect/errorだけretry identityを保持する</li><li>useful-output watchdog、run timeout、tool side effect後retry禁止を境界値で確認する</li><li>resource ID、thread ID、model route、tool allowlist、reasoning policyを確認する</li><li>usage normalisation、safe error、secret scrubを確認する</li></ul>                                                                                 | pure function、Valibot schema、policy                                                    | clock、ID、pricing table                              | `apps/agent/src/mastra/core/**`、policy、usage、error                            | Vitest Node                                | 極めて速い         | なし                 | 非常に多い             |
| **Agent tool実行単体テスト G2**  | 単体                | <ul><li>`packages/agent-contracts`のValibot schemaが未知fieldと過大inputを拒否する</li><li>`packages/agent-tools`のMastra toolがfake executorへ正しいinputを1回渡す</li><li>abort signal、timeout、safe error projectionを確認する</li><li>server toolとclient toolの分類を確認する</li><li>Web検索がnested Agentを呼ばずexact queryを変更しない</li><li>attachment add/removeがexpected revisionを必須にする</li><li>`transform`と`toModelOutput`がprivate URL、R2 key、raw bytesを除外する</li></ul>  | 実Mastra tool、実Valibot schema、fake executor                                           | API、DB、provider                                     | `packages/agent-tools/**`、`apps/agent/src/mastra/tools/**`                      | Vitest Node + fake executor                | 極めて速いから速い | なし                 | 多い                   |
| **Agent決定的loop統合テスト G3** | 統合                | <ul><li>実Mastra Agent、Memory、LibSQLStore、native AI SDK streamを接続する</li><li>text、server tool、client tool、multi-step、source、approvalを確認する</li><li>server toolがbrowser client tool callbackへ流れないcontractを確認する</li><li>Stop、disconnect、reasoning-only timeout、provider error後に次turnを開始できる</li><li>Memoryへuserとassistant messageを保存し、process再生成後にreloadできる</li><li>suspended runを再発見し、approve/declineからresumeできる</li></ul>               | Agent、Memory、LibSQLStore、tool、stream、scripted model                                 | modelはscripted、business side effectはrecording fake | `apps/agent/src/mastra/agents/**`、`runtime/**`、`storage.ts`、`test-support/**` | Vitest + scripted model + temporary libSQL | 速いから中         | なし                 | 厚くする               |
| **Agent制御面統合テスト G4**     | 統合                | <ul><li>API thread registryとAgent Memoryが同じthread IDを使う</li><li>API認可後だけlist/recallでき、archive後はAgent dataが残っていても拒否する</li><li>ticket、grant、run quota、explicit cancel、Stop直後の次runを確認する</li><li>cancel、Agent abort、expiryが一つのterminal stateへ収束する</li><li>usage settlement、idempotency、current permission再検証を確認する</li><li>Web検索provider adapterとattachment transactionを確認する</li><li>Service Bindingの本番contractを接続する</li></ul> | 実API app、実Agent runtime、Application libSQL、Agent libSQL、Service Binding相当adapter | modelはscripted、search/R2はcontrolled fake           | `apps/agent/**`、`apps/api/src/modules/agent/**`                                 | Vitest + Elysia + libSQL                   | 中から遅い         | なし                 | 必要な範囲で厚くする   |
| **Agent実モデル挙動統合評価 G5** | 統合                | <ul><li>必要なtoolを選び禁止toolを選ばない</li><li>tool inputがValibot schemaを満たす</li><li>reasoningだけで終了せずtextまたはtoolへ進む</li><li>Web検索、画像読取、attachment mutationを正しく選択する</li><li>approval前にwriteしない</li><li>最大stepとtimeout内に終了する</li><li>Memoryから別thread情報を混同しない</li></ul>                                                                                                                                                                     | 実LLM、実instruction、実tool schema、実Memory設定                                        | business writeとDBはsynthetic                         | `apps/agent/src/mastra/evals/**`                                                 | Mastra evalまたはVitest                    | 遅い               | LLM料金あり          | 小さな評価データセット |

## G1必須case

- abortはfatal errorではない
- abortではretry identityを破棄する
- disconnectではretry identityを保持する
- provider errorではretry identityを保持する
- reasoning deltaだけではuseful-output timerを延長しない
- tool side effect後はprovider retryしない
- cancelとsettlementが二重計上しない
- snapshotへAPI client、関数、grant、resume ticket、provider key、private URLが入らない

## G2必須case

- unknown field
- nullとoptional
- 最大値直前、最大値、最大値超過
- server toolと`ui_*`の分類
- Web検索query完全一致
- private hostname除外
- attachment add/removeのrevisionと件数上限
- tool outputにcredential、R2 key、private URLがない
- attachment receiptはshared schemaのboundedなfile ID、Issue number、revisionだけを返す

## G3必須scenario

```text
text only
server tool success
server tool failure
client tool success
client tool failure
sequential tools
approval requested
approval approved
approval declined
user Stop
network disconnect
reasoning-only timeout
provider timeout
Memory reload
suspended run reload
```

## G4 crash point

```text
Application thread作成直後
Mastra user message保存直後
business tool side effect直後
Mastra assistant message保存直後
usage settlement直前
usage settlement直後
approval suspension直後
approval resume直後
archive registry更新直後
Agent thread削除直前
```

期待する不変条件:

- business side effectは最大1回
- usage ledgerは最大1件
- stale grantは利用不可
- archived threadは0件公開
- Stop後の次turnは成功
- suspended runは失われない

## API A1からA5

A6以降を追加しません。MCP、OAuth principal、PAT principalも既存A1からA5へ統合します。

| 名前                                         | Testing Trophy 分類 | テスト内容                                                                                                                                                                                                                                                                                                                                                                                                                                     | 実物として使うもの                                                            | 差し替えるもの                     | 対象コード/ファイル                                              | Test Runner                    | 実行速度           | CI時間課金以外の費用 | 量         |
| -------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------- | ------------------------------ | ------------------ | -------------------- | ---------- |
| **APIドメイン単体テスト A1**                 | 単体                | <ul><li>scopeとcurrent permissionの積を確認する</li><li>MCP tool exposure policy、principal、audience、tenant一致を確認する</li><li>明示的な業務冪等キーをprincipal、organization、tool、payload digestへ束縛し、JSON-RPC request IDを使わない</li><li>run cancel、attachment add/remove、prepared actionの状態遷移を確認する</li><li>Valibot schemaとsafe MCP error mappingを境界値で確認する</li></ul>                                       | pure policy、Valibot schema、value object                                     | clock、ID、random                  | `apps/api/src/mcp/domain/**`、agent domain、error mapper         | Vitest Node                    | 極めて速い         | なし                 | 非常に多い |
| **APIアプリケーションサービス単体テスト A2** | 単体                | <ul><li>OAuthまたはPAT principalからlocal executorを作る</li><li>scope確認後にcurrent membershipとpermissionを再確認する</li><li>MCP writeを直接実行し、expected revision、idempotency、audit順序を確認する</li><li>run cancelがgrantとquotaを解放する</li><li>attachment promotion、claim transfer、delete、thumbnail整合を確認する</li><li>拒否時にrepository、R2、providerを呼ばない</li></ul>                                              | service、domain、port                                                         | repository、Auth、R2、clock        | `apps/api/src/mcp/**/service.ts`、agent/file application service | Vitest Node + fake ports       | 極めて速いから速い | なし                 | 多い       |
| **APIリポジトリ統合テスト A3**               | 統合                | <ul><li>thread registry、run、quota、usage、prepared actionのFKとtransactionを確認する</li><li>OAuth grant、PAT hash、scope、expiry、revocation、last usedを確認する</li><li>MCP idempotencyとJSON-RPC retryを確認する</li><li>attachment add/removeとIssue revisionを同じtransactionで確認する</li><li>registry-only archive、archive後の非公開、rollbackを確認する</li><li>tenant predicateとcross-tenant non-disclosureを確認する</li></ul> | 実Drizzle query、実libSQL、実schema                                           | remote Turso、R2                   | `apps/api/src/**/repository.ts`、`packages/db` schema            | Vitest + temporary libSQL      | 速いから中         | なし                 | 厚くする   |
| **API HTTP契約統合テスト A4**                | 統合                | <ul><li>Agent chat、history、cancel routeのschema、status、errorを確認する</li><li>Mastra MCPServerのinitialize、tools/list、tools/call、prompts、resourcesを確認する</li><li>scope別tool filteringとtools/call時の再認可を確認する</li><li>read/write/attachment/upload toolを確認する</li><li>Agent、Workflow、`ui_*`、internal skillがMCPへ公開されない</li><li>Bearer auth、OAuth challenge、invalid PATを確認する</li></ul>               | Elysia app、Mastra MCPServer、実schema、`app.handle()`、実application service | external OAuth、ChatGPT、remote DB | `apps/api/src/modules/agent/routes/**`、`apps/api/src/mcp/**`    | Vitest + Elysia + MCP client   | 速いから中         | なし                 | 厚くする   |
| **API実HTTP統合テスト A5**                   | 統合                | <ul><li>Cloudflare serverless MCP transportとRequest/Response変換を確認する</li><li>実socket上のSSE、abort、disconnect、multiple headersを確認する</li><li>OAuth metadata、protected resource metadata、callback mountを確認する</li><li>Authorization headerとenvironment由来Bearer tokenを確認する</li><li>Service BindingとAgent native streamを確認する</li><li>transport固有の代表caseだけを検査する</li></ul>                            | ephemeral HTTP server、Worker adapter、実MCP client、実cookie jar             | production credential、ChatGPT本体 | `apps/api/src/worker.ts`、MCP route、Agent proxy、Auth mount     | Vitest + ephemeral HTTP server | 中から遅い         | なし                 | 少数       |

## Web W1からW6

新しい番号は追加しません。

### W1

- client tool allowlist判定
- native tool stateから表示stateへの変換
- abort、disconnect、error別のsubmission identity
- global errorとtool-local errorの分類
- Stop時のdraft復元判断

### W2

- 実行中toolがerror色にならない
- completed、denied、failedを区別する
- Stop済みturnがalertにならない
- raw reasoningを表示しない
- raw tool payloadを既定表示しない
- attachment add/removeのreceipt表示

### W3

Storybook state:

```text
idle
thinking status
server tool running
server tool completed
tool failed
approval required
approval declined
turn stopped
recoverable timeout
Web search source
attachment add/remove receipt
```

### W4

- server tool受信時に`addToolOutput()`を呼ばない
- `ui_*`だけをbrowserで実行する
- Stop後にerrorが消える
- Stop後に新しいmessageを送れる
- disconnect時は同じdraftをretryできる
- Web検索failureがtool card内に閉じる
- attachment mutation後にIssue queryをinvalidateする
- Memory reload responseをUIMessageとして描画する

### W5

- server-side API clientのhistory、cancel、MCP管理UI adapter
- cookieとAuthorization headerを混同しない
- OAuth consent redirectとorganization selection
- PAT作成responseを一度だけ表示するserver boundary

### W6

- OAuth login/consent pageのroute lifecycle
- Agent hard reload後のMemory history
- Stop後のbrowser historyとroute状態
- PAT管理画面のfresh-auth redirect

## Auth AUTH1からAUTH4

AUTH5を追加しません。

| 層      | 追加内容                                                                                                                          |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH1` | OAuth scope、resource audience、redirect URI、consent target、organization reference、PAT prefix、expiry parse、open redirect拒否 |
| `AUTH2` | Better Auth OAuth Provider、API key plugin、DB adapter、authorization code、refresh、revocation、PAT hash保存                     |
| `AUTH3` | PKCE、token endpoint、metadata、cookie、Origin、duplicate callback、Bearer認証、PAT revokeとrate limit                            |
| `AUTH4` | MCP OAuth client emulatorとのauthorize、callback、token exchange、refresh、revoke。OAuthとPATのcredential優先順位                 |

PAT関連caseはPhase 5までskipせず未実装として対象外にします。Phase 5開始時に同じAUTH1からAUTH4へ追加します。

## Phase別の費用境界

- Phase 1からPhase 3の各phaseで`bun run check`、`bun run test:browser`、`bun run test:e2e`、
  `bun run build:cloudflare`を実行する
- Phase 1のE1は別Application libSQLとAgent libSQLを接続し、Browser Modeも必須とする
- Phase 2とPhase 3のG5は各caseを3回実行し、3回とも成功した場合だけ合格とする
- E2はrelease候補だけの有料カナリアとし、通常phase完了判定へ含めない

## E2E E1とE2

### E1 決定的E2E

#### Web Agent journey

```text
thread作成
→ message送信
→ server tool running/completed
→ Memory保存
→ reload
→ Stop
→ explicit cancel
→ 同じthreadで次turn
→ Web検索
→ attachment追加/読取/削除
→ archive後に履歴拒否
```

実物:

- Chromium
- Next.js
- API Worker
- Agent Worker
- Service Binding
- Application libSQL
- Agent libSQL
- Better Auth
- scripted model
- fake search provider
- local R2

#### MCP OAuth journey

```text
OAuth login
→ organization consent
→ tools/list
→ read tool
→ create/update/delete Issue
→ upload session
→ attachment add/remove
→ membership変更後に拒否
→ revoke後に401
```

実ChatGPTは使わず、標準MCP clientとOAuth test clientを使います。

#### PAT journey

Phase 5で追加します。

```text
PAT発行
→ Bearer設定
→ tools/list
→ read/write
→ revoke
→ 401
```

### E2 完全E2E

- 実modelで通常回答が終了する
- 実modelでread/write toolを選ぶ
- 実Web search providerからsourceを返す
- 実画像入力を読む
- OAuth MCPの本番相当transportを1件確認する

Stop、全permission matrix、PAT全caseはE1と下位層で保証し、E2へ重複させません。

## 実行script

```json
{
  "scripts": {
    "test": "vitest run --config vitest.config.ts && turbo run test",
    "test:browser": "turbo run test:browser",
    "test:e2e": "turbo run test:e2e --filter=@enterprise-agentic-saas/web",
    "test:eval:agent": "turbo run test:eval:agent --filter=@enterprise-agentic-saas/agent",
    "test:e2e:full": "turbo run test:e2e:full --filter=@enterprise-agentic-saas/web"
  }
}
```

MCP専用root scriptを増やしません。

| script            | 主な層                                              |
| ----------------- | --------------------------------------------------- |
| `test`            | G1からG4、A1からA5、AUTH1からAUTH4、package静的検査 |
| `test:browser`    | W3、W4、W6                                          |
| `test:e2e`        | E1 Web Agent、MCP OAuth、Phase 5以後PAT             |
| `test:eval:agent` | G5                                                  |
| `test:e2e:full`   | E2                                                  |

## 変更別実行

| 変更                 | 必須                                     |
| -------------------- | ---------------------------------------- |
| Valibot contract     | static、G2、A1、A4                       |
| tool factory         | static、G2、G3、A4                       |
| Memory/Storage       | G3、G4、E1                               |
| stream/UI state      | G3、W1からW4、E1                         |
| cancel/run lifecycle | G1、G3、G4、A1からA4、W4、E1             |
| Web検索              | G2からG5、W4、E1、必要時E2               |
| attachment tool      | G2、G4、A1からA4、W2/W4、E1              |
| MCP server           | A1からA5、AUTH1からAUTH4、E1             |
| PAT                  | A1からA5、AUTH1からAUTH4、E1 PAT journey |

## 受入条件

- 公開layer番号が増えていない
- A1からA5が対象範囲と速度の順序を維持する
- G1からG5が決定的安全性と実model評価を分離する
- `agent-contracts`と`agent-tools`に独自の公開layer番号がない
- packageの実行時契約テストがcolocatedされ、root `test`から実行される
- consumer固有のpackage実行時挙動がG2、A1、A4でも検査される
- 既知不具合の回帰caseがW、G、A、E1へ配置される
- MCP read/write、OAuth、最終phaseのPATが既存層に統合される
