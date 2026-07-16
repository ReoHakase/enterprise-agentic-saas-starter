---
name: frontend
description: enterprise-agentic-saas-starterのNext.js frontend、Cloudflare/OpenNext、apps/web、packages/ui、server/client env分離、Storybook配置、webからDBへ直接触らない境界、shadcn/uiの扱いを変更するときに使う。
---

# Frontend

このskillは `apps/web` と `packages/ui` の実装・構成変更で使う。

## 前提

- このrepoはtodoアプリを題材にした、マルチテナントSaaS webアプリのテンプレート。
- webはNext.js。開発とworkspace管理にはBunを使える。
- Cloudflareに載せる場合、本番runtimeはBunではなくCloudflare Workers/workerd。
- Next.js on CloudflareはOpenNext Cloudflare adapterを前提にする。

## 境界

- `apps/web` から `packages/db` を直接使わない。DB accessは `apps/api` 経由にする。
- `packages/ui` はReact DOM componentの共有場所。Next.js page/layout/route依存は置かない。
- page-level componentやNext.js依存の強いcompositionは `apps/web` に置く。
- Expoを追加するまで `native-ui` は作らない。

## env

- server envとclient envを分ける。
- clientへ出す値は `NEXT_PUBLIC_*` のみにする。
- client componentがserver-only envをimportしそうなら、`env.server.ts` と `env.client.ts` に分ける。
- `process.env` を各所で直接読むのではなく、`apps/web/src/env.ts` 経由にする。
- secretはdotenvx/direnv経由で注入する。ソースや公開envには入れない。

## Storybook

- `packages/ui` の再利用componentは `packages/ui` 側にstoriesを置く。
- Next.js依存の強いcomponentは `apps/web` 側にstoriesを置く。
- Storybook 10は `@storybook/addon-vitest` + `@vitest/browser-playwright` を標準経路にする。旧standalone test-runnerを新規追加しない。
- a11yとinteractionはStorybook browser testの責務に寄せ、a11y violationをtest errorにする。light/darkを別projectで実行し、E2Eに細かいcomponent状態を持ち込まない。

## 実装時の確認

