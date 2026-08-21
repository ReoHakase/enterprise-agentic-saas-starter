---
title: apps/imagesの設計
status: accepted
implementation: active
last_reviewed: 2026-08-20
applies_to:
  - apps/images/**
---

# apps/imagesの設計

## 責務

`apps/images`は、認証済み画像previewを変換してWorkers Cachingへ保存するprivate Cloudflare
Workerです。`apps/api`からのService Binding `IMAGE_PREVIEWS`だけを入口にし、route、custom
domain、`workers_dev`、preview URLを持ちません。

APIはBetter Auth、organization membership、active organization、resource ownership、Agent assetの
sessionと有効期限を確認してからbindingを呼びます。Images Workerは利用者認証やDBを所有せず、private
R2から条件付きで原本を読み、固定した幅とWebP変換だけをCloudflare Images bindingへ委譲します。

## 内部request契約

内部URLはresource種別、opaqueなorganization/resource ID、許可済み幅、source ETag、変換versionだけを
含みます。R2 object keyとcache TTLは内部headerだけで渡し、Authorization、cookie、signed URL、filenameを
含めません。Workerはmethod、path、query、ID、幅、object keyのorganization prefix、TTL上限を検証してから
R2へ到達します。

TTLは既存のpreview契約を維持します。

- generic file: 30日
- promoted Agent asset: 3日
- temporary Agent asset: 残り有効期限を1秒から3日の範囲へ制限した値

成功時は`image/webp`、variant ETag、安全な`Content-Length`、`public, max-age=..., must-revalidate`だけを
返します。provider headerと生のerrorは転送も記録もしません。APIは内部responseから許可したheaderだけを
取り出し、browser向けに`private, no-cache`、ETag、304、security headerを再構築します。

## runtimeと依存境界

- `FILES`: APIと共有するprivate R2 bucket
- `IMAGES`: Cloudflare Images binding
- Workers Caching: `apps/images/wrangler.jsonc`だけで有効
- workspace source dependency: なし
- Node.js compatibility flag: なし。Worker runtimeはWeb Platform APIだけを使う

localではAPIをprimary、Images WorkerをauxiliaryとするWrangler multi-config sessionを使い、同じlocal
R2 stateとService Bindingを共有します。別port、共有token、public HTTP fallbackを追加しません。

## 受入条件

- 未認証または不正なresourceのAPI requestではService Bindingを呼ばない
- object keyを内部URL、browser response、logへ出さない
- success以外をキャッシュせず、安全なbodyなしresponseだけを返す
- `workers_dev=false`、`preview_urls=false`、routeなしを設定testで固定する
- `bun run --cwd apps/images lint`、`typecheck`、`test`、`build:cloudflare`が通る
