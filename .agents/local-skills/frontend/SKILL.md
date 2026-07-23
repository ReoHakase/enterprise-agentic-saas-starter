---
name: frontend
description: enterprise-agentic-saas-starterのNext.js frontend、Cloudflare/OpenNext、apps/web、packages/ui、server/client env分離、Storybook配置、webからDBへ直接触らない境界、shadcn/uiの扱いを変更するときに使う。
---

# Frontend

このskillは `apps/web` と `packages/ui` の実装・構成変更で使う。

## 前提

- このrepoはissue管理を題材にした、マルチテナントSaaS webアプリのテンプレート。
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
- API originを検証するclient interaction testはlocal fallback URLを直接期待せず、`clientEnv.NEXT_PUBLIC_API_BASE_URL`を期待値に使う。CIは公開API URLを注入するため、固定localhost期待値は環境依存で失敗する。
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
- issuesなどauth必須dataはserver側でEden clientを作り、`/organizations` と `/issues` をTanStack Queryへprefetchして `HydrationBoundary` でclient componentへ渡す。browser fetchは同じEden clientに `credentials: "include"` を付ける。
- browserのGET/mutationはTanStack Queryのquery/mutationへ集約する。フォームはTanStack Formと`apps/web`内のValibot schemaを使い、field errorをinput直下、action失敗を安全なtoast/form errorに出す。Jotaiは選択中dialogなど再取得不要な一時UI状態だけに使い、server data cacheを複製しない。
- nuqsで管理するpagination、filter、sortなどform外の状態遷移は、遷移先queryを含む実`href`を持つlinkとしてSSRする。hydration後の通常clickは`preventDefault()`してnuqsのshallow updateへ接続してよいが、hydration前もnative navigationで同じqueryへ進めるようbuttonの`onClick`だけに依存しない。modifier clickや別tab表示はlink本来の動作を奪わない。
- bulk invitation formはTextareaへカンマまたは改行区切りで入力させ、Web-local Valibotでraw token 1〜20件、各254文字以下、email形式を検証してからtrim/lowercase/case-insensitive重複排除する。Edenへは`{ emails, role }`だけを渡し、batch responseもWeb-local schemaでparseする。409/429/step-upでは入力を保持し、field errorはTextarea直下、form errorはdialog内、成功はqueueされたunique件数をtoastで示す。
- organization管理のbrowser URLはUUIDでなくslugを使う。Server Componentは`listOrganizations()`のmember-visible結果からslugを内部IDへ解決し、未所属/不存在slugは同じ404にする。API/query key/mutationは内部IDのまま保ち、sidebar、一覧、dashboard、slug更新後redirectはslug URLへ統一する。
- invitation landingは未ログイン、recipient一致、recipient不一致、terminal/unavailable、一時的load errorを明示stateとして描画する。未ログインはsign-up/sign-inへ元URLを渡し、不一致ではaccept/rejectを隠してswitch/add accountを表示する。5xx/network/schema不一致をexpired/canceledと断定せず再試行を出す。詳細取得はBetter Auth clientだけを使い、Web-local Valibotでparseする。初回session判定後の詳細取得やaccept/reject中に401・session失効となった場合も未ログインstateへ遷移し、招待URLを認証後の戻り先として保持する。
- Elysia errorはWeb-local Valibot schemaでparseし、成功した`ConsoleApiError`のpublic messageだけを信頼する。任意のJavaScript/Valibot/network errorや不正responseの`message`はUIへ出さず、操作別の固定fallbackへ変換する。
- 5xxは復旧できる案内を主文にし、検証済みrequest IDがある場合だけreferenceとして添える。`fieldErrors`は一致するfieldだけをinvalidにし、入力変更でclearする。`aria-invalid`と`aria-describedby`を同期し、field外の失敗やstep-upを無関係なinputへ付けない。
- mutation/formごとにerror表示ownerを一つ決め、global Query handlerとlocal handlerから二重toastしない。TanStack Queryのdefault retry/error policyは`QueryClient`生成時に設定し、observer mount後の`useEffect`でcache defaultを変更しない。
- toast本体はpointer-transparentにして背後のDialogやform submitを遮らず、magic-link再送など既存のaction/cancel/close buttonだけへpointer eventを戻す。toast classだけを`pointer-events-none`にしてactionまで操作不能にせず、mouse E2Eで後続操作とtoast actionの両方を確認する。
- TanStack Queryの`mutationFn`へAPI methodをそのまま渡すと、Queryの第2引数contextも呼び出される。transport境界へ余計なargumentを流さないため、`mutationFn: (input) => api.method(input)`の明示wrapperを使う。
- App Routerのserver pageでSSR prefetchしたdataをhydrateするときは、client component側で `QueryClientProvider` と `HydrationBoundary` を同じ境界にまとめる。`HydrationBoundary` は内部で `useQueryClient()` を呼ぶため、server page直下に単独で置かない。
- SaaS console内ではactive organizationの切り替えUIはsidebarのorg switcherに集約する。issueなど個別機能画面で別のorganization pickerを重ねるとscopeが二重化してUXとdata prefetchが崩れる。
- organization consoleのcanonical URLは `/organization/[organizationSlug]/dashboard` と `/organization/[organizationSlug]/issues` にする。Issue詳細はorganization内連番の `/organization/[organizationSlug]/issues/[issueNumber]` を使い、UUIDをbrowser URLへ出さない。旧 `/dashboard` と `/dashboard/todos` はactive organizationのcanonical URLへのserver redirectだけを残す。
- Issue一覧からの詳細表示はissues layoutのparallel `@modal` slotと `(.)[issueNumber]` Intercepting RouteでDialogとして開き、canonical `[issueNumber]/page.tsx` と同じdetail controller/form/timelineを共有する。Issue名はcanonical URLを持つ`Link`にしてIntercepted Dialogを開く。直アクセス・再読込は全画面page、Dialog closeは`router.back()`、可視ラベルを持つ「Full page」actionはnative document navigationでinterceptionを外す。server由来の選択IssueをJotaiへ複製しない。
- Issue詳細はtitle、description、new comment、comment editを独立したTanStack Formにする。titleはheading横のicon-only Editから編集し、明示SaveとCancelを表示する。差分がないSaveはdisabledにし、blurだけで保存しない。descriptionも明示Saveを持ち、status・priority・assignee・labels・due dateはfield単位の即時mutationにする。description保存時にmetadataのstale値をまとめて送らない。保存成功時は対象formだけresponse相当にresetする。
- status・priority・assignee・labels・due dateの即時mutationをevent handlerからfire-and-forgetするときは、controllerがtoastを出した後のrejected Promiseもcomponent境界でsettleし、`unhandledrejection`をbrowser/Sentryへ漏らさない。comment edit中にtimelineがrefreshされても、`editing && isDirty`のdraftを新しいpropでresetせず、保存完了・Cancel後にだけserver値へ同期する。
- Issue詳細のmobile DOM順はheader（title・Issue番号・Edit・全画面化）→metadata fields→description→discussionにする。desktopは全幅headerの後を2 columnにし、左へdescription→discussion、右へviewportに追従するsticky metadata fieldsを置く。通常時はtitle・Issue番号・icon-only Editを左へ詰め、titleを1行内で縮めて全画面化actionを操作可能なまま残す。title編集時は狭幅でinput・Cancel・Save・Full pageを同じ行へ押し込まず、formを次行の全幅へ落として横overflowを防ぐ。
- Issue descriptionはcommentと同じcard/header/bodyの視覚文法を使い、作成日時・更新日時・Edit actionをcard headerへ集約する。creatorのavatar・名前は表示せず、detail headerや別captionへ同じ日時を重複表示しない。
- status・priority・assignee・due dateのcontrolは`apps/web`のdomain componentを一覧table、詳細aside、一覧filterで共有し、triggerとoptionのicon・badge・avatar・tips表現を分岐させない。filter用にtext-only Selectを複製せず、共通controlのpropsへ`mode: "filter"`、all/clear option、mutation非実行のvalue callback、read-only表示を追加する。labelsはBase UI Comboboxのmultiple/chips/searchとpopup内の明示Add actionを使い、comma区切りinputを作らない。候補はorganization内Issueからcase-insensitiveに集約する。
- Issue詳細のdirty guardはtitle、description、new comment、comment editを対象にし、Dialog close、Escape、overlay、全画面pageの「Back to issues」とbrowser Backを同じAlertDialogへ通す。full-page mount時は同URLのhistory sentinelを1件だけ積み、`popstate`でdirty判定してCancelならsentinelを再装着、Discardなら実際のBackを続行する。確定遷移では`beforeunload`を一度だけ抑止してbrowser標準確認との二重表示を避け、mutation中はclose/navigationを実行しない。
- Intercepted modalからcanonical pageへの全画面化はdocument navigationでinterceptionを外す。title・description・new commentの未保存draftは`version`、`issueId`、短い有効期限を持つissue URL単位の`sessionStorage`へone-shot保存し、canonical mountでWeb-local Valibot検証後に復元して即削除する。既存comment editはcomment component内のform stateなので、handoffへ含めない限り「Full page」を破棄確認へ通し、Cancelではdraftを保持する。保存不能時にdirty dataを警告なしで捨てて遷移しない。
- Intercepting Routeの`layout.tsx`が唯一のDialog、overlay、mobile inset、scroll containerを所有し、同階層の`loading.tsx`と`page.tsx`はbodyだけを返す。loadingと実体で別DialogをmountするとPortal、focus trap、open animationが再生成されるため禁止する。共通shellは固定外寸と`scrollbar-gutter: stable`を持ち、skeletonも実体と同じheader、main/aside、timeline骨格にする。
- Issueのdue dateはISO timestampとしてAPIへ渡し、table/detailの共通controlはshadcn Calendar + Popover + hour/minute Selectでbrowser local timeを編集する。native `datetime-local`へ戻さず、表示は`LocalDate includeTime`でhydration後にlocal timezoneへ揃える。Popover内ではdate/hour/minute/clearをlocal draftだけへ反映し、閉じた時点で差分がある場合だけ1回PATCHする。未設定時の初期時刻表示と日付選択後の保存時刻を同じ値にする。
- Discussionはsemanticな`ol/li`、field別の色付きicon、actor avatar、縦の接続線、右寄せした`LocalDate includeTime`で時系列を示す。field updateでもactor avatarを省略せず、field iconは補助markerとしてavatarへ重ねる。接続線はavatar・marker・comment cardより背面へ置き、activity文はtipsを含めてinline flowで自然に折り返し、語句ごとのflex item化でmobileに過剰な改行を作らない。status・priority・labels・due dateは共通badge、assigneeはUUIDでなくavatarとmember名を表示し、edited commentはEdited badgeと編集日時を作成日時から分ける。
- Dialogと通常pageで共有するtimeline markerなどの重なり要素は、親surfaceのsemantic colorをCSS変数で受け取り、その色をavatar外周と補助markerのringへ使う。`background`固定にして`popover`上へ異なる外周を出さない。avatar上へ重ねる補助markerはlight/darkとも不透明な面色を使い、背後の画像を透過させず、Lucide iconには円内で潰れない明示sizeとstroke幅を与える。
- active organization mutation成功時に`consoleKeys.all`を即invalidateすると、route遷移前の旧tenant queryが新session contextで再fetchされ409/404になる。旧queryはcancelだけして再fetchせず、organization routeのreplaceまたはRSC refreshで新tenant queryを構築する。
- `(console)/layout`はorganization slug間のclient navigationで保持されるため、active organization切替後に`router.replace()` / `router.push()`だけを行うと、layoutへ渡した`me.organizations[].active`がstaleになる。切替成功時はconsoleだけでなくissue/commentを含む全tenant query familyをawaitしてcancelし、organization/me query cacheのactive表示を同期してからslug遷移し、全経路で`router.refresh()`して共有layoutのserver contextも更新する。GET queryはTanStack Queryの`AbortSignal`をEdenの`fetch.signal`へ渡し、旧tenant HTTP自体を中止できるようにする。
- `activeOrganizationId = null` で複数membershipがある場合、`organizations[0]` をactive扱いしない。tenant data pageは `/settings/organizations` へ誘導し、sidebarは明示選択を表示する。switcherのno-op判定は選択target自身の `active === true` のときだけにする。
- organization未所属ユーザーは `/onboarding` ではなく `/settings/organizations` に誘導する。org作成はorg一覧画面の作成formに集約し、auth必須ページのno-org guardも同じURLへredirectする。
- Console sidebarはviewport固定（desktopはsticky `h-svh`、mobileはdrawer）を前提にし、page contentだけをscrollさせる。
- Mobile sidebarの最初の操作は、hydration後の`useEffect`で確定する`isMobile`だけに依存させない。SSRと初期DOMを変えず、trigger event時の現在のviewportも確認してdrawer stateを切り替え、effect確定前のclickやkeyboard shortcutをdesktop sidebar stateへ誤配分しない。
- mobile sidebar内のmenuから開くDialog/AlertDialogは、sidebar closeでmenu subtreeがunmountされても消えないよう、open stateとDialog本体を`ConsoleShell`などdrawer外のownerへ置く。menuはsidebar closeとopen callbackの発火だけを担当する。
- Console routeはURLを変えない `app/(console)/layout.tsx` に集約し、`ConsoleShell` を各pageでwrapしない。これによりroute navigation中もsidebar・account・organization contextを維持し、nested `loading.tsx` / `error.tsx` はshell内のcontentだけを置換する。
- Agent UIも同じconsole layoutで`AgentShellProvider`と`AgentShell`を一度だけmountし、専用Agent pageごとにchat runtimeを作らない。desktopは右側resizable pane（360〜720px、既定460px）、mobileはdrawer外ownerのfull-screen Sheetにし、route navigation中もthreadとcomposerを維持する。shell open、pane幅、短命composerはJotai、thread/message/permissionはserver state、selected threadはACL確認付きnuqsへ置く。
- Agent header、未保存thread draft、inline approval、thinking/tool trace、Tiptap inline mention、context ring、40vh composer、hotkeyの表示契約は`docs/agent/chat-ui.md`を正本にする。conversationは平面、assistantは枠なし全幅、chatにmonthly costを表示しない。`@tanstack/react-hotkeys`を使い、IME、upload、modal scopeをtestする。model textからIssue linkやauthorizationを作らない。
- Agent shellのconversationは初期末尾表示と96px以内の自動追従を持ち、message、stream、画像、周辺resizeを`ResizeObserver`からanimation frame単位で処理する。96px以内でも上方向scrollを検出した時点で追従を解除し、下方向へ末尾付近へ戻したときだけ再開する。2 user turn以上では右端中央へcompactなoverlay turn minimapを等間隔で出し、conversation側に専用paddingを取らない。markerは通常16px、active・hover・focus時24pxとし、transformだけを150msでtransitionしてreduced motionでは即時切替する。user prompt、直後のassistant本文、画像・context・tool件数のlocal previewとclick/Enter移動を提供し、native scrollbar、messageの`article`、conversationの`aria-live`を維持する。専用Agent pageへminimapを出さない。
- Console layoutでsessionや`me`を待つ場合、async layout自体を最上位にせず、同期layoutの明示的な`Suspense`内で解決する。初回fallbackとlayout-level errorはready状態と同じsidebar幅、inset、`h-14` header、scroll領域、content paddingを共有し、desktopではsidebarを予約、mobileでは閉じたdrawerの幅を予約しない。
- Consoleのnested `loading.tsx` / `error.tsx` は`ConsoleShell`のcontent frame内で描画されるため、`max-w`や`p-4 sm:p-6 lg:p-8`を再指定しない。ready/loading/errorで同じPageShell header/body slotを使い、route固有のaction有無、mobileでのdescription折返し、dashboard/issues/table/formのbody形状をskeletonへ反映する。PageShell descriptionはLinux/macOSのfont折返し差でも高さが変わらないようmobile 2行、desktop 1行の固定slotへ収める。
- Loading skeletonは`role="status"`、`aria-busy="true"`、安全なlabelを持ち、視覚要素を`aria-hidden`にする。`aria-hidden`配下へbuttonやlinkを残さない。Error boundaryは実headingをfocusし、`role="alert"`と明示的なreset actionを持たせる。境界変更時はPlaywrightでdesktop/mobileのsidebar、header、content、PageShellのbounding boxと横overflowをready状態に対して確認する。
- Next RSCのpage errorは`reset()`だけではerrored payloadがclient cacheから再利用され、mobile Chromium/WebKitで復帰しない場合がある。このrepoのerror actionはまず`reset()`でmounted boundaryの復帰を試し、error componentが一定時間後もmountedならfull reloadへfallbackしてserver requestを作り直す。成功時はcleanupでreload timerを解除し、one-shot faultを使う3 browser projectのE2Eで両経路の復帰を確認する。
- Server Componentのcookie、session、console API、`me` は `react cache()` を使う `lib/server/*` helperでrequest内dedupeする。session endpointは401または200-nullだけを未認証とし、network errorと5xxをsign-in redirectへ変換せずerror boundaryへ送る。
- Auth画面は `apps/web/app/auth/[path]/page.tsx` のpage-level compositionで背景・ブランド・previewを作り、`components/auth/*` はBetter Auth UIのview componentとして保つ。passwordlessが主導線なので、サインインの見た目調整はまず `MagicLink` fallbackにも反映する。
- SSRするcontrolled auth formは、React hydration前の入力がclient stateで消えないようserver snapshotではcontrolをdisabledにする。`useSyncExternalStore`のserver/client snapshotでhydration完了を判定し、`useEffect`のmount flagや固定delayを同期点にしない。
- Authの `redirectTo` は先頭 `/` のlocal pathだけを許可し、`//`、backslash、encoded protocol-relative path、control characterをserver側で除外してからBetter Auth UIへ渡す。
- user向け日時はbrowserのlocal timezoneで表示する。SSR/hydration差を避けるため初期HTMLは明示したUTC formatterで安定化し、mount後にlocal formatterへ更新する。UTC固定のまま`Joined` / `Created` / `Expires`とだけ表示しない。
- members pageのmembers/invitationsはserverで同時取得してTanStack Queryの`initialData`へ渡す。route skeletonからready tableへ進んだ後に、clientだけ7remのloaderを挟んで再度大きくlayout shiftさせない。権限がなくqueryをdisabledにする場合は空配列を実データとして表示せず、section自体を隠すかaccess-limited stateにする。
- shadcn preset/registry commandはframeworkを検出できる `apps/web` から実行する。`packages/ui` の `components.json` 相当設定は `apps/web/components.json` が共有packageのalias/CSSへ向けるため、`packages/ui` 直下からpreset applyしない。
- `packages/ui/src/styles/globals.css` からworkspace appをscanする `@source` は `../../../../apps/**/*.{ts,tsx}`。`packages/apps` を指す `../../../apps` にしない。
- 現在pinしているStreamdown 2.5.0で`linkSafety`を有効にする場合、既定modalはMarkdownのlink component位置へinline描画され、段落内linkでは`p > div` / `p > p`の不正DOMを作る。`renderModal`をPortal所有のDialogへ差し替え、安全確認を無効化せず、linkを開いたcomponent testでdialogがMarkdown paragraphの子孫でないことを固定する。dependency更新時はupstream修正を確認してoverrideの削除可否を再判定する。
- TanStack Tableを使うissue/member等のpage-level compositionは `apps/web` に置き、`packages/ui` はTable、Dialog、Select等のprimitiveに留める。assignee selectorはmember APIの表示名/emailを候補にし、member/user idの手入力UIを作らない。
- account session一覧もTanStack Tableを使い、`updatedAt`と`expiresAt`を別列にする。接続元はraw User-Agent、端末名・OS・platform、browser/version・rendering engineを表示するが、IP addressは表示しない。User-Agent解析はWebの直接依存`bowser`へ集約し、raw値しか保存していないため推定結果を認可や監査の正本には使わない。
- mobileのdata tableは列を隠して情報・編集機能を欠落させず、page/console scroll regionを`overflow-x-hidden`と`min-w-0`でviewport内へ固定し、Table primitiveの単一containerだけを`overflow-x-auto overscroll-x-contain`にする。1pxでも実際にoverflowするときだけ名前付き`role="region"`と`tabIndex=0`を付け、外側の`overflow-hidden`でclipされないinset focus ringを表示する。desktopで不要なTab stopや外側のhorizontal scrollerを増やさない。
- TanStack Tableはindexでなくdomain idを`getRowId`へ渡す。inline mutation中のbusy stateをcolumn `useMemo`依存へ入れるとcell rendererのfunction identityが変わり、`readOnly`なSelectでも再mountしてfocusを失う。columnは安定化し、busy/pendingだけをContextなどDOM identityを維持するstate channelで渡す。一時pendingは`disabled`ではなく`readOnly` + `aria-busy`を使い、永久に操作不能な権限不足だけを`disabled`にする。
- Reactを使うWeb/UI/Email packageではreact-perfの`jsx-no-jsx-as-prop`、`jsx-no-new-array-as-prop`、`jsx-no-new-function-as-prop`、`jsx-no-new-object-as-prop`をすべて`error`にする。disableやrender内local const、根拠のない`useMemo`で隠さず、static element、直接anchor、children/compound component、state ownerの分割で解消する。
- Base UIの`render`へmodule-static elementを渡す場合、element自身のpropsがcall-site propsより後勝ちになる。動的`href`へplaceholder URL付き`<Link>`を使うと全遷移先を上書きするため禁止する。直接`LinkButton`を使うか、`href`を持たないmodule-static bridge elementで受け、実DOMの`href`と未知prop非流出をinteraction testで固定する。
- 大きいpageのheader actionを安定化するときは、render内でComponentTypeを作らない。actionが独立stateを持てる場合はmodule-level componentへ切り出し、organization作成formの入力で一覧table全体を再renderさせない。単なるJSX移動をperformance改善とみなさず、state所有範囲が縮む境界を選ぶ。
- Next.jsが生成する `next-env.d.ts` はgit管理せず `.gitignore` 対象にする。`tsconfig.json` の `include` には残し、`apps/web` の `typecheck` は `next typegen && tsc --noEmit` の順で生成物を用意してからTypeScriptを走らせる。
- OpenNext設定は `apps/web/open-next.config.ts`、Worker/bindingは `apps/web/wrangler.jsonc` を正本にする。incremental cacheはR2 + regional cacheを使い、`build:cloudflare` dry-runをCI gateに含める。
- Next 16の`proxy.ts`はNode runtimeとしてbuildされ、OpenNext Cloudflare 1.20では拒否される。静的に表現できる旧URL互換redirectは`next.config.mjs`の`redirects`へ置き、`middleware.ts`へ戻さない。request処理が必要なproxyを追加するときはOpenNextの対応状況を再確認し、`build:cloudflare`で実adapterを検証する。
- Bunの`patchedDependencies`にはOpenNext 1.20.2の文字列形式`exports`をcopy対象と誤認する問題、Base UI 1.6.0のmiddleware option重複warning、Next 16.2.11がTypeScript 7を旧JS compilerとしてloadする問題への最小patchがある。Next patchはTypeScript 7をnative compilerとしてroute typegenだけ実行し、直後の`tsc --noEmit`を正本のtypecheckにする。依存更新時はupstream修正を確認し、patchを惰性で持ち越さず、削除可否を`bun run check`と`build:cloudflare`で判定する。
- `apps/web/cloudflare-env.d.ts`と`.open-next`はWorker artifactであり、bindingを直接参照しないNext applicationの`tsconfig.json`対象へ混ぜない。Worker typegenとapplication typecheckを別境界で検証する。
- Next/Turbopackのdevelopment-only RSC計測には、redirect/error boundaryで`performance.measure`が負のtimestampを投げる[既知問題](https://github.com/vercel/next.js/issues/86060)がある。Playwright fixtureはRSC固有のゼロ幅prefix付き計測名かつこの例外だけを発生元で抑止し、一般のbrowser errorはallowlistしない。productionのTurbopack/OpenNext互換は`build:cloudflare`で別に必ず検証する。
- 認証付きfile UIはprivate R2の`FILES` bindingを使う`/files/*` APIだけを呼ぶ。WebへR2 URLやobject keyを渡さず、list/deleteはEden + TanStack Query、progress付きuploadは`@enterprise-agentic-saas/api/client`のXHR helperを使う。private previewはNext optimizerを通さず、`AuthenticatedFileImage`のnative `srcset`で取得する。詳細contractは`file-storage-r2` skillを参照する。
- user / organizationのidentity画像はapp-ownedなAPI schema、Web-local schema、propsで`profileImage`に統一する。Better Auth session/multi-sessionをparseする境界だけ既存の`image`を維持し、app componentへ渡すときに変換する。userは円、organizationは角丸四角で表示し、`UserProfileImage` / `OrganizationProfileImage`を共通表示入口にする。
- crop primitiveは`packages/ui`の`ImageCropper` / `ImageCropDialog` / `createCroppedImage`へ置き、API origin、Cloudflare binding、TanStack Queryを依存させない。`apps/web`はfile type/size検証、XHR progress、AbortSignal、toast、query invalidationを担当する。cropperをDialogへ置く場合はscale animationで計測を崩さないfade-only motionを使う。
- Elysia Cloudflare adapterはexperimentalなので、Bun runtimeのunit testだけでproduction互換と判断しない。

## SentryとSpotlight

- Next App Routerは`instrumentation-client.ts`、`instrumentation.ts`、server/edge config、`global-error.tsx`を揃え、`onRequestError`とrouter transitionをSentryへ接続する。
- `next.config.mjs`は既存OpenNext configを`withSentryConfig`でwrapする。source map uploadは`SENTRY_AUTH_TOKEN`、`SENTRY_ORG`、`SENTRY_PROJECT`が全てあるCIだけで有効にし、auth tokenをruntime/public envへ入れない。
- browser/server/edgeは共通scrubber方針を使い、`sendDefaultPii: false`、user/cookie/header/body/email/tenant ID非送信を維持する。Session Replayはprivacy reviewなしに有効化しない。
- developmentはproduction DSNへ送らず、Spotlight flagがある場合だけlocalhost sidecarへerror/log/traceを100%送る。`NEXT_PUBLIC_SENTRY_SPOTLIGHT`はbrowser、`SENTRY_SPOTLIGHT`はserver用。
- clientの`tracePropagationTargets`は検証済みAPI originだけ、serverは`API_PUBLIC_URL`だけに限定する。変更後はNext buildだけでなくOpenNext `build:cloudflare`を通す。

Cloudflare/OpenNextやenv schemaの具体例が必要なときだけ `references/frontend.md` を読む。
