---
name: file-storage-r2
description: enterprise-agentic-saas-starterの認証付き汎用file storage、Cloudflare R2/Images binding、`/files/*` API、Turso/Drizzle metadataとquota、Issue attachment UI、local Wrangler seed/reconcile、download/preview cacheを追加・変更・調査するときに使う。
---

# File storage with R2

このskillはprivate R2へoriginalを保存し、Elysia Workerだけを通して認証付きfileを扱う実装で使う。Cloudflare一般の構成より、以下のrepo固有contractを優先する。

## 境界

- API、DB、query key、R2 bindingは`file`として汎用化する。v1のownerは`issue`だけに閉じ、owner typeを文字列自由入力にしない。
- fileは作成時からimmutableな単一ownerを持つ。未所属upload、後付けattach、owner変更、organization全体のfile browserを追加しない。
- R2 bucketはprivateのままにし、public access、`r2.dev`、presigned downloadを使わない。binding名は`FILES`、既存の物理bucket名は`enterprise-agentic-saas-attachments`を維持する。
- DBへURLを保存しない。内部object keyとmetadataだけを保存し、browser向けURLは`@enterprise-agentic-saas/api/client`のbuilderで都度生成する。
- WebがAPIからimportしてよいのは`@enterprise-agentic-saas/api/client`だけ。route schemaのdeep importやvalidators packageを作らない。

## Tenant、認証、権限

- 全routeへ既存のBetter Auth `organizationAccess` macroを宣言する。未認証は401、active organization不一致は409、非member・別tenant・不存在owner/fileは同じ404へ丸める。
- repository queryはfile/owner IDだけで引かず、必ず`organizationId`を含める。DBもtyped owner tableのcomposite FKでtenant境界を強制する。
- `FileOwnerAdapter` registryでowner存在確認、read/upload/delete権限、typed owner row、owner削除cleanupを分離する。
- Issue ownerはmemberがlist/read/uploadできる。削除はuploader本人または`admin` / `super_admin`だけにする。
- filename、内容、URL、object key、raw provider error、tenant/user/resource IDをlog、Sentry、auditへ出さない。auditは`file.uploaded` / `file.deleted`と安全なmetadataだけをtransaction内へ保存する。

## DBとobject lifecycle

- `files`は`pending | ready`、upload idempotency、declared MIME、検出画像format/dimensions、size、ETag、R2 keyを持つ。
- `issue_file_owners`はfileとIssueを同じorganizationへ固定するtyped tableにする。
- `organization_file_usage`はpendingとreadyの両方を含め、atomic reservationで`1_073_741_824` bytes以下を保証する。1 fileはdecimal `20_000_000` bytes以下にする。
- `(organization_id, upload_id)`とobject keyをuniqueにする。同じupload IDの同一内容retryは収束し、owner・size・content type等が違うretryは409にする。
- keyは`organizations/{organizationId}/files/{ownerType}/{ownerId}/{fileId}`とし、filenameをkey、R2 metadata、logへ含めない。
- uploadはquota予約+pending作成、R2 stream PUT、HEAD/実size/ETag確認、ready確定の二段階にする。request全体を`arrayBuffer()`へしない。
- R2 objectは`application/octet-stream`で保存し、custom metadataは`fileId`、`uploadId`、`expectedSize`だけにする。
- file削除はquota解放、DB削除、exact-key cleanup job、auditを同じtransactionへ入れる。R2 deleteの失敗でHTTP transactionを巻き戻さずdurable jobで収束させる。
- Issue削除は配下fileのquota解放とowner-prefix cleanupをIssue削除transactionへ入れる。organization削除はorganization prefix cleanupを同じ`FILES` bucketで行う。
- cleanup jobは削除後も残るためresource FKを持たせない。lease、指数backoff、attempts、`lockedAt`を使い、完了/失敗updateをclaim tokenでfenceする。

Schema変更は必ず`packages/db/drizzle/`へmigrationを保存し、`generate + migrate`で確認する。通常起動へ`push`やresetを混ぜない。

## API contract

公開routeは次に固定する。

```text
GET    /files/organizations/:organizationId/owners/:ownerType/:ownerId
POST   /files/organizations/:organizationId/owners/:ownerType/:ownerId
GET    /files/organizations/:organizationId/:fileId/download
GET    /files/organizations/:organizationId/:fileId/preview/:width
DELETE /files/organizations/:organizationId/:fileId
```

- owner typeはValibot closed unionで`"issue"`だけを受ける。
- listはreadyだけを新しい順で返す。opaque cursor、既定50件、最大100件を使う。
- uploadは1 file/1 multipart requestとし、fieldsを`uploadId`、`fileSize`、`file`に固定する。初回201、同一retry 200、衝突409にする。
- DTOからR2 keyと保存URLを除外する。`owner`、filename、size、declared MIME、previewable、dimensions、uploader profile、createdAt、canDeleteを返す。
- upload progressだけはXHR、`withCredentials`、AbortSignalで実装する。list/deleteはEdenとTanStack Queryを使う。
- original downloadは常に`application/octet-stream`、attachment、`nosniff`とし、single Range、R2 conditional read、206/304/416を扱う。

