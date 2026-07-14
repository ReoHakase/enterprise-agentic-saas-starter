# Package Management Reference

## package export例

`apps/api/package.json`:

```json
{
  "name": "@enterprise-agentic-saas/api",
  "private": true,
  "type": "module",
  "exports": {
    "./client": {
      "types": "./src/client.ts",
      "default": "./src/client.ts"
    },
    "./types": {
      "types": "./src/app.ts"
    }
  }
}
```

web側:

```ts
import { createApiClient } from "@enterprise-agentic-saas/api/client";
import { clientEnv } from "./env.client";

export const api = createApiClient(clientEnv.NEXT_PUBLIC_API_URL);
```

## package追加判断

追加してよい:

- `packages/db`: Drizzle schema/client/migration。
- `packages/auth`: Better Auth core。framework非依存。
- `packages/email`: templates、render、sender adapters。
- `packages/ui`: React DOM components。

まだ作らない:

- `packages/api-client`: `apps/api` からexportする。
- `packages/config`: envは各appが持つ。
- `packages/contracts`: Eden/Valibot/OpenAPIで足りなくなり、複数server appで安定した公開protocolを共有する必要が出たあと。
- `packages/validators`: 作らない。API schemaは`apps/api`、browser schemaは`apps/web`へ閉じる。

## 将来拡張

```txt
apps/mobile      # Expo
apps/desktop     # Tauri
packages/native-ui
```

これらはテンプレート初期状態では入れない。
