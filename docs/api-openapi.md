---
title: API / OpenAPI
status: accepted
implementation: active
last_reviewed: 2026-08-01
---

# API / OpenAPI

## 目的

アプリケーション所有のElysiaルートと、ライブラリー所有のBetter Authルートは、別々のOpenAPI仕様を
正本にします。Scalarは2つの仕様を同じ画面から参照できますが、仕様同士を結合、変換、補正しません。

この分離により、ElysiaとBetter Authがそれぞれ生成する標準形式を保ち、ライブラリー更新時に保守する
独自変換処理をなくします。

## 入口

| パス                             | 用途                                                  |
| -------------------------------- | ----------------------------------------------------- |
| `/health`                        | プロセスまたはWorkerの生存確認                        |
| `/ready`                         | Turso/libSQLへの接続準備確認                          |
| `/openapi`                       | 2つの仕様を切り替えて表示するScalar API Reference     |
| `/openapi/json`                  | アプリケーション所有ルートだけのOpenAPI 3.0.3 JSON    |
| `/auth/open-api/generate-schema` | Better Authが実際の設定から生成するOpenAPI 3.1.1 JSON |

Better Auth既定の`/auth/reference`は404を維持します。利用者向けの画面は`/openapi`だけです。

## Scalar

`apps/api/src/platform/plugins/openapi.ts`は、Scalarの`source`を次の順序で指定します。

1. `/openapi/json`: アプリケーションAPI
2. `/auth/open-api/generate-schema`: 認証API

最初の仕様を既定表示にし、各仕様へ安定した`slug`と英語の`title`を付けます。Scalarでは次を維持します。

- Agentによる仕様のアップロードを無効にする
- telemetryを無効にする
- 認証値をローカルストレージへ永続化しない
- 既定フォントを外部から読み込まない
- 開発者ツールを表示しない
- JavaScriptの`fetch`を既定クライアントにする
- `operationId`を表示する

同一オリジンの試行では、ブラウザーが管理するSecureかつHttpOnlyなセッションcookieを使います。
cookie、トークン、パスワードをScalarの設定や仕様の例へ埋め込みません。

## アプリケーション所有の仕様

`/openapi/json`は`@elysia/openapi`がElysiaルートとValibotスキーマから生成します。Better Authのパス、
スキーマ、security schemeを含めません。

- `operationId`、英語の`summary`と`description`、tag、`x-*`分類は各ルートの`detail`へ置く
- request、response、query、path parameterはルートが使うValibotスキーマを正本にする
- スキーマとpropertyの英語説明は対応するValibot metadataへ置く
- 全体の`info`、tag説明、`sessionCookie`、Scalar設定はOpenAPIプラグインへ置く
- 保護対象ルートは`security: [{ sessionCookie: [] }]`を明示する
- 非公開ルートはルート宣言自身の`detail.hide: true`で除外する

`sessionCookie`は`apiKey`、`in: cookie`、`name: better-auth.session_token`です。本番ではBetter Authが
secure prefixを付ける場合があります。

人向けmetadataは自然な英語にします。`TODO`や機械生成されたルート名を残さず、目的、認証条件、
成功時の結果、代表的な失敗を説明します。仕様をYAML、JSON、独立したmetadata一覧へ複製しません。

## Better Auth所有の仕様

`/auth/open-api/generate-schema`はBetter Authの`openAPI`プラグインが公開する標準ルートです。
`auth.api.generateOpenAPISchema()`と同じ実設定、有効なプラグイン、`disabledPaths`から生成されます。

アプリケーション側では次を行いません。

- `/auth` prefixの追加
- アプリケーション仕様へのpathまたはcomponentの結合
- OpenAPI 3.1から3.0への変換
- operation ID、tag、description、securityの補正
- requestまたはresponseスキーマの手書き複製

Better Auth仕様の`servers`が認証ルートのbase URLを所有します。ScalarはOpenAPI 3.0.3と3.1.1の
両方を別仕様として読みます。Better Authの生成結果に改善が必要な場合は、独自補正層を戻さず、
ライブラリー設定または上流実装で解決します。

Organizationプラグインの公開範囲はBetter Authの`disabledPaths`で制御します。管理ルートと招待ルートの
所有権は認証・テナント設計を正本とし、OpenAPI用の別一覧を作りません。

## 分類とtag

アプリケーション所有ルートは、標準OpenAPIの`security`に加えて次の分類を使います。

| 拡張             | 許可値                                               | 意味                 |
| ---------------- | ---------------------------------------------------- | -------------------- |
| `x-route-status` | `enabled`, `configured-disabled`                     | 製品設定上の利用可否 |
| `x-auth-context` | `none`, `session-cookie`, `bearer`, `oauth-callback` | 呼び出し時の認証条件 |
| `x-audience`     | `general`, `first-party-web`, `invitation-recipient` | 想定する呼び出し元   |

