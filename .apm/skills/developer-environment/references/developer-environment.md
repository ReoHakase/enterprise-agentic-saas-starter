# Developer Environment Reference

## 役割

```txt
nix develop:
  Bun, Node系CLI, apm, dotenvx, turso CLI, playwright dependenciesなどを定義

direnv:
  repoに入ったときnix developやenv読込を有効化

dotenvx:
  secretをenvファイルから読み込む

APM:
  .apm/skills, instructions, promptsを管理

MCP:
  nextjs, playwright, turso, context7などで実装確認
```

## secret

- `.env*` はgitに入れない。
- secret値をskill/reference/docsに書かない。
- CIではGitHub Secretsやdotenvxの安全な注入を使う。
- public envは `NEXT_PUBLIC_*` だけ。

## agent向け記録

実装中にrepo固有の判断が増えたら、関連skillの `SKILL.md` に短く追加する。長いコード例や設定例は `references/` に移す。

新規skillにする目安:

- 既存skillのdescriptionでは発火しにくい。
- その関心ごとだけで独立したタスクが何度も発生する。
- agentが誤判断しやすい固有ルールがある。
