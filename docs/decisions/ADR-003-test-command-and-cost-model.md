---
id: ADR-003
title: test commandとcost layer
status: accepted
date: 2026-07-24
owners:
  - repository-maintainers
supersedes:
  - none
---

# ADR-003 test commandとcost layer

## 背景

Unit、browser、E2E、paid LLMが混ざると、通常確認が遅くなりpaid実行を避けにくくなります。

## 決定

Root test scriptを`test`、`test:browser`、`test:e2e`、`test:eval:agent`、`test:e2e:agent`へ限定し、runtimeとcostで分けます。
内部はL0からL7へ分類し、deterministic core、browser feature integration、probabilistic canaryの
三層にします。paid evalはcontract/stack/3回stabilityをbrowserlessで実行し、paid browser E4は
規範文書でIDを固定した2本のcanaryを各1回だけ実行します。VRTはdeferします。
layer mappingと実行条件は[テスト戦略](../testing/README.md)に定義します。

## 理由

最も低いdeterministic layerへ保証を置き、real browserとpaid LLMを配線確認へ限定するためです。
production parser、controller、tool executor、repositoryをmockせず、非決定的なmodel/network境界だけを
差し替えることで、test専用実装ではなくproduction contractを検証します。

browser-import可能なcomponentは全てL4のStorybook catalogueへ置き、route/Server Component/cookie等の
browser featureでは閉じない境界だけをL5へ残します。loading/ready/errorのDOM geometry assertionは
pixel baselineを持たないためVRTではなく、VRT deferredのまま必須にできます。

Agent behaviourを確認するpaid evalでは、各caseを独立stateで3回実行し3/3を要求します。一回の
偶然成功を合格にしないためです。Paid testは通常PRから分離し、
maintainerの明示実行、nightly、releaseだけに限定します。repository固有のcost計算や予算validatorは
持ちません。release時にbrowserとreal modelを同時に使うL7だけは固定二本を各一回、retryなしにします。

`bun run check`はbrowserを必要としないL0からL3を全件含め、L4は独立したrequired browser CIにします。
pre-pushへbrowser起動を入れて回避を誘発せず、PRではStorybook/Browser Modeをskip可能な任意checkに
しないためです。

## 検討した代替案

- layerごとに多数のscript: interfaceが増え、実行漏れが起きる
- 全て`test`へ含める: 日常実行が重くなる
- 全てE2E: 遅くflakyで原因分離が難しい
- VRTを同時導入: browser/font/GPU固定とbaseline review運用が未成熟
- selected case各1回: 費用は低いが、非決定的なmodelの偶然成功を見逃す

## 結果

通常PRのbrowserとfree E2Eはfull実行するためCI時間が増えますが、path selector、base SHA処理、
selector fixtureを保守しません。
Security、tenant、approval、privacy、idempotencyはLLM scorerではなくdeterministic assertionで
判定します。自然言語品質だけをscorerへ委ねます。

## 強制方法

- root script contract
- CI job separation
- 通常PRでのfull browser/free E2E
- paid secretをfork PRへ渡さない
- paid実行を通常PRのrequired checkへ含めない

## 検証

- local/full/affected execution test
- free E2E aggregate
- paid suiteが通常PRから分離されること
