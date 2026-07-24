---
title: Webテスト戦略
status: proposed
implementation: planned
last_reviewed: 2026-07-24
applies_to:
  - apps/web/**
  - packages/ui/**
---

# Webテスト戦略

## テストピラミッド

| layer | 対象 | runner | script |
| --- | --- | --- | --- |
| W1 | model、schema、error mapping | Vitest Node | `test` |
| W2 | component/controller DOM | Vitest + Testing Library + happy-dom | `test` |
| W3 | story interaction、a11y、light/dark | Storybook Vitest addon + Chromium | `test:browser` |
| W4 | QueryClient、MSW、Agent transport integration | Vitest Browser Mode | `test:browser` |
| W5 | RSC loaderのpure adapter | Vitest Node | `test` |

## ファイル配置

基本:

```text
component.tsx
component.test.tsx
component.stories.tsx
```

`browser.test.tsx`はW4だけに使います。VRT fileは作りません。

## Storybook

- `light`: 全interactionとa11y
- `dark`: theme-sensitive storyだけ
- stateを`loading`、`empty`、`error`、`success`、`dialog-open`等の英語で表す
- play testは代表interactionだけ
- mock Agent APIはcanonical fixtureを共有

Storyは見た目のcatalogだけでなく、production viewが受け取るstate/action contractを使います。
component専用の別modelや、testだけ通る簡略hookを作りません。

## Browser Modeへ置くもの

- focus、keyboard、dialog、portal
- browser API
- real CSS visibility
- 複数componentのinteraction
- AI SDK stream + mock transport

Agent UIはnetwork/transport boundaryをmockし、`useAgentChatSession`、parser、controller、componentを
mockしません。productionとtestが同じstream parser、canonical message変換、state transitionを
通ることで、UI testが実配線から乖離することを防ぎます。

## canonical fixture

Storybook、Browser Mode、E1、stream parser testは、privacy review済みのhand-authored fixtureを
共有します。provider responseをrecordしてfixture化しません。

代表scenario:

- text only、thinking、transient status、source
- one/multi tool、tool error
- approval pending/approved/rejected/expired
- stream interruption、retry、resume、reload
- empty/loading/error/archived thread
- attachment/mentionとprivate metadata非表示

fixtureはsynthetic ID、bounded text、expected canonical partsを持ち、base64、private URL、object key、
credential、real tenant dataを含めません。

## Playwrightへ残すもの

- async RSC
- Next route、middleware、cookie
- cross-origin、CORS、CSRF
- reloadを跨ぐsession
- actual network boundary

細かなpane state、shortcut、focus、dialog、stream part表示はL4へ寄せます。PlaywrightはRSC、
cookie、Worker、Service Binding、reloadを含む配線だけを重複なく確認します。

## 実行条件

- Web model/component変更: `test`
- interactive UI、a11y、Storybook変更: `test:browser`
- route/auth/cookie/API contract変更: E1またはE2

## 受入条件

- E2Eに細かなcomponent stateを持ち込まない
- happy-domでlayout/focusを保証しない
- storyとbrowser fixtureが重複しない
- darkで全interactionを重複実行しない
