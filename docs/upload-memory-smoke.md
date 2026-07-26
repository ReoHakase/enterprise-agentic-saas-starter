---
title: 10 MB multipart upload memory smoke
status: accepted
implementation: active
last_reviewed: 2026-07-25
---

# 10 MB multipart upload memory smoke

Agent chat画像の上限であるdecimal `10_000_000` bytesを、productionと同じElysia `multipart/form-data` schemaと`File.stream()`→R2 `put`の形でlocal workerdへ並列送信する診断用smokeです。専用の一時local R2 simulationだけを使い、Turso、production R2、Cloudflare API、OpenRouterなどのcredentialや外部課金は使いません。HTTP multipart uploadを測るものであり、R2 Multipart Upload APIは使いません。

## 実行

repoの開発環境で次を実行します。既定は4並列で、`2..32`の範囲を指定できます。

```sh
bun run --cwd apps/api smoke:upload-memory -- --concurrency=4
```

scriptは一時directoryとloopback portを確保し、専用Wrangler configで`wrangler dev --local`を起動します。各requestのfile partは正確に`10_000_000` bytesです。終了時に一時R2 stateとprocessを削除し、JSONをstdoutへ1件出します。

```json
{
  "fileBytes": 10000000,
  "multipartRequests": 4,
  "succeeded": 4,
  "failed": 0,
  "statusCounts": { "204": 4 },
  "rss": {
    "unit": "KiB",
    "baselineOwnedWorkerdAggregate": 0,
    "peakSingleWorkerdProcess": 0,
    "peakOwnedWorkerdAggregate": 0,
    "peakOwnedWorkerdProcessCount": 0,
    "peakWranglerProcessTree": 0,
    "samples": 0,
    "samplingFailed": false
  }
}
```

reportを比較用artifactとして残す場合は、secretを含まないstdoutだけを保存します。

```sh
bun run --cwd apps/api smoke:upload-memory -- --concurrency=4 \
  > upload-memory-smoke.json
```

`failed > 0`、RSS sampling失敗、workerdを検出できない場合はexit code 1です。HTTP bodyやR2 key、filename、provider errorはreportへ出しません。parser、upload上限、Elysia、Wrangler、R2書込経路を変更したときは、同じmachine・同じ並列数でbefore/afterを比較します。

## 128 MBとの読み方

Cloudflare Workers productionのmemory上限はisolateごとに128 MBで、JavaScript heapとWebAssembly allocationを含みます。一つのisolateは複数requestを並行処理します。[Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/#memory)

このscriptが測るのはOSから見たlocal `workerd` processのRSSです。local R2 simulation等のため複数workerdが起動する場合があるので、最大の単一processと所有process合計を分けて記録します。RSSにはV8 isolate以外のnative runtime、allocator、Wrangler/Miniflareが提供するlocal binding simulationなども含まれるため、production dashboardのisolate memoryとは同じ指標ではありません。したがって次のどちらも成立しません。

- peak workerd RSSが128 MB未満だからproduction上限を満たす
- peak workerd RSSが128 MBを超えたからproductionで必ずmemory errorになる

local結果は、同一条件での回帰、multipart parserが並列file全体を保持する兆候、transport failureを早期検出するためのphase 0 evidenceです。Cloudflareもlocal memory profileはproduction behaviorの完全再現が難しく、production相当requestで検証するよう案内しています。[Profiling Memory](https://developers.cloudflare.com/workers/observability/dev-tools/memory-usage/)

release判定では、このsmokeの`failed=0`だけで完了扱いにしません。stagingの実API Workerへ同じ並列条件を適用し、Workers dashboardのMemory Usageと`exceededMemory` / Error 1102がないことを確認します。staging実行はcredentialとCloudflare利用を伴う別の明示手順とし、このlocal commandから自動実行しません。

## 実装対応範囲

専用Workerは本番routeを複製せず、次だけを再利用します。

- `agentAssetUploadBodyModel`のstrict multipart schemaと10,000,000-byte上限
- Elysia Cloudflare adapterと`parse: "multipart/form-data"`
- `File.stream()`をprivate R2 bindingのsingle `put`へ渡す方式
- `application/octet-stream`、R2 Standard、conditional create

認証、tenant DB transaction、quota、Images infoはmemory観測を混同しないため対象外です。これらの正しさは通常のAPI integration testで検証し、このsmokeはmultipart parserとR2 stream間のlocal process memoryへ閉じます。
