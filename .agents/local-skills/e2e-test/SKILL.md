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
- flakyな外部OAuthやmail providerはPRではmock/smoke、mainでは実環境寄りに分ける。
- PRの標準harnessは `apps/web/e2e/fixtures/mock-api.ts` とNext.jsをPlaywright `webServer` で同時起動する。mock stateとreset endpointは全projectで共有されるため、local/CIとも `workers: 1` で直列実行する。`fullyParallel: false` だけではproject間の並列実行を止められない。
- 標準browser matrixはDesktop Chrome（1280x720）、Pixel 7 Chrome、iPhone 13 WebKitの3 projectとする。詳細CRUDの重複実行は避けてもよいが、主要journeyはdesktop/mobile両方を通す。
- 標準journeyは magic link登録→最初のorg→dashboard、Issue作成→tenant切替、member権限/未所属tenant拒否の3系統。mock E2Eだけを認可の証明にせず、実APIのVitestと組み合わせる。
- 動画はPlaywrightの `use.video` を `"on"` にし、成功・失敗・再試行を問わずすべてのrunを保持する。traceとscreenshotは失敗時のみ保持する。
- `failOnFlakyTests` を有効にし、auto fixtureで予期しない `console.error` と `pageerror` をtest failureにする。意図したHTTP error分岐はbrowser consoleを汚さないAPI requestで検証する。
- mock APIの時刻・ID・seedは固定し、`/__e2e/reset` でstateとfault ruleを同時に初期化する。一時障害は `__e2e/faults` で回数付きに注入し、成功系seedをtest内で書き換えて再現しない。
- Streaming loadingを決定的に検証するときは、mock APIのbounded one-shot request delayを使う。`/__e2e/request-delays` は`/__e2e/reset`で必ず消去し、最大遅延を制限する。hard navigationではconsole context endpoint、nested navigationでは対象page endpointを遅延させ、loading表示後にruleが消費済みであることまで確認する。
- Layout stabilityはTailwind classの一致だけで証明しない。ready/loading/errorで`sidebar-gap`、`sidebar-inset`、console header/scroll/content、PageShell header/bodyの`boundingBox()`をdesktop/mobileごとに比較し、横overflow、desktop sidebar幅、mobile drawer非予約、header高さ、single content paddingを確認する。hard boundaryとshellを維持するnested boundaryは別testにする。
- Error boundaryはframeの矩形だけでなく、実headingへのfocus、one-shot fault消費後のreset、ready画面への復帰まで確認する。stream中は同じstate属性を持つfallbackとRSC payloadが一時的に重なる場合があるため、shell-levelとpage-levelのstable slotを明示してlocatorを曖昧にしない。
- mock APIもtenant境界のresponse契約を本番へ揃える。未所属または存在しないorganization/resourceは404、所属済みだがactive organization不一致は409、active organization内のrole不足だけを403にする。先にrole判定して未所属tenantの存在を漏らさない。
- active organization切替時はmount済みの旧tenant queryをinvalidate/refetchしない。`consoleKeys.all` をcancelしてからroute replace/refreshし、切替途中の旧tenant requestが409にならないことを3 projectで確認する。
- member role編集・削除、招待、session revoke、multi-account切替はAPI requestだけで済ませず、実画面のdialog/form/toastとmobile sidebarの閉鎖まで代表journeyで確認する。account切替後はsession cookieと遷移先の両方を確認する。
- Playwright MCPが使える場合はlocal UI確認、locator調査、失敗スクリーンショット確認に使う。

## 実装時の確認

- `webServer` でNext.jsとmock/実APIが起動し、server/client両方のAPI URLが同じoriginを指すか。
- envはdotenvx/direnv/GitHub Secretsから入り、secretをtest artifactへ出さないか。
- videoはすべてのrun、traceとscreenshotは失敗時に保持し、HTML reportとあわせてCI artifactに残すか。
- ChromiumとWebKitをCIへinstallし、3 projectを実際に実行しているか。
- 正常journeyでconsole error/page errorが0件か。mock faultの消費後に正常responseへ戻るか。
- tenant Aのユーザーがtenant Bのtodoを見られないことを確認しているか。

具体的なPlaywright configやテスト例が必要なときだけ `references/e2e-test.md` を読む。
