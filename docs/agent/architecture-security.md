---
title: 製品Agentのarchitectureとsecurity
status: accepted
implementation: active
last_reviewed: 2026-08-23
---

# Architectureとsecurity

## Runtime境界

製品Agentは次の3 Workerに分離します。

```text
Browser
  └─ Web Worker: Next.js / Agent Shell / AI SDK UI
       └─ credentialed HTTP
          API Worker: Better Auth / Origin / tenant / DB / R2 / usage
            ├─ private AGENT_RUNTIME Service Binding
            │    Agent Worker: Mastra / model / tool adapter / stream
            └─ named AGENT_INTERNAL_API entrypoint
                 private Elysia / Drizzle / domain service
```

BrowserはAgent Workerを直接呼びません。Agent Workerは`workers.dev`、preview URL、custom domainを持たず、Turso、R2、Better Auth tableへ直接触りません。公開routeはAPI Worker、業務データの正本はAPI/Tursoです。

## 認証とCSRF

- public Agent routeはBetter Authのlive sessionとglobal Origin検証を使います。独自CSRF headerは追加しません。
- Service Bindingはnetwork boundaryでありactor identityではありません。
- connection ticket、connection grant、run grant、resume ticketは256-bit以上のopaque random値です。DBにはhashだけを保存します。
- capabilityはsession、user、active organization、thread、context epoch、run/scope、expiryへ束縛します。
- active organization、account、role、membershipの変更時はepochをtransaction内でrotationし、旧capability、run、action、policyを失効します。
- Browser response、URL、production log、remote telemetry、auditへticket/grant/session値を出しません。

connection ticketは一回限り、60秒以内です。run grantは5分以内とし、各internal callでlive session、active organization、epoch、membership、permission、thread owner、run ownerを再検証します。別tenant、非member、不存在resourceは同じnot-found projectionへ丸めます。

AgentからAPIへの非公開`port`は18操作に限定します。

- 接続とrun: `consumeConnectionTicket`、`startChatRun`、`assertRunLive`、`finalizeRun`
- Web検索: `authorizeWebSearch`
- 読み取り: account、active organization、member、label、Issue、2種類の画像
- 書き込み: Issueのcreate、update、delete準備、承認済みactionのresumeとexecute

chat開始では`startChatRun`がticket消費、現在の認可、runとquotaの作成、asset束縛、run grant発行を
1つのトランザクションで行います。Memoryの読み取りではrunを作らないため、
`consumeConnectionTicket`を維持します。モデル呼び出しはprovider開始前とストリーム完了時の
`TransformStream.flush()`でだけ`assertRunLive`を実行し、断片ごとの再検証や時間制限付きleaseを
追加しません。`finalizeRun`は任意のmain model usageとterminal状態をAgentからの1回の呼び出しで
確定し、usage記録が失敗してもrunを`running`へ残しません。

開始済みstreamは、途中でsessionやmembershipが失効しても、完了時の再検証まで現在のstream断片が
browserへ届くことがあります。完了時の`assertRunLive`が成功した場合だけ最終結果を受理し、Memory保存と
次のmodel/tool stepを許可します。失敗時は現在のstream断片を回収しませんが、Memory保存、次のmodel/tool
step、業務副作用を拒否します。利用者のStopとrequest abortは即時に中断し、この失効露出時間はrun全体
上限の270秒を超えません。

## 依存方向

許可する依存は次だけです。

```text
apps/web ──> @enterprise-agentic-saas/api/client
         └─> @enterprise-agentic-saas/agent-contracts
apps/agent ──> @enterprise-agentic-saas/agent-contracts
           └─> Service Binding ──> apps/api private entrypoint
apps/api ──> @enterprise-agentic-saas/db
         └─> @enterprise-agentic-saas/agent-contracts
packages/ui ──> domain非依存UI
```

WebからAPI schemaやrepositoryをdeep importせず、Agent公開responseは`agent-contracts`から直接importします。Agentからpublic API、DB、Webをimportしません。APIのprivate Agent appをpublic Elysia appへmountしません。restricted-import ruleとpackage exportでこの方向を固定します。

## Source layout

- `apps/agent/src/mastra/worker.ts`: fail-closed production Worker entrypoint
- `apps/agent/src/mastra/index.ts`: StudioとWorkerが共有するMastra composition
- `apps/agent/src/mastra/core/`: message、policy、budget、usage、stop condition
- `apps/agent/src/mastra/runtime/`: Agent loop、resume、settlement、consumer-owned port
- `apps/agent/src/mastra/tools/`: `schema.ts`、Mastra非依存`execute.ts`、薄い`tool.ts`
- `apps/agent/src/mastra/adapters/control-plane/`: private control-plane concrete client
- `apps/agent/src/mastra/test-support/`: scripted modelとcanonical fixture
- `apps/agent/src/mastra/e2e/worker.ts`: free E2E専用entrypoint
- `apps/api/src/modules/agent/`: public route、private route、thread/run/action/context/usage repository
- `apps/web/src/features/agent/`: shell、transport、query、runtime state、UI components

大きな処理をentrypointへ戻さず、認可とtransactionはAPI、model/tool orchestrationはAgent、表示と一時draftはWebへ閉じます。
generated `apps/agent/src/cloudflare-env.d.ts`以外のhand-written runtimeを`src/mastra/**`外へ
残しません。

## Privacyとobservability

OpenTelemetryをapplication signal contractにし、localでは共有LGTMへ一本化します。production remote backendは未構成です。production log、remote telemetry、test artifactにはprompt、Issue本文、検索query、拒否文字列、tool payload、member identity、credential、raw provider errorを出しません。localは`NODE_ENV=development`かつ固定loopback endpointの場合だけ調査用contentを保持し、認証materialを常時redactします。binary/image bytesはmetadataだけを残します。
