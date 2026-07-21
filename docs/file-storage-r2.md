# 認証付きfile storage運用

## 構成

API Workerだけがprivate R2 bucketへアクセスします。browserはR2 URLを受け取らず、Better Auth cookie付きで`/files/*`のlist、upload、preview、download、deleteを呼びます。TursoにはURLではなくobject keyとmetadataを保存します。

v1のownerはIssueだけですが、API、DB、R2 key、client helperは汎用fileとして構成しています。1 fileは作成時から1 ownerへ固定され、未所属uploadやowner変更はできません。

## Cloudflare provisioning

物理bucket名は既存環境との互換性のため維持します。

```sh
bunx wrangler r2 bucket create enterprise-agentic-saas-attachments
```

API Workerのbindingは次の二つです。

- `FILES`: private R2 bucket `enterprise-agentic-saas-attachments`
- `IMAGES`: Cloudflare Images binding

R2 public access、`r2.dev`、presigned URL、R2/Images専用domainは設定しません。必要なhostnameはAPI Workerだけです。

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

previewはR2へ保存したraw imageからImages bindingでWebPへ変換します。OpenNextやNext `<Image>`がprivate R2 originalを自動で最適化する構成ではありません。認証付きsourceへNext optimizerを通さず、Webの`AuthenticatedFileImage`がAPI preview URLからnative `srcset`を組み立てます。

AVIFはmagic bytesで形式だけを検出し、Cloudflare Imagesの`info()`へ渡しません。v1では常に`previewable: false`、`imageWidth: null`、`imageHeight: null`としてdownloadだけを提供します。local/remote Images実装差へ依存してAVIFのmetadataを確定しません。

UTF-8 textは認証付き`/files/organizations/:organizationId/:fileId/text-preview`からJSONとして取得し、Webの全画面viewerがescaped textとして表示します。`text/*`（HTMLを除く）、JSON系、閉じたsource-text拡張子だけを対象とし、HTML/SVG拡張子、invalid UTF-8、NULを含む内容はpreviewしません。R2から読むのは先頭`1,000,000` bytesとUTF-8境界確認分だけで、超過時はviewerからoriginal downloadを案内します。text responseはbrowser/Workers Cacheへ保存しません。

Issue detailのpageとintercepted modalは同じviewport viewerを共有します。画像は既存の認証付き`srcset`、textはEdenとtenant-scoped TanStack Queryを使い、browser Fullscreen APIや公開URLは使いません。

## ローカル起動とseed

日常の開発は次だけで起動します。

```sh
bun run dev
```

このcommandはmigrationを適用し、Webを`next dev --turbopack`、APIを`src/worker.ts`がmainの`wrangler dev`でsource watchします。build済みartifactは使いません。DB seed、R2 fixture reconcile、testは日常のdev起動へ混ぜません。

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

`file_added` / `file_deleted`を初めて導入する`0011_file_activity_backfill`は、旧APIとの切替中にfilename履歴を失わないよう特別なcompatibility deployを必要とします。production workflowは`0010`まで適用済みで`0011`が未適用の場合だけ新APIを先行deployし、その後にready fileをbackfillします。通常のmigration-first順序を手動で適用してこの判定を迂回しないでください。

local seedのreconcileは次の動作です。

- pending + objectなし: fixtureをPUTしてready化
- pending + 一致objectあり: HEADとdigestを確認してready化
- ready + objectあり: no-op
- ready + objectなし: committed fixtureから修復
- custom metadata不一致: 上書きせず停止
- manifest file row削除済み: 再作成しない

各fixtureはmanifest順に処理し、retry時も失敗したfixture位置を保持します。retry可能なHTTP失敗はそのfixtureで最大3回までとし、最初のfixtureへ戻るloopや無限retryは行いません。R2 PUT後にDB確定が失敗してもobjectとpendingを残すため、原因を直して同じcommandを明示再実行します。filename、object key、provider raw errorをlog/Sentryへ出さないでください。

## 検証

通常の品質gate:

```sh
bun run check
bun run --cwd apps/api cf:typegen
bun run build:cloudflare
bun run dev:db:seed
bun run test:e2e
```

local Images emulationはproductionと同じ変換忠実度を保証しません。Cloudflare credentialを明示したremote Images smokeは通常testから分離し、production bucketやTursoへseed/resetしない専用fixtureで実行してください。

Wranglerへloginした環境では次で実行します。credential、provider response、画像本文を出力しない独立harnessの詳細は[Cloudflare Images remote smoke](../apps/api/smoke/images/README.md)を参照してください。

```sh
bun run --cwd apps/api smoke/images/run.ts
```

production smokeでは、member以外の404、active organization不一致409、upload retry、Range download、4幅のpreview、membership取消後の404、file/Issue/organization削除後のcleanup jobを確認します。
