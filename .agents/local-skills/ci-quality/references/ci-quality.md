# CI And Quality Reference

## root scripts目標

```json
{
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "check": "turbo check",
    "lint": "oxlint .",
    "format": "oxfmt .",
    "format:check": "oxfmt --check .",
    "test": "turbo test",
    "test:unit": "turbo test:unit",
    "test:e2e": "turbo test:e2e",
    "test:storybook": "turbo test:storybook",
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
      "outputs": ["coverage/**"]
    },
    "test:e2e": {
      "dependsOn": ["build"],
      "outputs": ["test-results/**", "playwright-report/**"]
    },
    "test:storybook": {
      "dependsOn": ["build-storybook"],
      "outputs": ["test-results/**"]
    },
    "check": {
      "dependsOn": ["lint", "format:check", "typecheck", "test:unit"],
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
