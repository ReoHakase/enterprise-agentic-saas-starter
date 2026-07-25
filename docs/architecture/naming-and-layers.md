---
title: 命名とlayer
status: accepted
implementation: active
last_reviewed: 2026-07-25
---

# 命名とlayer

## 目次

- [目的](#目的)
- [共通原則](#共通原則)
- [dependency inversion](#dependency-inversion)
- [featureとmodule](#featureとmodule)
- [domain](#domain)
- [applicationとservice](#applicationとservice)
- [port](#port)
- [adapter](#adapter)
- [repository](#repository)
- [transport](#transport)
- [platform](#platform)
- [controllerとview](#controllerとview)
- [composition-root](#composition-root)
- [mockとfakeとfixture](#mockとfakeとfixture)
- [componentとtest-file](#componentとtest-file)
- [indexts](#indexts)
- [directoryへ分ける基準](#directoryへ分ける基準)
- [不採用案](#不採用案)
- [受入条件](#受入条件)

## 目的

architecture用語を英語へ統一し、同じ名前がworkspaceごとに異なる責務を持たないようにします。名称は見栄えではなく、dependency directionを予測できることを目的にします。

## 共通原則

```text
outer layer
  transport / framework / provider / DB / browser
        ↓
application
        ↓
domain
```

内側は外側のframeworkをimportしません。外側は内側を利用できます。

小さなfeatureへ空のlayer directoryを大量に作りません。ただし全面移行後の規則が曖昧にならないよう、責務が二つ以上あるfeatureは最終形へ分けます。

layerは論理的な依存方向であり、特定のdirectory名そのものではありません。小さいmoduleはflatな
`domain.ts`、`service.ts`、`repository.ts`で同じ方向を表せます。逆にdirectory名が
`domain/`でもframeworkやDBをimportすればdomain layerではありません。

## dependency inversion

applicationが必要とする能力の型であるportは、内側のapplication ownerが定義します。外側の
adapterがそのportを実装し、composition rootだけが具体実装を接続します。

```text
transport -> application -> domain
                  |
                  v
             outbound port <- adapter <- DB/provider/browser
```

この向きにする理由は、applicationがDrizzle、provider SDK、Next routerの選択へ依存せず、
同じuse caseをfake portでdeterministicに検証できるようにするためです。adapter側にinterfaceを
置いてapplicationへ逆輸入する方式は、外側が内側の契約を所有するため採用しません。

## featureとmodule

- Webではproduct capabilityを`feature`と呼ぶ
- APIではHTTPとuse caseを所有する単位を`module`と呼ぶ
- Agentではagent、tool、runtimeの責務単位をそのまま名前にする

`shared`や`common`を無制限に作りません。所有者が明確でないcodeは、最も近いfeature/moduleへ置きます。複数ownerから利用され、domain知識を持たない場合だけsharedへ昇格します。

## domain

`domain`はbusiness invariant、value normalization、state transition、permission ruleを持ちます。

許可:

- pure function
- discriminated union
- value object
- state reducer
- domain error

禁止:

- React、Next.js
- Elysia
- Drizzle、libSQL
- `fetch`
- environment variable
- toast、router
- model provider SDK

理由は、最重要の規則をfast unit testで検証し、framework変更から隔離するためです。

HTTP request/response schemaは`domain`ではなく`transport` contractです。`model.ts`へ両方を混ぜず、`domain.ts`と`schema.ts`へ分けます。

## applicationとservice

`application`は一つのuse caseを実行します。

```text
authorize
  -> portを通じてread
  -> domain rule
  -> transaction/write
  -> result projection
```

物理file名は`service.ts`を標準にします。`application/service/`のように同じ意味のdirectoryを重ねません。

`service`へframework contextを渡しません。必要な値とportだけを渡します。

## port

`port`はapplicationが外部へ要求する能力の型です。

```ts
export type ItemRepository = {
  findById(input: {
    organizationId: string
    itemId: string
  }): Promise<Item | null>
}
```

portを作る対象:

- DB access
- object storage
- email
- LLM
- clock、ID generator
- telemetry
- external API
- testで差し替える必要がある複雑なnavigation/notification

portを作らない対象:

- pure helper
- 同じmodule内の小さな関数
- 一つしかなく差し替え理由もないlocal処理
- 全てのReact hook

何でもportにするとimplementationを隠すだけのceremonyが増えます。

portは「testでmockしたいから」だけでは作りません。外部IOまたはpolicy上の境界で、複数の
implementation、failure taxonomy、call order、security invariantのいずれかを明示する必要がある
場合に作ります。

## adapter

`adapter`はportを具体的なtechnologyへ接続します。

| port               | adapter                         |
| ------------------ | ------------------------------- |
| `ItemRepository`   | Drizzle/libSQL implementation   |
| `EmailSender`      | Cloudflare Email implementation |
| `LanguageModel`    | OpenRouter implementation       |
| `NotificationPort` | Sonner implementation           |
| `NavigationPort`   | Next.js router implementation   |

adapterは外側のSDK errorを内側のerror taxonomyへ変換します。raw provider errorをapplicationへ漏らしません。

## repository

`repository`はpersistence用adapterです。API moduleの`repository.ts`はDrizzle queryとrow mappingを所有します。

原則:

- tenant resourceは`organizationId`を必須引数にする
- application permissionをrepositoryだけへ委ねない
- DB constraintとquery scopeの両方で境界を守る
- raw DB errorをpublic responseへ出さない

`packages/db`へbusiness repositoryを置きません。`packages/db`はschemaとclientを所有し、repositoryはuse caseのownerである`apps/api`へ置きます。

## transport

`transport`はHTTP、stream、browser eventなど外部input/outputの形を扱います。

APIではElysia routeとValibot schema、WebではEden clientやAgent stream transportが該当します。

transportはapplicationを呼び、repositoryを直接呼びません。

## platform

`platform`はapp全体へ一度だけ接続するruntime concernを所有します。

- environment validation
- observability
- request ID
- framework plugin
- shared runtime adapter

feature/module固有のbusiness rule、repository、port adapterを`platform`へ移しません。
`platform`が利用・実装できるのはrequest ID、telemetry、clock等、app-globalでdomain-neutralな
contractだけです。module固有portのadapterはowner moduleへ置き、composition rootから接続します。
domain moduleが`platform`へ依存する逆向きは禁止します。万能な`shared` directoryにしないため、
ownerがfeature/moduleにあるcodeはowner側へ残します。

## controllerとview

WebのClient Componentでside effectと表示を分ける必要がある場合に使います。

- `controller`: Query、mutation、router、chat transport、state transitionを接続する
- `view`: propsとしてstateとactionを受け、DOM、interaction、a11yを所有する

```tsx
export const FeatureClient = () => {
  const controller = useFeatureController()
  return <FeatureView state={controller.state} actions={controller.actions} />
}
```

単純なcomponentを必ず二fileへ分割しません。次に該当する場合だけ分けます。

- IO、router、toast、Query、form、streamが複数ある
- view stateをStorybookで独立検証したい
- hookが100行budgetを超える
- UIとside effectの変更頻度が異なる

`boundary.tsx`という曖昧な名前は原則使いません。`*.client.tsx`、`*.server.tsx`、`*-provider.tsx`、`*-error-boundary.tsx`のように境界の種類を名前へ出します。

## composition root

`composition root`はportとadapterを接続する唯一の場所です。

- Web: `*.server.tsx`、`*.client.tsx`、provider
- API: `module.ts`、`app.ts`
- Agent: `src/mastra/composition/**`、`worker.ts`

applicationやdomainがconcrete adapterを生成しません。

## mockとfakeとfixture

用語を次に固定します。

| 用語             | 意味                                                         |
| ---------------- | ------------------------------------------------------------ |
| `mock`           | callや引数を観測し、期待値をassertするtest double            |
| `fake`           | 簡略化した動作可能なimplementation。例: in-memory repository |
| `stub`           | 固定responseを返す最小test double                            |
| `fixture`        | test input、保存済みstate、canonical streamなどのdata        |
| `scripted model` | 順序付きmodel outputを返すdeterministic fake                 |

`mock API`、`light`、`dark`、`dialog`などcodeとStorybookで使う語は英語表記へ統一します。

## componentとtest file

基本形:

```text
components/
  feature-panel.tsx
  feature-panel.test.tsx
  feature-panel.stories.tsx
```

`*.test.tsx`はNode/happy-domで実行するunit/DOM testです。`*.browser.test.tsx`はreal QueryClient、必要な範囲だけのtransport stub、chat transport、複数componentなどStorybook storyでは表しにくいbrowser integrationだけに使います。

VRTは現在実施しないため、`*.visual.test.tsx`を作りません。

component directoryへ分ける条件:

- 本体、test、story、fixture、private subcomponentで4file以上
- private subcomponentが複数ある
- 独立したsubmoduleとして所有したい

```text
components/feature-panel/
  feature-panel.tsx
  feature-panel.test.tsx
  feature-panel.stories.tsx
  fixtures.ts
```

## indexts

`index.ts`はpublic boundaryにだけ置きます。

置く場所:

- feature root
- package public entrypoint
- workspace外へ公開するsubmodule

置かない場所:

- private component directory
- helper directory
- import pathを短くするだけのbarrel

barrelを増やすとcycleとdead exportを発見しにくくなるためです。

public entrypointは利用者に必要な最小surfaceだけを明示exportし、`internal/`、`adapters/`、
`repository.ts`、test supportを再exportしません。packageの`exports`、feature/moduleの
`index.ts`または`public.ts`、Oxlint、Knip、export-surface testは同じ境界を表し、一方を変えるPRでは
残りも同時に更新します。

## directoryへ分ける基準

最終形では責務ごとの名前を明確にしますが、1fileだけの空directoryは作りません。次のいずれかでdirectoryへ昇格します。

- 同じ責務のfileが3個以上
- public/private boundaryが必要
- ownerやtest setupが異なる
- import ruleをdirectory単位で強制する

## 不採用案

### 全workspaceを同じClean Architecture treeにする

runtimeと変更頻度が異なるため不採用です。共通にするのはdependency conceptであり、directoryの深さではありません。

### 全side effectをcustom hookへ入れる

巨大componentが巨大hookへ移るだけになるため不採用です。pure state、port、adapter、controllerへ責務を分けます。

### 全componentをview/controllerへ分割する

単純なcomponentにceremonyが増えるため不採用です。分割条件を満たす場合だけ適用します。

## 受入条件

- 同じ用語がworkspaceごとに異なる意味で使われない
- `boundary`の曖昧なfile名が残らない
- domainからframework importがない
- portを作る理由が説明できる
- component test fileが過剰分割されていない
- private directoryに不要な`index.ts`がない
