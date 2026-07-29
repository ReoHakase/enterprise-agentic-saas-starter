---
title: Portless topology CLI
status: accepted
implementation: active
last_reviewed: 2026-07-29
---

# Portless topology CLI

## 責務

`packages/portless-topology`は、main checkoutとlinked worktreeのPortless namespaceから
Web、API、DB、Agent storage、Emulate等のローカル開発用originを一貫して解決する非公開workspaceです。
`resolve`、`run`、`exec`のprocess境界、共有environment、signal転送、終了コードを所有します。

## 公開面

`package.json#bin`の`portless-topology` executableだけを公開します。`exports`と`main`は持たず、
他workspaceのsourceからimportしません。consumerはdevelopment dependencyとして宣言し、
package scriptからbare executableを起動します。

Portless本体はこのCLIのruntime dependencyです。このpackageからappや他packageのsourceへ
依存せず、consumerからこのpackageへのsource importも禁止します。

## 暫定性

このpackageは[Portless issue #372](https://github.com/vercel-labs/portless/issues/372)に対する
リポジトリ固有の暫定措置です。generic shared packageへ拡張しません。

削除する変更は次を同時に満たさなければなりません。

1. `resolve`と`run`をnative Portlessへ置換し、main checkoutとlinked worktreeの全hostnameで
   parityを確認する。
2. `exec`のrepository固有environment orchestrationをPortless非依存の永続的なlocal経路へ移すか
   不要化する。Web/API/Auth/CORS/DB/Agent storage/GitHub callback、Cookie domain、local Agent
   storage token、Portless CA、`EMULATE_BASE_URL`/`TURSO_AUTH_TOKEN`除去を同じ受入範囲に含める。
3. native経路でchild argv、終了コード、`SIGINT`、`SIGTERM`転送のparityを確認する。

実Portless smokeはhostnameだけでなくenvironment、Cookie、callback、Agent storage、Portless CA、
stale token除去、exit/signalをmain checkoutとlinked worktreeの両方で検証します。その後に限り、
package、consumer dependency、品質設定、文書、lockfile entryを同じ変更から削除します。

## 検証

```sh
bun run --cwd packages/portless-topology test
bun run --cwd packages/portless-topology lint
bun run --cwd packages/portless-topology typecheck
```
