# Cloudflare Images remote smoke

Cloudflare Images bindingの高忠実度remote実装で、private previewと同じ変換contractを確認する独立harness。production API、Turso、R2には接続せず、起動中だけ存在する`wrangler dev --remote` Workerへcommit済みPNG fixtureを送る。

確認内容は次のとおり。

- request bodyを`IMAGES.input()`へstreamで渡す。
- `width: 360`、`fit: "scale-down"`を適用する。
- WebP、quality 75、`anim: false`で出力する。
- responseがWebP signatureを持ち、720x480 fixtureから360x240になる。
- credential不一致時はImages bindingへ触れない。
- provider error、credential、画像本文をterminalやWorker logへ出さない。

## 実行

Cloudflare accountでImagesを利用可能にし、Wranglerへloginしてから次を実行する。

```sh
cd apps/api
bun run smoke/images/run.ts
```

`run.ts`は起動ごとにrandom tokenを`apps/api/.dev.vars.images-smoke`へmode 0600で作成する。このfileはroot `.gitignore`の`.dev.vars.*`で除外される。Wranglerにはfile pathだけを渡し、tokenをcommand argumentへ含めない。clientは同じtokenを`Authorization: Bearer` headerへ設定する。終了時はremote dev Workerとenv fileを削除する。

成功時に出すのは固定event名、format、dimensions、output byte数だけである。Wranglerのstdout/stderrは保持せず破棄する。失敗時も固定error codeだけを出し、Cloudflare raw errorやresponse本文を出さない。login状態は事前に`bun run wrangler whoami`で確認する。

port 8791が使用中なら、非secretの`IMAGES_SMOKE_PORT`で変更できる。

```sh
IMAGES_SMOKE_PORT=8792 bun run smoke/images/run.ts
```

## local検証

remote credentialを使わないunit test、型生成、bundle検証は次で実行する。

```sh
cd apps/api
bun run vitest run smoke/images
bun run wrangler types \
  --config wrangler.images-smoke.jsonc \
  --env-file smoke/images/.dev.vars.example \
  --env-interface ImagesSmokeEnv \
  smoke/images/cloudflare-env.d.ts \
  --strict-vars=false
bun run tsc --project smoke/images/tsconfig.json
bun run wrangler deploy --dry-run --config wrangler.images-smoke.jsonc
```

local Imagesは低忠実度なので、このremote smokeの代替にはしない。通常test/CIでCloudflare credentialを要求せず、明示的な運用確認として分離して実行する。
