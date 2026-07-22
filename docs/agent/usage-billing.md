# Usageとbilling

## Usage event

provider usageはMastra固有shapeをruntime境界で正規化し、run grantでprivate APIへ記録します。

```ts
type AgentUsageEvent = {
  organizationId: string
  userId: string
  threadId: string
  runId: string
  provider: "openrouter"
  model: string
  inputTokenCount: number
  inputNoCacheTokenCount: number
  cacheReadTokenCount: number
  cacheWriteTokenCount: number
  outputTokenCount: number
  textOutputTokenCount: number
  reasoningTokenCount: number
  totalTokenCount: number
  imageInputCount: number
  providerCostMicros: number | null
  calculatedCostMicros: number
  pricingVersion: string
  isEstimate: boolean
  runEventId: string
}
```

`total = input + output`です。providerのoutput totalにreasoningが含まれる場合、reasoningを再加算しません。cache read/writeもinput totalと別の課金分類であり、総tokenへ二重加算しません。失敗、cancel、client disconnectでもproviderから観測できたusageは記録します。

`runEventId`は同じ観測eventのretryを一意にし、usage event insertと日次projectionをexactly-onceへ収束させます。

## Pricing

`agent_model_prices`はprovider/model、effective period、pricing version、通貨、1M token当たりのinput/cache read/cache write/output単価を保持します。context量でtierが変わるmodelはthresholdとhigh-tierの4単価も同じversionへ固定します。usage発生時点の有効priceを選び、calculated costをeventへ固定します。後日の価格改定で過去costを再計算しません。

provider costが観測できれば表示集計はprovider costを優先し、なければcalculated costを使って`isEstimate = true`とします。price未登録は`unpriced`として0を記録し、黙って別model priceを流用しません。

Qwen3.6 Flashは256,000 input token以下と超過で単価が変わるため、低/high tierをversion付きmigrationでseedします。threshold判定はproviderへ送った総input tokenで行い、そのrequest全体へ該当tierを適用します。将来の価格改定は既存rowを書き換えず、新しいeffective versionを追加します。

## Daily projection

`agent_usage_daily`はdate、organization、user、provider、modelをunique keyにし、eventの初回insertと同じtransactionで加算します。保持する値はrun count、input/output/reasoning/total token、costです。

公開API:

- `GET /agent/usage/monthly`: 本人、現在active organization、月別、model別
- `GET /agent/usage/organization`: admin/owner、user/model別

memberはorganization aggregateを取得できません。月は`YYYY-MM`だけを受け、active organizationをrequest bodyから選ばせません。

## UI境界

chat composerは一runのcontext window占有率だけを円形ringで表示し、monthly token/costを表示しません。本人向けmonthly APIと管理画面向け集計は維持し、利用量画面で金額を出す場合はUSDと推定有無を明示してraw provider responseを表示しません。

## Error behavior

usage記録失敗で既に生成したuser responseを失わせない一方、Sentryへpayloadなしのerror codeを送りrelease gateでは失敗扱いにします。daily projectionだけ失敗してeventだけcommitする状態はtransactionで禁止します。duplicate eventは成功扱いで`recorded: false`を返します。
