# Mastra Agent paid E2E

このrunbookは、OpenRouterへの実課金を伴うAgent E2Eだけを扱う。標準の`bun run test:e2e`には含めず、release前またはAgent runtime変更時に明示実行する。

## 確認範囲

`bun run test:e2e:agent`はChromiumを1 worker、retryなしで実行し、次を一続きで確認する。

1. local GitHub OAuth emulatorで実Better Auth sessionを作る。
2. run固有の一時Turso DBへ全migrationを適用する。
3. Wrangler multi-configでAPI Workerをprimary、Agent Workerをauxiliaryとして起動する。
4. APIの`AGENT_RUNTIME`とAgentの`AGENT_INTERNAL_API`をproductionと同じnamed entrypointへ接続する。
5. organization作成後、layout-level Agent Shellを開いてthreadを作る。
6. console route navigation後も同じshell DOMと`agentThread` queryが維持されることを確認する。
7. APIの`POST /agent/chat`経由でMastra `product-agent`とOpenRouter `qwen/qwen3.6-flash`の1 turnを実行し、UI streamとAPI保存済みassistant messageを確認する。

Agent WorkerはauxiliaryなのでHTTP公開されない。Browserはcookie認証済みAPI Workerだけへ接続する。これはCloudflareが推奨する[複数Workerを単一の`wrangler dev`で起動する構成](https://developers.cloudflare.com/workers/local-development/multi-workers/)と同じである。

## Secret

keyは次のどちらか一方から読む。

- process environmentの`OPENROUTER_API_KEY`
- gitignore済み`apps/agent/.env.local`の`OPENROUTER_API_KEY`

Playwright configはsupervisorへ渡す値を確保した直後に自身のprocess environmentからkeyを除去する。supervisorはkeyをrun固有tmp directory内のAgent専用`.dev.vars`へmode 0600で書く。test worker、browser、API config、Wrangler childのprocess environment、Next.js、GitHub emulatorへkeyを渡さない。値をconsoleへ出さない。

paid response本文をartifactへ保存しないため、このsuiteだけはvideo、trace、screenshotとHTML reportを無効にし、list reporterにはtest名と成否だけを出す。Playwrightが失敗時に生成するDOM snapshotを含む出力ディレクトリもrun専用の一時領域へ置き、stack supervisorの終了処理で削除する。Playwright retryは0だが、Mastra/model provider自身のbounded retryは別に発生し得る。

## 実行

依存するunit/integration testを先に通す。

```sh
bun run --cwd apps/web vitest run agent-e2e-environment.test.ts --coverage.enabled=false
bun run --cwd apps/web playwright test --config playwright.agent.config.ts --list
```

ここまではOpenRouterを呼ばない。有料callを許可した後だけ次を実行する。

```sh
bun run test:e2e:agent
```

## Isolationとcleanup

一時directoryは`$TMPDIR/enterprise-agentic-saas-agent-e2e-<pid>`に限定する。中にはTurso DB、WAL/SHM、生成Wrangler config、Agent専用`.dev.vars`、Wrangler local stateだけを置く。

supervisorはSIGINT/SIGTERMとchild異常終了の両方で自身が起動したWrangler/Tursoだけを停止し、両childの終了を待ってからstrict path validation後にrun directoryを削除する。Playwrightのglobal teardownから先にconfigを消すと、まだ稼働中のWrangler watch buildと競合するため使わない。既存の`bun run dev`、通常の`.wrangler/state`、開発DBをkillまたはresetしない。

実行後は次を確認する。

```sh
test ! -e "$TMPDIR/enterprise-agentic-saas-agent-e2e-<pid>"
```

画像upload、Issue承認、organization切替中のstream abortはprovider結果に依存させず、通常のcomponent/API/mock Playwright testで決定的に固定する。paid suiteへ追加する場合も、runtimeが安定し、1回のmodel callで再現できるjourneyだけにする。