## 画像preview

許可幅の正本は役割別mapではなく単一集合にする。

```ts
export const FILE_PREVIEW_WIDTHS = [360, 720, 1200, 2400] as const
```

- raw path stringを集合と完全一致させる。`0360`、丸め、任意幅は400にする。
- JPEG/PNG/WebP/GIFだけをmagic bytesと`IMAGES.info()`の両方でpreviewableにする。GIFは静止画にする。AVIFはmagic bytesで形式だけを検出し、`IMAGES.info()`へ渡さず、常にdownload-only、dimensionsは`null`にする。SVG/HTMLもv1ではdownload-onlyにする。
- R2 originalは自動最適化されない。認証・tenant確認後に`IMAGES.input()`へ渡し、WebP、quality 75、`anim: false`、aspect ratio維持、`fit: "scale-down"`で明示変換する。
- cacheは認証・DB確認より先に読まない。keyへorganization、file、source ETag、幅、`webp:q75:anim0:v1`を含める。
- browser responseは`private, no-cache`、ETag、`nosniff`、`Cross-Origin-Resource-Policy: same-site`にする。内部cloneだけ`public, max-age=2592000`、`Set-Cookie`なしにする。cache障害は変換結果を返すfail-openにする。
- Webはprivate sourceをNext optimizerへ渡さず、credential付きnative `<img>`と手動`srcset`を使う。call-siteはCSSの`sizes`だけを渡す。descriptorは`scale-down`後の実pixel幅と一致させ、原画像を超えない許可幅と必要な直上1 URL、最大2400pxで構成する。

## Local seedと開発

- seed manifestへ固定UUID、基準日時、owner/key、fixture path、size、MD5/SHA-256、format/dimensionsを集約する。Turso seedとR2 reconcileで別の正本を作らない。
- DB seedはlocal URLだけを許可し、fresh DBへ1 transactionで通常data、pending files、typed owners、pending usageを作る。既存userがあるDBは非破壊でskipする。
- `bun run dev`はseed、fixture reconcile、testを実行しない。local Tursoのmigrationを適用し、Webの`next dev --turbopack`とAPIのsource-watching Wranglerを起動する日常開発だけに閉じる。
- API devはbuild済みWorker artifactを使わず、Wrangler mainの`src/worker.ts`を`wrangler dev`でwatch/rebundleし、保存時にWorker isolateを再起動する。Bunの状態保持型HMRではないが、`--persist-to`のR2 stateはreloadを越えて維持する。Webもbuild済みOpenNext artifactではなくNext devのFast Refreshを維持する。
- local R2は`wrangler dev --local --persist-to apps/api/.wrangler/state`の実binding経由でseedする。loopback request、起動ごとのtoken、development/local DBの三条件を満たす非OpenAPI endpointだけを使う。
- fixtureが必要なときだけ`bun run dev:db:seed`を明示実行する。healthyなAPI dev sessionがあれば再利用し、なければlocal Tursoが停止中の場合だけ一時起動してmigrationを適用し、`apps/api/.wrangler/state`を使うloopback限定Wranglerを一時起動する。DB seedとR2 reconcile後は自身が起動したprocessだけを停止し、既存processと永続stateには触れない。初回fixtureはseed後に`bun run dev`、resetはdev停止 → `dev:db:reset` → 任意の`dev:db:seed` → `dev`とする。通常の`bun run dev`はmigrationまでで、fixture投入は任意。production seed command、`:local` alias、rootの`seed` aliasは作らず、remote/production targetを最初に拒否する。
- reconcileはmanifest rowが存在する場合だけ動く。pending+objectなしはPUT、pending+一致objectはready化、ready+objectなしは修復、ready+一致objectはno-opとし、未知metadata objectは上書きせず失敗させる。
- reconcile clientは失敗したfixture位置を維持し、retry可能なHTTP失敗をそのfixtureで最大3回に制限する。fixture列全体を先頭から繰り返す無限loopを作らない。
- R2成功後にDB確定が失敗した場合はobjectとpendingを残し、次回再開する。削除済みmanifest rowをseed再実行で復活させない。
- remote Turso、`wrangler --remote`、production bindingではseed/resetを最初に拒否する。最大境界fixtureはcommitせずtest内で生成する。
- local Imagesは低忠実度として扱い、通常testと資格情報付きremote Images smokeを分離する。

## 変更時の確認

関心ごとのunit/integration testに加え、少なくとも次を実行する。

```sh
bun run check
bun run --cwd apps/api cf:typegen
bun run build:cloudflare
```

seed/reconcileを変更した場合は、full dev停止中と起動中の両方で`bun run dev:db:seed`を確認する。停止中は一時processだけが終了し永続stateが残ること、起動中は既存sessionを再利用して既存processを停止しないことも確認する。UIを変更した場合は`bun run test:e2e`、Cloudflare Imagesの変換条件を変更した場合はremote smokeも実行する。失敗時はprovider payloadを出力せず、固定error codeと件数だけで調査する。
