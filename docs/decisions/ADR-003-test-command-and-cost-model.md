---
id: ADR-003
title: test commandとcost layer
status: superseded
date: 2026-07-24
owners:
  - repository-maintainers
supersedes:
  - none
superseded_by:
  - ADR-007
---

# ADR-003 test commandとcost layer

## 背景

Unit、browser、E2E、paid LLMが混ざると、通常確認が遅くなりpaid実行を避けにくくなります。この判断は[ADR-007](./ADR-007-workspace-testing-strategy.md)に置き換えられました。

## 決定

Root test scriptをruntimeとcostで分け、deterministic core、browser feature integration、probabilistic canaryを独立させる方針を採用しました。現在のscript名、workspace別分類、実行条件は[テスト戦略](../testing-strategy/README.md)とADR-007を正本とします。

## 理由

最も低いdeterministic layerへ保証を置き、real browserとpaid LLMを配線確認へ限定するためです。
production parser、controller、tool executor、repositoryをmockせず、非決定的なmodel/network境界だけを
差し替えることで、test専用実装ではなくproduction contractを検証します。

public componentと主要ViewはStorybook catalogueへ置き、route、Server Component、cookie等の
browser featureでは閉じない境界はPlaywrightへ残します。loading、ready、errorのDOM geometry assertionはpixel baselineを持たないため、VRTを実装しなくても必須にできます。

Agent behaviourを確認するpaid evalでは、各caseを独立stateで3回実行し3/3を要求します。一回の
偶然成功を合格にしないためです。Paid testは通常PRから分離し、
maintainerの明示実行、nightly、releaseだけに限定します。repository固有のcost計算や予算validatorは
持ちません。release時にbrowserとreal modelを同時に使うcanaryだけは固定二本を各一回、retryなしにします。

`bun run check`はbrowserを必要としないdeterministic testを全件含め、browser testは独立したrequired CIにします。
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

- localとCIのfull execution test
- free E2E aggregate
- paid suiteが通常PRから分離されること