tagは`System`、`Users`、`Sessions`、`Organizations`、`Organization members`、
`Organization invitations`、`Issues`、`Issue comments`、`Audit`、`Agent`、`Files`、
`Profile images`に統一します。Better Auth仕様のtagはライブラリー生成結果をそのまま使います。

## エラー契約

アプリケーション所有ルートのエラー本文は次の形です。

```json
{
  "error": "validation_error",
  "message": "The request is invalid.",
  "fieldErrors": {
    "title": ["Invalid value."]
  }
}
```

`error`は有限なコード、`message`は500文字以下のアプリケーション所有文言です。`fieldErrors`は
入力欄ごとの安全な文言がある場合だけ返します。5xxの`message`は固定文言とし、生の`Error.message`、
context、stack、cause、入力値、テナント識別子、非公開URLを本文へ出しません。request IDは
`x-request-id`、再試行までの秒数は必要な場合だけ`Retry-After`へ返します。

主なHTTP statusは次のとおりです。

| status | error                                                                      |
| -----: | -------------------------------------------------------------------------- |
|    400 | `validation_error`, `confirmation_required`                                |
|    401 | `unauthorized`                                                             |
|    403 | `forbidden`, `csrf_origin_forbidden`, `step_up_required`                   |
|    404 | `not_found`                                                                |
|    409 | `conflict`, `active_organization_required`, `active_organization_mismatch` |
|    415 | `unsupported_media_type`                                                   |
|    429 | `rate_limited`                                                             |
|    503 | `service_unavailable`                                                      |
|    500 | `internal_error`                                                           |

Better Authルートはライブラリー固有のエラー形式とstatusを維持します。アプリケーションの形式へ変換しません。

## セキュリティーとプライバシー

- session、OAuth、magic-link、passkey、invitationのトークンを例へ入れない
- password、Authorization、cookie、email、IP、利用者エージェントを例へ入れない
- テナント識別子、非公開URL、プロバイダーまたはDBの生エラーを例へ入れない
- 予約済みドメイン、`.test`、合成識別子だけを例へ使う
- private `/internal/agent/**`と開発・テスト専用ルートをアプリケーション仕様へ含めない

仕様を公開画面へ出すこと自体はsecurity boundaryではありません。必要な環境ではedge access policyを
別途設定します。

## 不整合の検出

アプリケーションAPIの契約テストは次を確認します。

1. `/openapi/json`がOpenAPI 3.0.3である
2. 登録済みの公開Elysiaルートが1回ずつ存在する
3. `/auth/**`、private Agent、開発・テスト専用ルートが存在しない
4. 全operationに一意な`operationId`、英語metadata、宣言済みtag、security、responseがある
5. 公開エラースキーマが`error`、安全な`message`、任意の`fieldErrors`だけである

Authパッケージの契約テストは次を確認します。

1. `/auth/open-api/generate-schema`がBetter Authの生成結果をそのまま返す
2. GitHub OAuthとOAuth Emulatorの各構成で、有効なルートが生成される
3. `disabledPaths`のルートが生成結果に存在しない
4. `/auth/reference`が404である

Scalarの検査では、HTML設定に2つの`source`と安全設定があることを確認します。巨大な結合済みJSONの
snapshotや、変換処理専用のテストは作りません。

## Edenと日付

Webは`@enterprise-agentic-saas/api/client`だけからEden clientを利用します。`parseDate: false`を固定し、
ISO形式の文字列を暗黙に`Date`へ変換しません。Issueの期日はHTTPでISO timestampまたは`null`、DBでは
`timestamp_ms`として扱い、リポジトリ境界で変換します。

## ローカル確認

```sh
bun run --cwd apps/api dev
curl -fsS https://api.enterprise-agentic-saas.localhost/openapi/json > /tmp/app-openapi.json
curl -fsS https://api.enterprise-agentic-saas.localhost/auth/open-api/generate-schema > /tmp/auth-openapi.json
bun run --cwd apps/api test -- openapi --coverage.enabled=false
bun run --cwd packages/auth test
```

Cloudflare entrypointは同じアプリケーションとAuthプラグインを使います。配備せずに次で検証します。

```sh
bun run --cwd apps/api build:cloudflare
```

## 受入条件

- `/openapi/json`がアプリケーション所有ルートだけを含む
- Better Authの生成仕様が独立した標準ルートから取得できる
- Scalarから2つの仕様を切り替えられる
- 独自結合、3.1から3.0への変換、Better Auth metadata補正がない
- アプリケーションの英語説明がElysia `detail`とValibot metadataに同居する
- Better Authのrequestとresponseを手書きで複製しない
- private route、credential、PII、生エラーを仕様へ含めない