- first-party Elysia APIを呼ぶときは`@enterprise-agentic-saas/api/client`のEden clientだけを使い、raw `fetch` wrapperやAPI packageのschema/type deep import、DB packageへのショートカットを作らない。Better Auth固有endpointは`@enterprise-agentic-saas/auth/client`を使う。
- first-party Elysia routeはbrowser/serverとも`@enterprise-agentic-saas/api/client`のEden clientだけを使い、feature内でraw `fetch`を再実装しない。Edenの`data` / `error.value` / `status`をcastせず扱い、UI固有のValibot parserはtransport型の代用品ではなくruntime表示境界として残す。公開data hookはTanStack Query経由を維持する。Better Auth固有endpointは`@enterprise-agentic-saas/auth/client`を使う。
- public envだけがbrowser bundleに入ることを確認する。
- UI追加時は既存のshadcn/ui・Tailwind・`packages/ui` の構成に寄せる。
- portless local dev のweb originは `https://enterprise-agentic-saas.localhost`、API originは `https://api.enterprise-agentic-saas.localhost`。Next.js `allowedDevOrigins` も `.localhost` に合わせる。
- auth必須画面はNext.js Server Componentでsessionを検証し、未ログインなら `/auth/sign-in` にredirectする。session検証やSSR prefetchはwebからDBへ触らず、cookie headerをAPIへ転送するserver-side HTTP/Eden callに限定する。
- todosなどauth必須dataはserver側でEden clientを作り、`/organizations` と `/todos` をTanStack Queryへprefetchして `HydrationBoundary` でclient componentへ渡す。browser fetchは同じEden clientに `credentials: "include"` を付ける。
- browserのGET/mutationはTanStack Queryのquery/mutationへ集約する。フォームはTanStack Formと`apps/web`内のValibot schemaを使い、field errorをinput直下、action失敗を安全なtoast/form errorに出す。Jotaiは選択中dialogなど再取得不要な一時UI状態だけに使い、server data cacheを複製しない。
- bulk invitation formはTextareaへカンマまたは改行区切りで入力させ、Web-local Valibotでraw token 1〜20件、各254文字以下、email形式を検証してからtrim/lowercase/case-insensitive重複排除する。Edenへは`{ emails, role }`だけを渡し、batch responseもWeb-local schemaでparseする。409/429/step-upでは入力を保持し、field errorはTextarea直下、form errorはdialog内、成功はqueueされたunique件数をtoastで示す。
- Elysia errorはWeb-local Valibot schemaでparseし、成功した`ConsoleApiError`のpublic messageだけを信頼する。任意のJavaScript/Valibot/network errorや不正responseの`message`はUIへ出さず、操作別の固定fallbackへ変換する。
- 5xxは復旧できる案内を主文にし、検証済みrequest IDがある場合だけreferenceとして添える。`fieldErrors`は一致するfieldだけをinvalidにし、入力変更でclearする。`aria-invalid`と`aria-describedby`を同期し、field外の失敗やstep-upを無関係なinputへ付けない。
- mutation/formごとにerror表示ownerを一つ決め、global Query handlerとlocal handlerから二重toastしない。TanStack Queryのdefault retry/error policyは`QueryClient`生成時に設定し、observer mount後の`useEffect`でcache defaultを変更しない。
- toast本体はpointer-transparentにして背後のDialogやform submitを遮らず、magic-link再送など既存のaction/cancel/close buttonだけへpointer eventを戻す。toast classだけを`pointer-events-none`にしてactionまで操作不能にせず、mouse E2Eで後続操作とtoast actionの両方を確認する。
- TanStack Queryの`mutationFn`へAPI methodをそのまま渡すと、Queryの第2引数contextも呼び出される。transport境界へ余計なargumentを流さないため、`mutationFn: (input) => api.method(input)`の明示wrapperを使う。
- App Routerのserver pageでSSR prefetchしたdataをhydrateするときは、client component側で `QueryClientProvider` と `HydrationBoundary` を同じ境界にまとめる。`HydrationBoundary` は内部で `useQueryClient()` を呼ぶため、server page直下に単独で置かない。
- SaaS console内ではactive organizationの切り替えUIはsidebarのorg switcherに集約する。todoなど個別機能画面で別のorganization pickerを重ねるとscopeが二重化してUXとdata prefetchが崩れる。
- active organization mutation成功時に`consoleKeys.all`を即invalidateすると、route遷移前の旧tenant queryが新session contextで再fetchされ409/404になる。旧queryはcancelだけして再fetchせず、organization routeのreplaceまたはRSC refreshで新tenant queryを構築する。
- `activeOrganizationId = null` で複数membershipがある場合、`organizations[0]` をactive扱いしない。tenant data pageは `/settings/organizations` へ誘導し、sidebarは明示選択を表示する。switcherのno-op判定は選択target自身の `active === true` のときだけにする。
- organization未所属ユーザーは `/onboarding` ではなく `/settings/organizations` に誘導する。org作成はorg一覧画面の作成formに集約し、auth必須ページのno-org guardも同じURLへredirectする。
- Console sidebarはviewport固定（desktopはsticky `h-svh`、mobileはdrawer）を前提にし、page contentだけをscrollさせる。
- Mobile sidebarの最初の操作は、hydration後の`useEffect`で確定する`isMobile`だけに依存させない。SSRと初期DOMを変えず、trigger event時の現在のviewportも確認してdrawer stateを切り替え、effect確定前のclickやkeyboard shortcutをdesktop sidebar stateへ誤配分しない。
- mobile sidebar内のmenuから開くDialog/AlertDialogは、sidebar closeでmenu subtreeがunmountされても消えないよう、open stateとDialog本体を`ConsoleShell`などdrawer外のownerへ置く。menuはsidebar closeとopen callbackの発火だけを担当する。
- Console routeはURLを変えない `app/(console)/layout.tsx` に集約し、`ConsoleShell` を各pageでwrapしない。これによりroute navigation中もsidebar・account・organization contextを維持し、nested `loading.tsx` / `error.tsx` はshell内のcontentだけを置換する。
- Console layoutでsessionや`me`を待つ場合、async layout自体を最上位にせず、同期layoutの明示的な`Suspense`内で解決する。初回fallbackとlayout-level errorはready状態と同じsidebar幅、inset、`h-14` header、scroll領域、content paddingを共有し、desktopではsidebarを予約、mobileでは閉じたdrawerの幅を予約しない。
- Consoleのnested `loading.tsx` / `error.tsx` は`ConsoleShell`のcontent frame内で描画されるため、`max-w`や`p-4 sm:p-6 lg:p-8`を再指定しない。ready/loading/errorで同じPageShell header/body slotを使い、route固有のaction有無、mobileでのdescription折返し、dashboard/issues/table/formのbody形状をskeletonへ反映する。PageShell descriptionはLinux/macOSのfont折返し差でも高さが変わらないようmobile 2行、desktop 1行の固定slotへ収める。
- Loading skeletonは`role="status"`、`aria-busy="true"`、安全なlabelを持ち、視覚要素を`aria-hidden`にする。`aria-hidden`配下へbuttonやlinkを残さない。Error boundaryは実headingをfocusし、`role="alert"`と明示的なreset actionを持たせる。境界変更時はPlaywrightでdesktop/mobileのsidebar、header、content、PageShellのbounding boxと横overflowをready状態に対して確認する。
- Next RSCのpage errorは`reset()`だけではerrored payloadがclient cacheから再利用され、mobile Chromium/WebKitで復帰しない場合がある。このrepoのerror actionはまず`reset()`でmounted boundaryの復帰を試し、error componentが一定時間後もmountedならfull reloadへfallbackしてserver requestを作り直す。成功時はcleanupでreload timerを解除し、one-shot faultを使う3 browser projectのE2Eで両経路の復帰を確認する。
- Server Componentのcookie、session、console API、`me` は `react cache()` を使う `lib/server/*` helperでrequest内dedupeする。session endpointは401または200-nullだけを未認証とし、network errorと5xxをsign-in redirectへ変換せずerror boundaryへ送る。
- Auth画面は `apps/web/app/auth/[path]/page.tsx` のpage-level compositionで背景・ブランド・previewを作り、`components/auth/*` はBetter Auth UIのview componentとして保つ。passwordlessが主導線なので、サインインの見た目調整はまず `MagicLink` fallbackにも反映する。
- SSRするcontrolled auth formは、React hydration前の入力がclient stateで消えないようserver snapshotではcontrolをdisabledにする。`useSyncExternalStore`のserver/client snapshotでhydration完了を判定し、`useEffect`のmount flagや固定delayを同期点にしない。
- Authの `redirectTo` は先頭 `/` のlocal pathだけを許可し、`//`、backslash、encoded protocol-relative path、control characterをserver側で除外してからBetter Auth UIへ渡す。
- shadcn preset/registry commandはframeworkを検出できる `apps/web` から実行する。`packages/ui` の `components.json` 相当設定は `apps/web/components.json` が共有packageのalias/CSSへ向けるため、`packages/ui` 直下からpreset applyしない。
- `packages/ui/src/styles/globals.css` からworkspace appをscanする `@source` は `../../../../apps/**/*.{ts,tsx}`。`packages/apps` を指す `../../../apps` にしない。
- TanStack Tableを使うissue/member等のpage-level compositionは `apps/web` に置き、`packages/ui` はTable、Dialog、Select等のprimitiveに留める。assignee selectorはmember APIの表示名/emailを候補にし、member/user idの手入力UIを作らない。
- mobileのdata tableは列を隠して情報・編集機能を欠落させず、page/console scroll regionを`overflow-x-hidden`と`min-w-0`でviewport内へ固定し、Table primitiveの単一containerだけを`overflow-x-auto overscroll-x-contain`にする。1pxでも実際にoverflowするときだけ名前付き`role="region"`と`tabIndex=0`を付け、外側の`overflow-hidden`でclipされないinset focus ringを表示する。desktopで不要なTab stopや外側のhorizontal scrollerを増やさない。
- TanStack Tableはindexでなくdomain idを`getRowId`へ渡す。inline mutation中のbusy stateをcolumn `useMemo`依存へ入れるとcell rendererのfunction identityが変わり、`readOnly`なSelectでも再mountしてfocusを失う。columnは安定化し、busy/pendingだけをContextなどDOM identityを維持するstate channelで渡す。一時pendingは`disabled`ではなく`readOnly` + `aria-busy`を使い、永久に操作不能な権限不足だけを`disabled`にする。
- Reactを使うWeb/UI/Email packageではreact-perfの`jsx-no-jsx-as-prop`、`jsx-no-new-array-as-prop`、`jsx-no-new-function-as-prop`、`jsx-no-new-object-as-prop`をすべて`error`にする。disableやrender内local const、根拠のない`useMemo`で隠さず、static element、直接anchor、children/compound component、state ownerの分割で解消する。
- Base UIの`render`へmodule-static elementを渡す場合、element自身のpropsがcall-site propsより後勝ちになる。動的`href`へplaceholder URL付き`<Link>`を使うと全遷移先を上書きするため禁止する。直接`LinkButton`を使うか、`href`を持たないmodule-static bridge elementで受け、実DOMの`href`と未知prop非流出をinteraction testで固定する。
- 大きいpageのheader actionを安定化するときは、render内でComponentTypeを作らない。actionが独立stateを持てる場合はmodule-level componentへ切り出し、organization作成formの入力で一覧table全体を再renderさせない。単なるJSX移動をperformance改善とみなさず、state所有範囲が縮む境界を選ぶ。
- Next.jsが生成する `next-env.d.ts` はgit管理せず `.gitignore` 対象にする。`tsconfig.json` の `include` には残し、`apps/web` の `typecheck` は `next typegen && tsc --noEmit` の順で生成物を用意してからTypeScriptを走らせる。
- OpenNext設定は `apps/web/open-next.config.ts`、Worker/bindingは `apps/web/wrangler.jsonc` を正本にする。incremental cacheはR2 + regional cacheを使い、`build:cloudflare` dry-runをCI gateに含める。
- API Workerの`ATTACHMENTS` R2 bindingにはまだupload/download endpointがないが、organization削除後のtenant prefix cleanupでは使用する。添付UIを提供済みとdocumentせず、削除機能を有効にする環境ではbindingを外さない。
- Elysia Cloudflare adapterはexperimentalなので、Bun runtimeのunit testだけでproduction互換と判断しない。

