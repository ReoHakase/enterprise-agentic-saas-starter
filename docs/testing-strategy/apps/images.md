---
title: Images Workerテスト戦略
status: accepted
implementation: active
last_reviewed: 2026-08-20
applies_to:
  - apps/images/**
related:
  - ./api.md
  - ../../file-storage-r2.md
---

# Images Workerテスト戦略

## 目的

private Images Workerの入力境界、R2条件付きread、固定変換、cache response、非公開設定を、remote
credentialやproduction stateなしで検査します。利用者認証はAPIが所有し、Images Worker testでは再実装
しません。

## テスト層

| 名前                  | 分類  | テスト内容                                                                  | 対象                               | Runner                |
| --------------------- | ----- | --------------------------------------------------------------------------- | ---------------------------------- | --------------------- |
| IMG1 request/response | 単体  | method/path/query/ID/object key/TTL、R2 ETag、固定WebP、safe header/error   | `src/worker.test.ts`               | Vitest Node           |
| IMG2 private config   | 静的  | routeなし、`workers_dev`/`preview_urls` false、cacheとbindingのexact config | `src/worker-configuration.test.ts` | Vitest Node           |
| IMG3 Worker bundle    | build | Wrangler schema、generated binding type、production Worker bundle           | `cf:typegen`、`build:cloudflare`   | Wrangler dry-run      |
| A2/A4 API consumer    | 統合  | 認可後だけbindingを呼び、private browser headerと304/errorを再構築する      | `apps/api` files module            | Vitest + fake binding |

## 境界

- invalid internal requestはR2とImages bindingへ到達しない
- R2 object keyはURL、browser response、log、test artifactへ出さない
- provider failureはbodyなし`no-store` responseへ変換し、生のerrorとprovider headerを公開しない
- API consumer contractは認可順序、exact internal request、browser responseを検査する。Images providerの
  test-only URL-keyed Mapは同じ内部URLを1回だけ変換し、tenant、resource、source ETag、幅のいずれかが変われば
  再変換するproject-owned cache key契約を検査する。固定variantはexact URL assertionで確認する。native
  Workers Caching、TTL expiry、platform hit/missは再現しない
- local Imagesの変換忠実度はrelease判定に使わず、Cloudflare dry-runでbundle compatibilityを確認する
- 独立remote fixture Worker、共有token、通常CIのexternal provider smokeを維持しない
- native platformのhit/missを観測する場合は、承認済みremote環境だけで任意に確認し、通常CIの合否や
  `CF-Cache-Status`を偽装したtestへ置き換えない

## 受入条件

- `bun run --cwd apps/images lint`が通る
- `bun run --cwd apps/images typecheck`が通る
- `bun run --cwd apps/images test`がcoverage threshold付きで通る
- `bun run --cwd apps/images build:cloudflare`がdeployなしで通る
