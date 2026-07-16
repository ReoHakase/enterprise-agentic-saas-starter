---
name: e2e-test
description: enterprise-agentic-saas-starterのPlaywright E2E、auth flow、organization/group/permission、todoのマルチテナント導線、Cloudflare/Next/Elysia連携、Playwright MCP、E2Eデータ準備、storybookではなくE2Eで見るべき範囲を変更するときに使う。
---

# E2E Test

このskillはPlaywright E2Eを書く・直す・範囲を判断するときに使う。

## E2Eで見るもの

- sign in / magic link / OAuth callback の代表導線。
- organization/group作成。
- member invitation。
- permission denied。
- tenantをまたいだtodo/project access禁止。
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
- 標準journeyは magic link登録→最初のorg→dashboard、Issue作成→tenant切替、member権限/未所属tenant拒否の3系統。mock E2Eだけを認可の証明にせず、実APIのVitestと組み合わせる。
- 動画はPlaywrightの `use.video` を `"on"` にし、成功・失敗・再試行を問わずすべてのrunを保持する。traceとscreenshotは失敗時のみ保持する。
- `failOnFlakyTests` を有効にし、auto fixtureで予期しない `console.error` と `pageerror` をtest failureにする。意図したHTTP error分岐はbrowser consoleを汚さないAPI requestで検証する。
- SSRされたcontrolled auth inputを操作するE2Eは、`toBeEnabled()`をhydration同期点にしてから入力する。固定waitやtimeout延長でhydration競合を隠さず、server markup側もhydration完了までinputをdisabledにする。
- mock APIの時刻・ID・seedは固定し、`/__e2e/reset` でstateとfault ruleを同時に初期化する。一時障害は `__e2e/faults` で回数付きに注入し、成功系seedをtest内で書き換えて再現しない。
- Streaming loadingを決定的に検証するときは、mock APIのbounded one-shot request delayを使う。`/__e2e/request-delays` は`/__e2e/reset`で必ず消去し、最大遅延を制限する。hard navigationではconsole context endpoint、nested navigationでは対象page endpointを遅延させ、loading表示後にruleが消費済みであることまで確認する。
- Layout stabilityはTailwind classの一致だけで証明しない。ready/loading/errorで`sidebar-gap`、`sidebar-inset`、console header/scroll/content、PageShell header/bodyの`boundingBox()`をdesktop/mobileごとに比較し、横overflow、desktop sidebar幅、mobile drawer非予約、header高さ、single content paddingを確認する。LinuxとmacOSでは同じfontでも折返し境界が変わるため、PageShellのdescription slotはmobile 2行、desktop 1行の固定高にし、文字列の長さや許容値緩和でgeometry testを通さない。hard boundaryとshellを維持するnested boundaryは別testにする。
- Error boundaryはframeの矩形だけでなく、実headingへのfocus、one-shot fault消費後のreset、ready画面への復帰まで確認する。stream中は同じstate属性を持つfallbackとRSC payloadが一時的に重なる場合があるため、shell-levelとpage-levelのstable slotを明示してlocatorを曖昧にしない。
- mock APIもtenant境界のresponse契約を本番へ揃える。未所属または存在しないorganization/resourceは404、所属済みだがactive organization不一致は409、active organization内のrole不足だけを403にする。先にrole判定して未所属tenantの存在を漏らさない。
- active organization切替時はmount済みの旧tenant queryをinvalidate/refetchしない。`consoleKeys.all` をcancelしてからroute replace/refreshし、切替途中の旧tenant requestが409にならないことを3 projectで確認する。
- member role編集・削除、招待、session revoke、multi-account切替はAPI requestだけで済ませず、実画面のdialog/form/toastとmobile sidebarの閉鎖まで代表journeyで確認する。account切替後はsession cookieと遷移先の両方を確認する。
- bulk招待はカンマ/改行入力、大小文字を含む重複排除、実POST body、queued件数toast、一覧への全件反映を3 projectで確認する。さらに既存memberまたはpending invitationを1件混ぜた409で他のaddressも一切保存されないこと、入力とinline errorが保持され、one-shot fault後に同じformから再送できることを固定する。
- Playwright MCPが使える場合はlocal UI確認、locator調査、失敗スクリーンショット確認に使う。

## 実装時の確認

- `webServer` でNext.jsとmock/実APIが起動し、server/client両方のAPI URLが同じoriginを指すか。
- Turbo経由のCI runに`CI`が透過され、retry、`forbidOnly`、既存server非再利用が解決後configでも有効か。
- envはdotenvx/direnv/GitHub Secretsから入り、secretをtest artifactへ出さないか。
- videoはすべてのrun、traceとscreenshotは失敗時に保持し、HTML reportとあわせてCI artifactに残すか。
- ChromiumとWebKitをCIへinstallし、3 projectを実際に実行しているか。
- 正常journeyでconsole error/page errorが0件か。mock faultの消費後に正常responseへ戻るか。
- tenant Aのユーザーがtenant Bのtodoを見られないことを確認しているか。
- OAuth run後に一時DB、WAL、SHM、3100/3101/4101のlistenerが残っていないか。

具体的なPlaywright configやテスト例が必要なときだけ `references/e2e-test.md` を読む。
