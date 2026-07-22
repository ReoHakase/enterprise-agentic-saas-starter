# Thread、context、usage参照

## Thread

listはowner/tenantを再検証し、`updatedAt DESC, id DESC`、保存message count付きで返す。新規UIはlocal draftで開始し、初回send/attachmentでrowを作る。

`rename_thread`は現在runの`untitled` threadだけを最大1回CAS更新する。80文字以下、approval不要。専用title Agentだけへ渡し、main Agentの任意選択へ依存しない。manual renameはrevision CASで`user` stateにし、自動titleで上書きしない。

OpenRouter経由のQwen/Alibabaはthinking mode中のforced `tool_choice`を拒否する。専用title Agentだけ`reasoning.enabled=false`かつ`effort=none`にし、製品Agent本体のreasoning mediumとは分離する。この設定は実provider E2Eの自動titleとunit assertionで固定する。

## Context

事前推定をsystem/skills/tools/history/page context/attachmentsに分け、provider実績と区別する。70/85/95%でnotice/warning/critical。95%以上は古い履歴をsummary化し最新12 messageを保持する。なお超過する場合は新規threadを案内する。

## Usage

input total、no-cache、cache read/write、output total、text output、reasoning、image count、provider/calculated cost、pricing version、estimate flagをeventへ固定する。`runEventId` uniqueでeventとdaily projectionをexactly-onceにする。

priceはeffective period付きversion rowから選び、context thresholdのtier価格も同じversionへ固定し、過去eventを新価格で再計算しない。本人monthly APIとadmin organization/user/model APIを分ける。chatにはmonthly costを表示せず、context ringとusage APIを別指標にする。

## Migration

`packages/db/drizzle/`へgenerateされたmigrationを保存し、fresh DBと既存schema upgradeの両方をtestする。旧時限policyはupgradeで失効させ、新しい`agent_thread_permissions`へ暗黙移行しない。既存thread/action/run/usage rowを保持する。通常起動でpush/resetしない。
