---
name: e2e-test
description: enterprise-agentic-saas-starterのPlaywright E2E、auth/OAuth、tenant、Worker連携、E2E data、browser matrix、paid Agent canaryを変更するときに使う。
---

# E2E Test

## 必読文書

- [テスト戦略](../../../docs/testing/README.md)
- [Webテスト](../../../docs/testing/web.md)
- [統合E2E](../../../docs/testing/e2e.md)
- [製品Agentのrelease gate](../../../docs/agent/testing.md)
- [GitHub OAuth emulator](../../../docs/architecture/apps/github-emulator.md)

## Workflow

1. `test_planner`で最も低いdeterministic layerとbrowserが必要な境界を決める。
2. 一般UIとmock transportはE1、auth/session/cookie/Origin/CORS/CSRF、OAuth、実Worker/API/DBは
   E2へ置く。
3. OAuth emulator suiteは`test:e2e`内のE2 profileに集約し、独立root scriptを追加しない。
4. run/worker/test/organization/user/DB/R2をnamespace化し、共有resetを作らない。
5. setupは対象がloginそのものでない限りAPI fixtureを使う。
6. Agent behavior変更はbrowserless L6を先に実行し、release candidateだけL7 canaryを実行する。
7. paid supervisor、child process、artifact、tmp cleanupを製品Agentのsecret契約へ合わせる。

## Validation

- 通常のfree E2E: `bun run test:e2e`
- interaction/a11y変更: `bun run test:browser`
- Agent fingerprint変更: `bun run test:eval:agent`
- release candidate: `bun run test:e2e:agent`
- Cloudflare境界変更: `bun run build:cloudflare`

Selector変更時はgeneral UI、server/auth/cookie、OAuth emulator、Agent/DB、unknown pathのfixtureを
検証し、unknownはE1+E2へfail-safeします。

## 禁止事項

- external GitHub credentialやproduction dataへ接続しない。
- shared stateを理由にsuite全体を`workers: 1`へ固定しない。
- `test:e2e:oauth`等のroot公開scriptを増やさない。
- paid suiteでvideo、trace、screenshot、HTML/DOM、provider raw responseを保存しない。
- secretをbrowser、Web、API、parent test runnerへ渡さない。
- mock E1だけでauthorization、tenant、cookie、Service Bindingを保証しない。
