---
title: 製品Agentのarchitectureとsecurity
status: accepted
implementation: active
last_reviewed: 2026-07-25
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
- Browser response、URL、log、Sentry、auditへticket/grant/session値を出しません。

connection ticketは一回限り、60秒以内です。run grantは5分以内とし、各internal callでlive session、active organization、epoch、membership、permission、thread owner、run ownerを再検証します。別tenant、非member、不存在resourceは同じnot-found projectionへ丸めます。

## 依存方向

許可する依存は次だけです。

```text
apps/web ──> @enterprise-agentic-saas/api/client
apps/agent ──> @enterprise-agentic-saas/api/agent-client
apps/api ──> @enterprise-agentic-saas/db
packages/ui ──> domain非依存UI
```

WebからAPI schemaやrepositoryをdeep importしません。Agentからpublic API、DB、Webをimportしません。APIのprivate Agent appをpublic Elysia appへmountしません。restricted-import ruleとpackage exportでこの方向を固定します。

## Source layout

- `apps/agent/src/mastra/worker.ts`: fail-closed production Worker entrypoint
- `apps/agent/src/mastra/index.ts`: StudioとWorkerが共有するMastra composition
- `apps/agent/src/mastra/core/`: message、policy、budget、usage、stop condition
- `apps/agent/src/mastra/runtime/`: Agent loop、resume、settlement、consumer-owned port
- `apps/agent/src/mastra/tools/`: `schema.ts`、Mastra非依存`execute.ts`、薄い`tool.ts`
- `apps/agent/src/mastra/adapters/control-plane/`: private control-plane concrete client
- `apps/agent/src/mastra/test-support/`: scripted modelとcanonical fixture
- `apps/agent/src/mastra/e2e/worker.ts`: free E2E専用entrypoint
- `apps/agent/src/mastra/legacy/issue-assistant.ts`: 到達不能な旧class retention
- `apps/api/src/modules/agent/`: public route、private route、thread/run/action/context/usage repository
- `apps/web/features/agent/`: shell、transport、query、runtime state、UI components

大きな処理をentrypointへ戻さず、認可とtransactionはAPI、model/tool orchestrationはAgent、表示と一時draftはWebへ閉じます。
generated `apps/agent/src/cloudflare-env.d.ts`以外のhand-written runtimeを`src/mastra/**`外へ
残しません。

## Legacy retention

旧`IssueAssistant`は`src/mastra/legacy/issue-assistant.ts`へ置き、runtimeから到達不能なlegacy
retention classとして隔離します。旧HTTP surfaceは`410 Gone`を返します。現releaseではWranglerの
既存`new_sqlite_classes` tagとclass exportを保持し、`deleted_classes` migrationを追加しません。
export/backfill、件数確認、保持方針、backup確認を終えた別releaseだけが不可逆削除できます。

## Privacyとobservability

Sentry SDKをapplication telemetryの正本とし、Cloudflare Sentry OTLP exportを重ねません。prompt、Issue本文、検索query、拒否文字列、tool payload、member identity、credential、raw provider errorをlog/traceへ出しません。transaction名、error code、bounded status、opaqueでないaggregateだけを許可します。
