# Asset、mention、page context

## Chat画像

Browserは画像を一度だけAPIへmultipart uploadし、messageにはopaque asset IDだけを保存します。base64、data URI、raw image、private URLをchat request、Turso、Mastra history、tool argument、logへ保存しません。

- JPEG / PNG / WebP / GIF
- 1画像10 MB以下
- 1 message最大4画像、合計20 MB以下
- dimension 10,000px以下、40,000,000 pixels以下
- ready chat assetは既定72時間、hard max 7日

Agent WorkerにR2 bindingを渡しません。APIがACLとrun bindingを検証し、max edge 2,048px、WebP quality 75、4 MiB + 1 byte bounded readのmodel inputだけを返します。画像内のtextもuntrusted contentです。

Issue attachmentへの昇格はphysical storage objectとlogical claim/fileを分け、action previewとapprovalへ含めます。promotion、Issue mutation、claim transferは同じtransactionへ閉じます。一般的なowner変更APIは作りません。

## Mention model

composerの`@`候補は次です。

- current page
- selected Issues
- Issue
- file
- member

選択後は青いcontext chipとして表示し、右端のXで削除します。chip labelはUI表示専用で、serverは信用しません。requestは構造化referenceだけを送ります。

```ts
type ContextReference =
  | { kind: "issue" | "selected_issue" | "file" | "member"; id: string; label?: string }
  | { kind: "current_page"; path: string; label?: string }
```

APIはlive active organizationでID/pathを再解決します。

- Issue: organization IDを条件にtitle、number、status等のbounded projection
- file: private file ACLとIssue ownerを再検証
- member: membershipを再検証し、emailをmodelへ返さない
- current page: active organization slug以下に限定し、Issue routeならnumberを再解決

不存在、別tenant、stale resourceは同じnot-found/validationへ丸め、browser labelからauthorizationやprompt dataを作りません。

## Issue link

Issue個別ページlinkは、確認済みtool outputに正のIssue番号が存在するときだけ描画します。model textの`#123`を自動link化しません。URLは現在のorganization slug付き`/organization/:slug/issues/:number`です。

create/update/delete後はAPI receiptに含まれるIssue番号を使います。search/get toolはcanonical resultの番号だけを使います。別tenant IDやtitle文字列からURLを組み立てません。

## Draftと切替

未送信text、context chip、staged画像、pending retry identityはthread単位の一時UI stateです。thread切替はuploadとactive responseを停止しますが、通常切替ではdraftを保持します。archiveとorganization切替は説明付き確認後にdraftとtemporary assetを破棄します。
