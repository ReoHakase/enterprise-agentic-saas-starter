---
name: e2e-test
description: enterprise-agentic-saas-starterのPlaywright E2E、auth/OAuth、tenant、Worker連携、E2E data、browser matrix、paid Agent canaryを変更するときに使う。
---

# E2E Test

## 必読文書

- [テスト戦略](../../../docs/testing-strategy/README.md)
- [Webテスト](../../../docs/testing-strategy/apps/web.md)
- [統合E2E](../../../docs/testing-strategy/e2e.md)
- [製品Agentのrelease gate](../../../docs/agent/testing.md)
- [Emulate](../../../docs/architecture/apps/emulate.md)

## Workflow

1. 最も低い決定的なテスト層とブラウザーが必要な境界を変更前に決める。
2. 一般UIとmock transportはW3、W4、W6へ置き、auth/session/cookie/Origin/CORS/CSRF、OAuth、
   実Worker/API/DBの最終配線はE1へ置く。
3. Emulateのprovider suiteは`test:e2e`内のE1 profileに集約し、独立root scriptを追加しない。
4. run/worker/test/organization/user/DB/R2をnamespace化し、共有resetを作らない。
5. setupは対象がloginそのものでない限りAPI fixtureを使う。
6. free E2EのWebはprofile固有のproduction buildを`next start`で起動する。E1はbuildを共有し、
   Chromiumを最大3 workers、代表WebKitを別processで単独実行する。
7. Agent behavior変更はbrowserless G5を先に実行し、release candidateだけE2 canaryを実行する。
8. paid runnerが起動したchild processとtmp resourceだけを終了時にcleanupする。

## Validation

- 通常のfree E2E: `bun run test:e2e`
- interaction/a11y変更: `bun run test:browser`
- Agent paid eval: `bun run test:eval:agent`
- release candidate: `bun run test:e2e:full`
- Cloudflare境界変更: `bun run build:cloudflare`

通常CIは決定的E1をpathにかかわらず全件実行します。

## 禁止事項

- external GitHub credentialやproduction dataへ接続しない。
- shared stateを理由にsuite全体を`workers: 1`へ固定しない。
- `test:e2e:oauth`等のroot公開scriptを増やさない。
- paid suiteでvideo、trace、screenshot、HTML/DOM、provider raw responseを保存しない。
- secretをbrowser、Web、API、parent test runnerへ渡さない。
- mock E1だけでauthorization、tenant、cookie、Service Bindingを保証しない。
