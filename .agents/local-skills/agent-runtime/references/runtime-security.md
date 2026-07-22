# Runtimeとsecurity参照

## Capability lifecycle

- connection ticket: 60秒以内、一回限り、session/user/org/thread/context epochへ束縛
- connection grant: run開始で同一transaction内に単回消費
- run grant: 5分以内、run ID/scope/attemptへ束縛
- resume ticket: 60秒以内、一回限り、approved actionだけ
- DB保存はhashだけ。URL、response、log、Sentryへplaintextを出さない

各internal callでlive session、active organization、epoch、membership、permission、owner、expiryを再検証する。GET historical approvalだけは元session/epochを要求せず、現在ownerを検証する。decision/resumeは元scopeを維持する。

## Runtime composition

`apps/agent/src/mastra/index.ts`をStudioとWorker共通のMastra entrypointにする。Agent/tool/model/skillを別実装へforkしない。toolはprivate API clientの薄いadapterにし、transactionやauthorizationを持たせない。

Qwen3.6 Flash profile:

- `qwen/qwen3.6-flash`
- 1,000,000 context
- reasoning medium
- max output 4,096

product provider呼出しは2分でabortし、5分のrun grant期限より前にcanceledへsettleしてcomposerを復帰する。timeoutを無制限に延ばさず、observed usageはabort時にも記録する。

自動titleはmain Agentの任意tool選択へ依存させない。APIの`shouldGenerateTitle`がtrueのuser turnだけ専用title Agentを起動し、`rename_thread`をforced tool callする。manual titleはrevision CASで`user` stateにし、自動処理で上書きしない。

## Web検索

main Agentのcustom `web_search`だけが検索専用Agentを呼ぶ。検索専用Agentへtenant history、run grant、Issue toolを渡さない。local guard → server known-identity guard → quota reservation → providerの順を固定する。query/拒否値/Issue本文をobservabilityへ渡さない。

検索専用Agentはguard済みqueryの検索と要約だけを担うためQwen reasoningを無効化し、OpenRouter Exa server toolを最大3 result・60秒でboundedに呼ぶ。main Agentのreasoning mediumは維持する。provider hangを製品run全体へ伝播させない。

## Stream

AI SDK UI streamのtext/reasoning/source/toolに加え、`data-context-budget`、`data-thread-title`をcanonical化する。`data-activity`は同じIDでreconcileするcurrent-turn transient statusだけにし、finish/error/abort/disconnectで消して保存しない。provider metadata、raw error、base64、credentialは落とす。client tool continuationは最後の保存済みassistant tool partのbounded resultだけを受ける。
