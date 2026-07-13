# CI And Quality Reference

## root scripts目標

```json
{
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "check": "bun run lint && bun run format:check && bun run typecheck && bun run test",
    "lint": "turbo run lint",
    "format": "oxfmt .",
    "format:check": "oxfmt --check .",
    "test": "turbo test",
    "test:unit": "turbo test:unit",
    "test:e2e": "turbo test:e2e",
    "test:storybook": "turbo run test:storybook --filter=@enterprise-agentic-saas/ui",
    "typecheck": "turbo typecheck",
    "storybook": "turbo storybook"
  }
}
```

## turbo task目標

```json
{
  "tasks": {
    "dev": { "cache": false, "persistent": true },
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**", "storybook-static/**"]
    },
    "lint": { "outputs": [] },
    "format:check": { "outputs": [] },
    "typecheck": { "dependsOn": ["^build"], "outputs": [] },
    "test:unit": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "test:e2e": {
      "cache": false,
      "outputs": ["test-results/**", "playwright-report/**"]
    },
    "test:storybook": {
      "dependsOn": ["transit"],
      "outputs": []
    }
  }
}
```

## GitHub Actions job例

```txt
install
lint
format-check
typecheck
vitest
storybook-build
storybook-test
next-build
playwright
```

PRではPlaywright smoke、mainではfull E2Eに分けてもよい。

現行Storybookは `storybook build` と `vitest run --project=storybook-light --project=storybook-dark` を別々に実行する。Cloudflareは `turbo run build:cloudflare` でdeployせずbundleまで検証する。

root `bun run lint` はTurbo経由で各workspaceのcwdからpackage-local `oxlint.config.ts` を読む。rootで単一 `oxlint` を再帰実行しない。

Lefthookのpre-commitでも `bun run lint` を引数なしで実行する。`{staged_files}` をroot lintへ渡すとTurboがfile pathをtask名として扱い、`Missing tasks in project` で失敗する。
