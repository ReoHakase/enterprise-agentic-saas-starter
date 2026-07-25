---
title: Emailパッケージテスト戦略
status: proposed
implementation: planned
last_reviewed: 2026-07-26
applies_to:
  - packages/email/**
related:
  - ../apps/api.md
  - ../e2e.md
---

# Emailパッケージテスト戦略

## 目的

`packages/email`は、email contract、React Email template、render helper、provider adapter、local Mailpit integrationを所有します。

業務上いつメールを送るかはAPI serviceが決めます。Email packageは、受け取ったmail commandを安全に描画し、適切なproviderへ渡せることを保証します。

## コード構造との対応

```text
packages/email/src/
  index.ts
  config.ts

  contracts/
  templates/
    components/
    authentication/
    organization/
  render/
  runtime/
  providers/
  development/
  test-support/
```

内部境界:

- contractはReact Emailとproviderへ依存しない
- templateはprovider、runtime、development、UI、Auth、DBへ依存しない
- provider adapterはtemplate内部実装へ依存しない
- development adapterをproduction sourceからimportしない

## テスト層

| 名前                                           | Testing Trophy 分類 | テスト内容                                                                                                                                                                                                                                                                                                                                                                                              | 実物として使うもの                                               | 差し替えるもの                                    | 対象コード/ファイル                                                                   | Test Runner                   | 実行速度   | CI時間課金以外の費用               | 量         |
| ---------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------- | ---------- | ---------------------------------- | ---------- |
| **メール契約単体テスト (MAIL1)**               | 単体                | <ul><li>recipient、subject data、template input、locale、public URLのschemaを確認する</li><li>header injection、invalid address、過大subject、missing required fieldを拒否することを確認する</li><li>provider非依存のmail commandとerror分類を確認する</li><li>private fieldやtokenが意図せずtemplate inputへ含まれないことを確認する</li></ul>                                                         | contract、schema、config parser、URL builder                     | clock、ID、environment                            | `packages/email/src/contracts/**`、pure config、template input builder                | Vitest Node                   | 極めて速い | なし                               | 多い       |
| **メールテンプレート描画統合テスト (MAIL2)**   | 統合                | <ul><li>React Email templateをHTMLとplain textへ描画し、必須内容とlinkを確認する</li><li>optional section、長いorganization名、Unicode、空の補足情報を確認する</li><li>危険なHTMLがescapeされ、secretや内部objectが出力されないことを確認する</li><li>dark mode、email client差を考慮した構造上のfallbackを確認する</li><li>全文snapshotだけに依存せず、意味的なheading、link、textを確認する</li></ul> | React Email component、renderer、template partial                | provider、SMTP、network、clock                    | `packages/email/src/templates/**`、`render/**`、template fixture                      | Vitest + React Email renderer | 速いから中 | なし                               | 厚くする   |
| **メールproviderアダプター統合テスト (MAIL3)** | 統合                | <ul><li>mail commandがprovider requestへ正しくserialiseされることを確認する</li><li>from、to、subject、HTML、text、reply-to、idempotency metadataを確認する</li><li>429、5xx、timeout、invalid responseを有限なerrorへ変換することを確認する</li><li>retry可能errorと恒久errorを区別し、secretをlogへ出さないことを確認する</li></ul>                                                                   | provider adapter、HTTP client、runtime selector                  | provider endpointはmock server、credentialはdummy | `packages/email/src/providers/**`、`runtime/**`、provider request mapper              | Vitest + mock HTTP server     | 中         | provider sandboxを使わない限りなし | 必要な範囲 |
| **ローカルメール配信統合テスト (MAIL4)**       | 統合                | <ul><li>local runtimeがMailpitまたはlocal inboxへ実際にメールを配送できることを確認する</li><li>messageが期待するrecipient、subject、HTML、textで受信されることを確認する</li><li>development sessionの検出、再利用、終了所有権を確認する</li><li>productionでlocal adapterを選択できないことを確認する</li></ul>                                                                                       | local Mailpit、local adapter、実HTTPまたはSMTP、rendered message | production provider、実domain、実recipient        | `packages/email/src/development/**`、local runtime selector、Mailpit integration test | Vitest + local Mailpit        | 遅い       | なし                               | 少数       |

## MAIL1: メール契約単体テスト

MAIL1は、業務object全体をtemplateへ渡す設計を禁止するためにも使います。template inputは必要なpublic fieldだけを持つ明示型にします。

```text
bad
  Issue DB row全体をtemplateへ渡す

good
  IssueAssignmentEmailInputだけを渡す
```

## MAIL2: メールテンプレート描画統合テスト

MAIL2はtemplateとrendererを接続するため統合テストです。

確認方法:

- heading、paragraph、link textをparseして確認する
- link destinationを確認する
- HTMLとplain textの両方を確認する
- conditional sectionを明示fixtureで確認する
- snapshotを使う場合もmeaningful assertionを併用する

pixel-perfectなemail client表示はこの層の保証外です。重要templateは別途manual previewを行えます。

## MAIL3: メールproviderアダプター統合テスト

provider SDKまたはHTTP adapterを実際に使い、request serialisationを確認します。外部provider本番へは接続しません。

providerを変更する場合は次を確認します。

- idempotency
- retry semantics
- response error mapping
- timeout
- rate limit
- payload size
- log redaction

## MAIL4: ローカルメール配信統合テスト

MAIL4は通常のtemplate testではなく、local development runtimeが実際に利用できることを確認します。

E1で代表journeyのメール到達を確認する場合でも、全templateとprovider errorをE2Eで繰り返しません。

## APIとの責務分担

| 保証                                      | 所有者     |
| ----------------------------------------- | ---------- |
| どの条件でメールを送るか                  | API A2     |
| outboxとtransaction順序                   | API A2、A3 |
| template input contract                   | MAIL1      |
| HTML/plain text rendering                 | MAIL2      |
| provider requestとerror mapping           | MAIL3      |
| local inboxへの配送                       | MAIL4      |
| representative business journeyからの到達 | E1         |

## 実行

```sh
bun --cwd packages/email run test
```

MAIL4はlocal service起動が必要なため、通常`test`へ含めるか専用integration projectにするかを実測で決めます。外す場合も`main`またはnightlyで必ず実行します。

## 受入条件

- contract、template、provider、development runtimeが分離される
- templateがDB、Auth、UI、providerへ依存しない
- HTMLとplain textを意味的に検査する
- provider errorとretry分類を検査する
- local Mailpit integrationを代表caseで検査する
- API serviceの業務判断とEmail packageの責務が混ざらない
