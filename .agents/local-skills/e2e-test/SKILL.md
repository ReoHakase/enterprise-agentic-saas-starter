---
name: e2e-test
description: enterprise-agentic-saas-starterのPlaywright E2E、auth flow、organization/group/permission、issueのマルチテナント導線、Cloudflare/Next/Elysia連携、Playwright MCP、E2Eデータ準備、storybookではなくE2Eで見るべき範囲を変更するときに使う。
---

# E2E Test

このskillはPlaywright E2Eを書く・直す・範囲を判断するときに使う。

## E2Eで見るもの

- sign in / magic link / OAuth callback の代表導線。
- organization/group作成。
- member invitation。
- permission denied。
- tenantをまたいだissue/project access禁止。
- critical CRUD flow。
- billing/settingsなどSaaSで壊れると困る導線。

## E2Eで見すぎないもの

- buttonの見た目。
- form部品の細かい状態。
- pure function。
- Valibot schemaの細かいvalidation。
- component単体のa11y/interaction。これはStorybook Vitest browser testへ寄せる。

## 方針

- Playwright testは `apps/web/e2e` に置く。
- API/backendの細かい分岐はVitest + `app.handle()` で押さえ、E2Eは主要導線に絞る。
- auth/session/org/permissionはE2Eで最低1本ずつ代表失敗ケースを置く。
- test dataはtenant境界が見える名前にする。
- 外部GitHubや実credentialには接続しない。標準mock suiteとは別に、`vercel-labs/emulate`、実Elysia API、fresh file DBを起動するChromium専用OAuth suiteをPR/CIで通す。authorize、state、callback、token、userinfo、session/account保存までをこのsuiteの責務にする。
- PRの標準harnessは `apps/web/e2e/fixtures/mock-api.ts` とNext.jsをPlaywright `webServer` で同時起動する。mock stateとreset endpointは全projectで共有されるため、local/CIとも `workers: 1` で直列実行する。`fullyParallel: false` だけではproject間の並列実行を止められない。
- Agent journeyは標準mock harnessのfake eventだけで実provider接続まで成功扱いにしない。外部課金を伴う明示的な`test:e2e:agent` suiteで、実API Worker、private Agent Worker、Mastra `product-agent`、OpenRouter `qwen/qwen3.6-flash`を起動し、API `/agent/chat`経由のUI streamとAPI正本のassistant message保存を1 turnで確認する。Web検索、read tool、Yes/No承認、org切替中断、添付処理はprovider出力に依存させず、component/API/mock Playwright testで決定的に固定する。API key、prompt、response本文をPlaywright video、trace、console、reportへ出さない。
- paid Agent suiteは`playwright.agent.config.ts`へ分離し、Chromium、`workers: 1`、Playwright retryなしでjourneyの自動再実行を防ぐ。model/provider自身のbounded retryは別に数える。`e2e/fixtures/agent-stack.ts`がrun固有のtmp Turso DBへmigrationを適用し、Wrangler multi-configのAPI primary + Agent auxiliaryを同じprocessで起動する。循環named Service Bindingはproductionと同じentrypointを使い、browserへAgent Workerを公開しない。終了時はsupervisorがWrangler/Turso両childの終了を待ってからtmp DB、WAL/SHM、Wrangler state、秘密env fileを削除する。まだ稼働中のWrangler configと競合するためPlaywright global teardownから先にrun directoryを消さない。
- paid responseをartifactへ残さないため、このsuiteだけはvideo、trace、screenshot、HTML reportを無効化する。失敗時のDOM snapshotを含むPlaywright出力もrun専用一時領域へ置き、stack supervisorの終了処理で削除する。OpenRouter keyはjob scopeの`OPENROUTER_API_KEY`または追跡対象外の`apps/agent/.env.local`からsupervisorが読み、permission 0600のAgent専用`.dev.vars`へ一時配置する。Playwright configはsupervisor用envを組み立てた直後に自身のprocess envからkeyを除去し、test worker、browser、Wrangler childのprocess env、API configへkeyを渡さない。値やprovider responseをlogへ出さない。
- Playwrightの`context.request`はbrowser cookie jarを共有してもbrowserの`Origin` headerまでは自動付与しない。実APIへmutationしてpaid journeyのtenant fixtureを作る場合は、現在のWeb originを明示し、APIのCSRF保護を迂回または無効化しない。
- OAuth harnessは`playwright.oauth.config.ts`へ分離し、`apps/github-emulator`、migration適用済みの実API、専用Next distを`webServer`で所有する。標準`playwright.config.ts`では`e2e/oauth`をignoreし、同じjourneyをmockとemulatorで二重実行しない。
- Passkeyは標準3 projectでstale sessionの403、step-up dialog、cancel後のtrigger focus復帰、再認証URLを固定する。成功系はChromium OAuth suiteでCDP WebAuthnのvirtual USB authenticatorを使い、実`generate-register-options`、browser ceremony、`verify-registration`、DB-backed list、reload、deleteまで通す。`navigator.credentials.create`をstubして成功扱いにしない。
- `emulate@0.9.0`は`oauth_apps`を省略するとclient/secret/redirect URI検証をskipするため、OAuth E2Eではcallbackを含むstrict appを必ずseedする。user pickerは標準`admin`/`ghost`の順序に依存せず、fixture loginを含むrole locatorで選ぶ。
- `emulate`の`reset()`後もStore外のaccess token mapが残るため、HTTP reset endpointを追加してtest isolation境界にしない。suite run開始時はfresh process/DBにし、Playwright retryは同じfixture userで再sign-inしても結果が変わらないidempotent journeyにする。retry成功も`failOnFlakyTests`でCI失敗にする。`DEBUG`/`EMULATE_DEBUG`はtoken requestを出力し得るためOAuth harnessへ渡さない。
- Better Auth 1.6.9のlocal Generic OAuth callbackは`/auth/oauth2/callback/github`、production built-in GitHub callbackは`/auth/callback/github`で異なる。OAuth E2Eは前者をcontractとして固定し、Better Auth upgrade時に見直す。
- OAuth Playwright `webServer.env`へ`...process.env`を渡さない。PATH/HOME/CI等だけをallowlistし、Bun childは`--no-env-file`、Turso/GitHub/Better Auth/Sentryはtest fixture値または明示的な空値で上書きする。developerの実OAuth secretやSentry credentialをemulator process・trace・videoへ持ち込まない。
- Turboのstrict envではGitHub Actionsの`CI`も自動透過されない。rootの`test:e2e` / `test:e2e:oauth` taskで`CI`を`passThroughEnv`へ明示し、retry、`forbidOnly`、`failOnFlakyTests`、既存server非再利用をCIでも有効にする。外部server向け`PLAYWRIGHT_BASE_URL`も標準suiteのtaskだけ透過し、`turbo --dry=json`で解決値を確認する。
- OAuth API fixtureはpackage scriptを多段起動せずPlaywrightから直接起動し、signalを受けたfixtureの`finally`とPlaywright `globalTeardown`の両方で、run固有のtemporary DB本体・WAL・SHMを削除する。削除対象はtmp直下の固定prefixとPID形式に限定し、run後に残留fileとlistenerがないことを確認する。
- Playwright管理のNext.jsには`NEXT_DIST_DIR=.next-e2e`を渡し、通常のportless開発serverが使う`.next`とdevelopment lockを共有しない。E2Eのためにdeveloper-owned `next dev`をkillせず、両方を同時実行できる状態を維持する。`.next-e2e/`はgitignoreする。
- 標準browser matrixはDesktop Chrome（1280x720）、Pixel 7 Chrome、iPhone 13 WebKitの3 projectとする。詳細CRUDの重複実行は避けてもよいが、主要journeyはdesktop/mobile両方を通す。
- keyboard-only suiteは`locator.click()`、`fill()`、`focus()`で通したことにせず、Tab/Shift+Tab、Arrow key、Enter、Escape、keyboard text inputだけでmagic link、org作成、sidebar、Issue inline編集、tenant切替、member管理、session revoke、step-up、破壊的確認を通す。Safari/WebKitでlinkが通常Tab対象外のplatform既定にはOption+Tab相当を使い、Menu itemはTabではなくArrow keyで移動する。
- TanStack Tableのinline mutationはone-shot delayを入れ、request中の`aria-busy`、response後の表示、query再取得、row reorderを跨いで同じtrigger DOMにfocusが残ることを確認する。`disabled`を一時pendingに使ったり、busy stateでcolumn rendererを再生成したりするとfocusを失うため、E2E fixtureは実際に行順が変わる時刻を返す。
- mobile tableは列を非表示にして成功扱いにしない。documentの`scrollWidth <= innerWidth`、table containerの`scrollWidth > clientWidth`、overflow時だけ名前付きregionと`tabIndex=0`が付くことをPixel 7とiPhone 13で確認する。
- mutation後の`router.refresh()`を待つときは、mobile sidebar/drawer内のtriggerなど操作と同時にunmountされる要素を同期点にしない。常時表示されるconsole headerなどへ更新結果が反映されたことを待ってから次の`page.goto()`へ進み、RSC navigation同士を競合させない。
- 標準journeyは magic link登録→最初のorg→dashboard、Issue作成→tenant切替、member権限/未所属tenant拒否の3系統。mock E2Eだけを認可の証明にせず、実APIのVitestと組み合わせる。
- Issue詳細journeyはcanonical `/organization/:slug/issues/:number`を基準にし、Issue名のLinkではURL更新とIntercepted Dialog、行hover/focusで現れる可視ラベル付き「Full page」はDialogを一度もmountしないnative document navigation、直アクセス・reloadは全画面、Backは一覧復帰を確認する。touchではfull-page actionを常時操作可能にし、mobile modalは四辺に8px以上のinsetがあることを3 projectで固定する。
- Issue detailのresponsive回帰は文字列の出現だけでなく、mobileでheader→metadata→description→discussionのDOM/vertical順を確認する。desktopでは全幅headerの下に左description→discussion・右sticky metadataの2 columnが並ぶこと、scroll後もmetadataがviewportへ追従することをbounding boxで固定する。通常時は両viewportでheader内のtitle・番号・icon-only Edit・全画面化が同じ行に収まり、mobileのtitle編集時はformが次行全幅へ落ちてDialogに横overflowを作らないことも確認する。
- title編集はEdit後に明示SaveとCancelが現れ、差分なしのSaveがdisabled、変更後だけenabledになり、SaveでtitleだけをPATCH、Cancelでdraftを破棄することを確認する。blurだけでは保存されないことはcomponent testと分担して固定する。
- Intercepted modalのstreaming testではroute layoutが所有する`[data-slot="dialog-content"]`へmarkerを付け、loading status消滅後も同じDOM nodeであること、外寸差2px未満、ready時に再open animationがないことを確認する。loadingとreadyで別のaccessible dialog名を探すtestは二重mountを見逃すため使わない。
- title/description/new comment/comment editを別々にdirtyにし、Close/Escape/overlay、全画面pageの「Back to issues」とbrowser BackでKeep editingが入力を保持し、Discardが保留遷移を一度だけ実行することを確認する。modalから「Full page」ではdescription/new comment draftがone-shotで復元され、既存comment editは破棄確認なしに失われないこと、browser標準確認もAlertDialogも重ならず、復元後にhandoffが残らないことを確認する。
- metadataはstatus・priority・assignee・labels・due dateをfield単位で即時PATCHし、description/title requestに未変更fieldが混ざらないこと、連続field更新で別fieldが巻き戻らないことを確認する。labelsはsearch + popup内Add、due dateはCalendar + hour/minute Selectを操作し、picker内のdate/hour/minute変更中はPATCHせずPopover close時に差分を1回だけ送ること、native `datetime-local`がないことをcomponent testと分担して固定する。
- 動画はPlaywrightの `use.video` を `"on"` にし、成功・失敗・再試行を問わずすべてのrunを保持する。traceとscreenshotは失敗時のみ保持する。
- `failOnFlakyTests` を有効にし、auto fixtureで予期しない `console.error` と `pageerror` をtest failureにする。意図したHTTP error分岐はbrowser consoleを汚さないAPI requestで検証する。
- SSRされたcontrolled auth inputを操作するE2Eは、`toBeEnabled()`をhydration同期点にしてから入力する。固定waitやtimeout延長でhydration競合を隠さず、server markup側もhydration完了までinputをdisabledにする。
- mock APIの時刻・ID・seedは固定し、`/__e2e/reset` でstateとfault ruleを同時に初期化する。一時障害は `__e2e/faults` で回数付きに注入し、成功系seedをtest内で書き換えて再現しない。
- Streaming loadingを決定的に検証するときは、mock APIのbounded one-shot request delayを使う。`/__e2e/request-delays` は`/__e2e/reset`で必ず消去し、最大遅延を制限する。hard navigationではconsole context endpoint、nested navigationでは対象page endpointを遅延させ、loading表示後にruleが消費済みであることまで確認する。
- Layout stabilityはTailwind classの一致だけで証明しない。ready/loading/errorで`sidebar-gap`、`sidebar-inset`、console header/scroll/content、PageShell header/bodyの`boundingBox()`をdesktop/mobileごとに比較し、横overflow、desktop sidebar幅、mobile drawer非予約、header高さ、single content paddingを確認する。LinuxとmacOSでは同じfontでも折返し境界が変わるため、PageShellのdescription slotはmobile 2行、desktop 1行の固定高にし、文字列の長さや許容値緩和でgeometry testを通さない。hard boundaryとshellを維持するnested boundaryは別testにする。
- Error boundaryはframeの矩形だけでなく、実headingへのfocus、one-shot fault消費後のreset、ready画面への復帰まで確認する。stream中は同じstate属性を持つfallbackとRSC payloadが一時的に重なる場合があるため、shell-levelとpage-levelのstable slotを明示してlocatorを曖昧にしない。
- mock APIもtenant境界のresponse契約を本番へ揃える。未所属または存在しないorganization/resourceは404、所属済みだがactive organization不一致は409、active organization内のrole不足だけを403にする。先にrole判定して未所属tenantの存在を漏らさない。
- active organization切替時はmount済みの旧tenant queryをinvalidate/refetchしない。consoleとissue/commentを含む全tenant query familyをcancelしてからroute replace/refreshし、GET queryの`AbortSignal`もEden transportへ渡す。切替途中の旧tenant requestが409にならないことを3 projectで確認する。
- active organization切替はdashboard上のrefresh経路だけで完了扱いにしない。`/organization/:slug/members|settings`上でinactive tenantを選ぶ同一URL経路と、別slugへ切り替えて元へ戻す往復を3 projectで確認し、switcher trigger/current表示、activation request、URL、`Viewing another organization`非表示が同期することを固定する。
- member role編集・削除、招待、session revoke、multi-account切替はAPI requestだけで済ませず、実画面のdialog/form/toastとmobile sidebarの閉鎖まで代表journeyで確認する。account切替後はsession cookieと遷移先の両方を確認する。
- invitation journeyは正規`/invitations/:id`の未ログインlandingからsign-upの`redirectTo`保持、別email sessionでaccept非表示、device account switch後のcookie更新、recipientだけが詳細を取得してacceptできることを一続きにする。mockの`get-invitation`もrecipient email一致を検証し、403/terminal responseを本番Better Auth契約へ揃える。旧`/organization/invitations/:id`の307とquery保持、`/organization/invitations/members|settings`がlegacy tenant slugとしてredirectされないことはbrowserで確認する。
- member管理はslug URLから入り、name/email検索、User/Role/Joined sort、joined/created/expires/inviter表示、pending resendとexpired renewを実table操作で確認する。API integration testでは同じID/createdAt保持、quota/role/fresh/tenant/terminal競合、outbox fencingを別途証明する。
- bulk招待はカンマ/改行入力、大小文字を含む重複排除、実POST body、queued件数toast、一覧への全件反映を3 projectで確認する。さらに既存memberまたはpending invitationを1件混ぜた409で他のaddressも一切保存されないこと、入力とinline errorが保持され、one-shot fault後に同じformから再送できることを固定する。
- Playwright MCPが使える場合はlocal UI確認、locator調査、失敗スクリーンショット確認に使う。

## 実装時の確認

- `webServer` でNext.jsとmock/実APIが起動し、server/client両方のAPI URLが同じoriginを指すか。
- Turbo経由のCI runに`CI`が透過され、retry、`forbidOnly`、既存server非再利用が解決後configでも有効か。
- envはdotenvx/direnv/GitHub Secretsから入り、secretをtest artifactへ出さないか。
- videoはすべてのrun、traceとscreenshotは失敗時に保持し、HTML reportとあわせてCI artifactに残すか。
- ChromiumとWebKitをCIへinstallし、3 projectを実際に実行しているか。
- keyboard-only specにmouse操作やlocatorの強制focusが混ざらず、Safari link navigationとARIA Menuのkeyboard差を覆っているか。
- 正常journeyでconsole error/page errorが0件か。mock faultの消費後に正常responseへ戻るか。
- tenant Aのユーザーがtenant Bのissueを見られないことを確認しているか。
- OAuth run後に一時DB、WAL、SHM、3100/3101/4101のlistenerが残っていないか。

具体的なPlaywright configやテスト例が必要なときだけ `references/e2e-test.md` を読む。
