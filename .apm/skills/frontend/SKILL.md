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
- a11yとinteractionはStorybook test runnerの責務に寄せる。E2Eに細かいcomponent状態を持ち込まない。

## 実装時の確認

- webからAPIを呼ぶときは `@enterprise-agentic-saas/api/client` または明示的なHTTP clientを使い、DB packageへショートカットしない。
- public envだけがbrowser bundleに入ることを確認する。
- UI追加時は既存のshadcn/ui・Tailwind・`packages/ui` の構成に寄せる。
- portless local dev のweb originは `https://enterprise-agentic-saas.localhost`、API originは `https://api.enterprise-agentic-saas.localhost`。Next.js `allowedDevOrigins` も `.localhost` に合わせる。
- auth必須画面はNext.js Server Componentでsessionを検証し、未ログインなら `/auth/sign-in` にredirectする。session検証やSSR prefetchはwebからDBへ触らず、cookie headerをAPIへ転送するserver-side HTTP/Eden callに限定する。
- todosなどauth必須dataはserver側でEden clientを作り、`/organizations` と `/todos` をTanStack Queryへprefetchして `HydrationBoundary` でclient componentへ渡す。browser fetchは同じEden clientに `credentials: "include"` を付ける。
- App Routerのserver pageでSSR prefetchしたdataをhydrateするときは、client component側で `QueryClientProvider` と `HydrationBoundary` を同じ境界にまとめる。`HydrationBoundary` は内部で `useQueryClient()` を呼ぶため、server page直下に単独で置かない。
- SaaS console内ではactive organizationの切り替えUIはsidebarのorg switcherに集約する。todoなど個別機能画面で別のorganization pickerを重ねるとscopeが二重化してUXとdata prefetchが崩れる。
- Console sidebarはviewport固定（desktopはsticky `h-svh`、mobileはdrawer）を前提にし、page contentだけをscrollさせる。
- Auth画面は `apps/web/app/auth/[path]/page.tsx` のpage-level compositionで背景・ブランド・previewを作り、`components/auth/*` はBetter Auth UIのview componentとして保つ。passwordlessが主導線なので、サインインの見た目調整はまず `MagicLink` fallbackにも反映する。

Cloudflare/OpenNextやenv schemaの具体例が必要なときだけ `references/frontend.md` を読む。
