---
name: backend-api
description: enterprise-agentic-saas-starterのElysia API、authorization、transaction、Valibot schema、Eden client、OpenAPI、service/repository境界を変更するときに使う。
---

# Backend API

## 必読文書

- [API設計](../../../docs/architecture/apps/api.md)
- [命名とlayer](../../../docs/architecture/naming-and-layers.md)
- [API / OpenAPI](../../../docs/api-openapi.md)
- [APIテスト戦略](../../../docs/testing-strategy/apps/api.md)

## Workflow

1. feature moduleのpublic surfaceと、domain、schema、port、service、repository、routeの責務を確認する。
2. route schemaを`apps/api`へ閉じ、HTTP変換とbusiness logicを分離する。
3. authorizationとtenant predicateをtransaction境界の内側で検証する。
4. public error、OpenAPI metadata、Eden client surfaceを同じ変更で更新する。
5. `app.handle()`を使う最小testから始め、Worker変更時はCloudflare bundleも検証する。

## Validation

- `bun run --cwd apps/api lint`
- `bun run --cwd apps/api typecheck`
- `bun run --cwd apps/api test`
- OpenAPI変更時: `bun run --cwd apps/api test -- openapi --coverage.enabled=false`
- Worker変更時: `bun run --cwd apps/api build:cloudflare`

## 禁止事項

- routeからDB adapterを迂回して直接queryしない。
- organization IDを欠くtenant queryを作らない。
- Web向けにschemaやprivate moduleをexportしない。
- Errorを握りつぶしたり、内部messageをpublic responseへ露出したりしない。
