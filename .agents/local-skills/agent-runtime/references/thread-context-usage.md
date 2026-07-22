# Thread、context、usage参照

## Thread

listはowner/tenantを再検証し、`updatedAt DESC, id DESC`、保存message count付きで返す。新規UIはlocal draftで開始し、初回send/attachmentでrowを作る。

`rename_thread`は現在runの`untitled` threadだけを最大1回CAS更新する。80文字以下、approval不要。明示title rowをrenameしない。

## Context

事前推定をsystem/skills/tools/history/page context/attachmentsに分け、provider実績と区別する。70/85/95%でnotice/warning/critical。95%以上は古い履歴をsummary化し最新12 messageを保持する。なお超過する場合は新規threadを案内する。

## Usage

input total、no-cache、cache read/write、output total、text output、reasoning、image count、provider/calculated cost、pricing version、estimate flagをeventへ固定する。`runEventId` uniqueでeventとdaily projectionをexactly-onceにする。

priceはeffective period付きversion rowから選び、過去eventを新価格で再計算しない。本人monthly APIとadmin organization/user/model APIを分ける。context meterとmonthly usage meterを同一指標にしない。

## Migration

`packages/db/drizzle/`へgenerateされたmigrationを保存し、fresh DBと既存schema upgradeの両方をtestする。既存thread/action/run/usage rowを保持する。通常起動でpush/resetしない。
