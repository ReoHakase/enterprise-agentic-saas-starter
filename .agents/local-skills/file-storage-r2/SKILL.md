---
name: file-storage-r2
description: enterprise-agentic-saas-starterの認証付きfile storage、R2 binding、upload、download、preview、Issue attachmentとAgent assetを変更するときに使う。
---

# File Storage R2

## 必読文書

- [認証付きfile storage運用](../../../docs/file-storage-r2.md)
- [API設計](../../../docs/architecture/apps/api.md)
- [Web設計](../../../docs/architecture/apps/web.md)
- memory変更時: [Upload memory smoke](../../../docs/upload-memory-smoke.md)

## Workflow

1. object lifecycle、authorization、tenant scope、content validationを確認する。
2. APIがopaque IDからR2 objectを再解決し、browserへprivate keyやdirect URLを渡さない。
3. upload、preview、deleteを別serviceに保ち、activityとDB更新をtransactionalに扱う。
4. MIME、size、unknown-length stream、cross-tenantのnegative testを追加する。
5. Web表示は認証付きpreview componentとpage-batched queryを使う。

## Validation

- `bun run --cwd apps/api test`
- `bun run --cwd apps/web test`
- `bun run test:e2e`
- Worker binding変更時: `bun run build:cloudflare`

## 禁止事項

- R2 object key、private URL、image optimizer URLをclientへ露出しない。
- filename、MIME、content lengthをclient申告だけで信用しない。
- attachment一覧をN+1 queryで取得しない。
- raw bytesやsigned materialをlog、Sentry、canonical messageへ保存しない。
