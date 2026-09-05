# Portless topology

`@enterprise-agentic-saas/portless-topology`は、このリポジトリのローカル開発用URLを
main checkoutとlinked worktreeで同じ規則から解決する、非公開のCLI専用workspaceです。
公開面は`portless-topology` executableだけであり、source import用の`exports`は持ちません。

```sh
portless-topology resolve enterprise-agentic-saas
portless-topology resolve api.enterprise-agentic-saas
portless-topology run enterprise-agentic-saas -- vite dev
portless-topology exec -- turbo run dev
```

Webはmain checkoutで`https://enterprise-agentic-saas.localhost`、linked worktreeで
`https://<branch>.enterprise-agentic-saas.localhost`になります。API等は
`api.<branch>.enterprise-agentic-saas.localhost`のようにservice prefixを左へ付けます。
CLIは`portless get enterprise-agentic-saas`だけからnamespaceを取得し、branch名を独自加工しません。

## 暫定措置

このworkspaceは[Portless issue #372](https://github.com/vercel-labs/portless/issues/372)が解決するまでの
リポジトリ固有の暫定措置です。共通packageとして機能を追加しません。

上流修正を含むPortlessへ更新しただけでは削除しません。削除する変更で次をすべて完了させます。

1. `resolve`と`run`をnative Portless commandへ置換し、main checkout、linked worktree、
   複数labelのservice prefixでhostname parityを確認する。
2. `exec`が担うrepository固有のlocal environment組み立てを、Portlessに依存しない永続的な経路へ
   移すか、各値が不要になったことを示す。対象はWeb/API/Auth/CORS/DB/GitHub Emulate/Agent storageの
   origin、Cookie domain、GitHub callback、local Agent storage token、およびstaleな
   `EMULATE_BASE_URL`と`TURSO_AUTH_TOKEN`の除去、Portless CAの読込を含む。
3. native経路でchildのargv、終了コード、`SIGINT`、`SIGTERM`の転送が同等であることを確認する。

削除時の実Portless smokeは全hostnameだけでなく、`APP_BASE_URL`、`API_PUBLIC_URL`、
`VITE_API_BASE_URL`、`BETTER_AUTH_URL`、`AUTH_COOKIE_DOMAIN`、`TRUSTED_ORIGINS`、
`CORS_ORIGIN`、`TURSO_DATABASE_URL`、`GITHUB_OAUTH_EMULATOR_URL`、
`GITHUB_OAUTH_CALLBACK_URL`、`MASTRA_STORAGE_URL`、`MASTRA_STORAGE_AUTH_TOKEN`、stale
token/environment除去、`VITE_DEV_SESSION_ID`、`VITE_DEV_WORKTREE_ID`、
`VITE_OTEL_EXPORTER_OTLP_ENDPOINT`、`NODE_EXTRA_CA_CERTS`、child exit/signal parityをmain checkoutとlinked
worktreeの両方で検証します。すべて通った時点で次を同じ変更から削除します。

- このworkspace
- rootと全consumerの`@enterprise-agentic-saas/portless-topology` development dependency
- Knip、Oxlint、テスト等の品質設定
- この暫定CLIを案内する文書
- 所有commandで更新したlockfile entry
