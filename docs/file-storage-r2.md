---
title: 認証付きfile storage運用
status: accepted
implementation: active
last_reviewed: 2026-08-20
---

# 認証付きfile storage運用

## 構成

API Workerはprivate R2 bucketへのupload、download、metadata管理を所有し、private Images Workerは認証済み
previewの変換時だけ同じbucketを読みます。browserはR2 URLを受け取らず、Better Auth cookie付きで
`/files/*`のlist、upload、preview、download、deleteを呼びます。TursoにはURLではなくobject keyと
metadataを保存します。

v1のownerはIssueだけですが、API、DB、R2 key、client helperは汎用fileとして構成しています。1 fileは作成時から1 ownerへ固定され、未所属uploadやowner変更はできません。

Agent chatへ添付する短期画像は、Issueへ昇格するまではgeneric fileではなく専用のagent assetとして扱います。`fileOwnerTypes`へ`agent_thread`を追加してownerを変更する方式は採りません。physical objectとlogical fileを分離したzero-copy promotion、期限、quota、承認の設計は[Agent asset、mention、page context](./agent/assets-mentions.md#chat画像)を参照してください。

userとorganizationのidentity画像はgeneric ownerを拡張せず、専用の`profile_images` metadataと次のrouteを使います。app-ownedなAPI/DB/Webの名称は`profileImage`へ統一し、Better Auth生成列の`user.image` / `organization.logo`だけを互換境界として残します。

```text
POST   /files/profile-images/users/me
DELETE /files/profile-images/users/me
GET    /files/profile-images/users/:userId
POST   /files/profile-images/organizations/:organizationId
DELETE /files/profile-images/organizations/:organizationId
GET    /files/profile-images/organizations/:organizationId
```

browserは1:1にcropした512x512 PNGをuploadします。Workerはmagic bytesと画像情報を再検証し、Images bindingで512x512 WebP quality 85、animation無効へ再encodeしてからprivate R2へ保存します。原本と複数variantは保存しません。userは円、organizationは角丸四角で描画しますが、保存objectはどちらも同じ正方形です。

## Cloudflare provisioning

物理bucket名は既存環境との互換性のため維持します。

```sh
bunx wrangler r2 bucket create enterprise-agentic-saas-attachments
```

API Workerのbindingは次の三つです。

- `FILES`: private R2 bucket `enterprise-agentic-saas-attachments`
- `IMAGES`: Cloudflare Images binding
- `IMAGE_PREVIEWS`: private Images Worker `enterprise-agentic-saas-images`へのService Binding

Images Workerは`FILES`と`IMAGES`だけを持ちます。`workers_dev=false`、`preview_urls=false`、routeなしで
public hostnameを作りません。

R2 public access、`r2.dev`、presigned URL、R2/Images専用domainは設定しません。必要なhostnameはAPI Workerだけです。

## キャッシュ境界

`apps/api/wrangler.jsonc`と`apps/api/wrangler.bootstrap.jsonc`は最上位の
`cache.enabled=false`を明示します。Workers CachingをAPI Workerの既定入口へ適用せず、同じURLへの
反復リクエストでもElysia、Better Auth、テナント認可を毎回実行します。

`apps/images/wrangler.jsonc`だけは`cache.enabled=true`にします。画像previewはAPIが認証、組織への所属、
対象fileまたはAgent assetのsessionと有効期限を確認した後にだけ`IMAGE_PREVIEWS`を呼びます。内部URLは
opaqueなresource ID、幅、source ETag、変換versionだけで構成し、R2 object keyは内部headerで渡します。
Authorization、cookie、filename、private URLを渡しません。未認証、別テナント、所属取消後のrequestは
Service Bindingを呼ぶ前に拒否します。

内部resource IDとR2 keyは同じ保存identityへ固定します。v1 generic fileはlogical file IDと
`organizations/{organizationId}/files/.../{fileId}`を組にし、Agent assetからzero-copy昇格したv2 fileは
storage object IDと`organizations/{organizationId}/storage-objects/{storageObjectId}`を組にします。
Images Workerは組が一致しないrequestをR2 read前に拒否します。

Images Workerは固定WebP変換へWorkers Cachingを適用します。generic fileは30日、promoted Agent assetは
3日、temporary Agent assetは残り有効期限を1秒から3日の範囲へ制限したTTLを維持します。APIは内部
responseのprovider/cache headerを転送せず、browser向けの`private, no-cache`、ETag、304、security
headerを再構築します。

旧API Cache APIの項目は新しい経路から参照しません。remote cacheの削除はこの変更へ含めず、既存TTLで
失効させます。PRとCloudflare dry-runはremote stateを変更しません。

productionではWebとAPIを同じregistrable domain配下、例えば`app.example.com`と`api.example.com`へ配置します。`AUTH_COOKIE_DOMAIN=.example.com`、Web originを含む`TRUSTED_ORIGINS` / `CORS_ORIGIN`、Web側の`API_PUBLIC_URL` / `NEXT_PUBLIC_API_BASE_URL`を同じAPI originへ揃えてください。別の親domainへ分離するとcredential付きsession cookieを共有できません。

## 制限と保存形式

- organization quota: `1,073,741,824` bytes（pendingを含む）
- 1 file: `20,000,000` bytes以下
- ownerあたりのfile数: 制限なし
- preview幅: `360`, `720`, `1200`, `2400`
- 画像preview形式: JPEG、PNG、WebP、GIF
- text preview: UTF-8 text/JSONの先頭`1,000,000` bytes
- download-only: AVIF、SVG、HTML、PDF、その他の非対応形式

R2 keyは`organizations/{organizationId}/files/{ownerType}/{ownerId}/{fileId}`です。filenameをkeyやR2 custom metadataへ含めません。objectは`application/octet-stream`で保存し、downloadもattachmentとして返します。

profile image keyは`users/{userId}/profile-images/{profileImageId}.webp`または`organizations/{organizationId}/profile-images/{profileImageId}.webp`です。`profile_images`にはobject keyと状態、upload ID、source hash、ETag、削除時に戻す以前のprovider画像URLを保存します。ready確定時だけBetter Auth列をfirst-partyの安定したrelative routeとopaqueなrevision query（`?v={profileImageId}`）へ更新します。object keyを公開せず、置換時はbrowserの`src`を確実に変えます。generic `files` tableにbrowser URLを保存しない原則は変わりません。

previewはR2へ保存したraw imageからImages bindingでWebPへ変換します。OpenNextやNext `<Image>`がprivate R2 originalを自動で最適化する構成ではありません。認証付きsourceへNext optimizerを通さず、Webの`AuthenticatedFileImage`がAPI preview URLからnative `srcset`を組み立てます。

AVIFはmagic bytesで形式だけを検出し、Cloudflare Imagesの`info()`へ渡しません。v1では常に`previewable: false`、`imageWidth: null`、`imageHeight: null`としてdownloadだけを提供します。local/remote Images実装差へ依存してAVIFのmetadataを確定しません。

UTF-8 textは認証付き`/files/organizations/:organizationId/:fileId/text-preview`からJSONとして取得し、Webの全画面viewerがescaped textとして表示します。`text/*`（HTMLを除く）、JSON系、閉じたsource-text拡張子だけを対象とし、HTML/SVG拡張子、invalid UTF-8、NULを含む内容はpreviewしません。R2から読むのは先頭`1,000,000` bytesとUTF-8境界確認分だけで、超過時はviewerからoriginal downloadを案内します。text responseはブラウザーまたはCloudflareのキャッシュへ保存しません。

Issue詳細の全画面ページにviewport viewerを表示します。画像は既存の認証付き`srcset`、textはEdenとテナント単位のTanStack Queryを使い、ブラウザーのFullscreen APIや公開URLは使いません。

## ローカル起動とseed

日常の開発は次だけで起動します。

```sh
bun run dev
```

このcommandはmigrationを適用し、Webを`next dev --turbopack`、APIをprimary、Images Workerをauxiliaryと
する1つの`wrangler dev` multi-config sessionでsource watchします。両Workerは同じlocal R2 stateとService
Bindingを使います。build済みartifactは使いません。DB seed、R2 fixture reconcile、testは日常のdev起動へ
混ぜません。

fixtureが必要なときだけ、full devの起動前または起動中に次を明示実行します。

```sh
bun run dev:db:seed
```

このcommandはhealthyなlocal API dev sessionがあれば既存Workerを再利用します。sessionがなければlocal Tursoが停止中の場合だけ一時起動し、migrationを適用してから、`apps/api/.wrangler/state`を使うloopback限定Wranglerを一時起動します。DB seedとWorker経由のR2 reconcileが終わると、command自身が起動したprocessだけを停止します。既存のdev processや永続化したDB/R2 stateは停止・削除しません。remote Turso、production、`wrangler --remote`では実行できません。seed endpointは起動ごとのtokenが必要で、OpenAPIには掲載されません。production用seed commandとrootの`seed` aliasは作りません。

local TursoとR2 stateを完全に作り直す場合だけ、devを停止してresetします。

```sh
bun run dev:db:reset
# fixtureが必要なら:
bun run dev:db:seed
bun run dev
```

`dev:db:reset`は確認後にlocal Tursoと対応する`apps/api/.wrangler/state`、起動ごとのseed token/sessionを一緒に削除します。seedは任意なので、fixtureが不要ならそのまま`bun run dev`を起動します。続く`bun run dev`が行うのはmigrationまでで、fixture投入は自動実行しません。既存DBへmigrationだけを適用する場合はreset不要です。

## 障害復旧

uploadはquota予約とpending row、R2 PUT、ready確定の二段階です。通信断やWorker停止後は同じ`uploadId`でretryすると、pending rowとR2 HEADを照合して収束します。異なるownerまたは内容で同じIDを再利用すると409になります。

file追加・削除では、auditにfilenameを残さず、Issue Discussion向けの`file_added` / `file_deleted` eventだけがfilename snapshotを保持します。ready確定またはDB削除、quota、cleanup job、audit、activityは同じtransactionで確定し、upload retryでtimeline eventを重複させません。

file削除ではDBとquotaを先にtransactionで確定し、R2 exact key削除はdurable cleanup jobで再試行します。Issue削除はowner prefix、organization削除はorganization prefixをcleanupします。bucket権限やbindingを直した後はcronの冪等retryへ任せ、DB rowやusageを手動で再作成しないでください。

profile imageの置換・削除もDBのcurrent metadataとBetter Auth列を先にtransactionで確定し、古いexact keyは専用のdurable cleanup processorへ渡します。currentでなくなったrowは`superseded` tombstoneとしてupload ID、source hash、versionを残すため、同じready uploadのretryは同じmetadataへ、置換・明示削除後の旧upload retryはterminal 409へ収束します。並行uploadは後から開始した有効なuploadだけをcurrentにし、最新ready確定時に古いpendingをcleanupへ回します。1時間以上残ったpendingもcronがstatusと更新時刻を再確認してtombstone化します。

Organizationの更新と削除はroute guardに加え、finalize/delete transaction内でもmembership、期限内sessionのactive organization、`owner` roleをこの順に再検証します。Images/R2処理中のrole降格やactive organization変更があってもauth列を更新しません。UserのGETは認証済みsessionから利用でき、OrganizationのGETは対象membershipがなければ404です。

`file_added` / `file_deleted`を初めて導入する`0011_file_activity_backfill`は、旧APIとの切替中にfilename履歴を失わないよう特別なcompatibility deployを必要とします。production workflowは`0010`まで適用済みで`0011`が未適用の場合だけ新APIを先行deployし、その後にready fileをbackfillします。通常のmigration-first順序を手動で適用してこの判定を迂回しないでください。

local seedのreconcileは次の動作です。

- pending + objectなし: fixtureをPUTしてready化
- pending + 一致objectあり: HEADとdigestを確認してready化
- ready + objectあり: no-op
- ready + objectなし: committed fixtureから修復
- custom metadata不一致: 上書きせず停止
- manifest file row削除済み: 再作成しない

各fixtureはmanifest順に処理し、retry時も失敗したfixture位置を保持します。retry可能なHTTP失敗はそのfixtureで最大3回までとし、最初のfixtureへ戻るloopや無限retryは行いません。R2 PUT後にDB確定が失敗してもobjectとpendingを残すため、原因を直して同じcommandを明示再実行します。filename、object key、provider raw errorをproduction log、remote telemetry、test artifactへ出さないでください。

## 検証

通常の品質gate:

```sh
bun run check
bun run --cwd apps/api cf:typegen
bun run --cwd apps/images cf:typegen
bun run build:cloudflare
bun run dev:db:seed
bun run test:e2e
```

local Images emulationはproductionと同じ変換忠実度を保証しません。通常CIは固定変換contract、URL-keyedな
test-only cache fake、Images WorkerのCloudflare dry-runを実行します。fakeは同じ内部URLの再利用とsource
ETag変更時の再変換だけを示し、native Workers CachingのTTLやplatform hit/missは再現しません。既定の
production workflowはImages→APIのdeploy順とhealth/readiness/OpenAPIを確認しますが、認証付き
file preview smokeは実行しません。providerの実疎通が必要な場合だけ、実入口を使う別の明示承認済み
smokeとして実行し、独立remote harness、共有token、remote fixture worker、偽の`CF-Cache-Status`を
維持しません。

任意のproduction smokeでは、member以外の404、active organization不一致409、upload retry、Range download、4幅のpreview、membership取消後の404、file/Issue/organization削除後のcleanup jobに加え、user/org profile imageのWebP寸法、ETag/304、置換・削除後のfallbackとcleanupを確認します。