## SentryとSpotlight

- Next App Routerは`instrumentation-client.ts`、`instrumentation.ts`、server/edge config、`global-error.tsx`を揃え、`onRequestError`とrouter transitionをSentryへ接続する。
- `next.config.mjs`は既存OpenNext configを`withSentryConfig`でwrapする。source map uploadは`SENTRY_AUTH_TOKEN`、`SENTRY_ORG`、`SENTRY_PROJECT`が全てあるCIだけで有効にし、auth tokenをruntime/public envへ入れない。
- browser/server/edgeは共通scrubber方針を使い、`sendDefaultPii: false`、user/cookie/header/body/email/tenant ID非送信を維持する。Session Replayはprivacy reviewなしに有効化しない。
- developmentはproduction DSNへ送らず、Spotlight flagがある場合だけlocalhost sidecarへerror/log/traceを100%送る。`NEXT_PUBLIC_SENTRY_SPOTLIGHT`はbrowser、`SENTRY_SPOTLIGHT`はserver用。
- clientの`tracePropagationTargets`は検証済みAPI originだけ、serverは`API_PUBLIC_URL`だけに限定する。変更後はNext buildだけでなくOpenNext `build:cloudflare`を通す。

Cloudflare/OpenNextやenv schemaの具体例が必要なときだけ `references/frontend.md` を読む。
