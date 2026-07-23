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

## Issue添付の読取

`get_issue`はIssue本体と同時にready添付のmetadata pageを返します。既定50件、最大100件、opaque cursorで、項目はfile ID、filename、size、declared content type、`imageReadable`、`textPreviewable`、dimensions、uploader名、createdAtだけです。pending、R2 object key、ETag、保存URL、raw bytesは返しません。

画像内容は自動取得しません。現在のユーザー要求または回答に必要で、`get_issue`の対象添付が`imageReadable: true`のときだけ`read_issue_attachment_image({ issueId, fileId })`を呼びます。PDF、text、AVIF、SVGはmetadataだけで、本文解析、OCR専用処理、public URLは提供しません。

画像toolは`AGENT_VISION_ENABLED=1`のrunだけへ登録します。APIのprivate `GET /internal/agent/issues/:issueId/attachments/:fileId/model`はrun grant、live session、active organization、Issue owner、ready file、JPEG/PNG/WebP/GIFを複合条件で再検証し、tenant外、owner不一致、不存在、非対応画像を同じ404へ丸めます。R2 originalはCloudflare Imagesでmax edge 2,048px、WebP quality 75、animation無効へ変換し、unknown-lengthを含め4 MiBでbounded readします。user/organizationの日次vision quotaはrun IDとfile IDで冪等消費します。

Agent Workerは画像bytesをtoolのcanonical outputへ入れず、実行結果オブジェクトをkeyにした一時`WeakMap`だけへ保持します。Mastra `toModelOutput`がmodel用media partへ変換した直後にsidecarを破棄します。stream、Turso、reload履歴、log、Sentryへbase64、private URL、object key、raw bytesを残しません。reload後のtool traceは`issueId`、`fileId`、`contentType=image/webp`、変換後`sizeBytes`だけです。現在messageのchat画像とIssue画像を合わせて1 run最大4枚とし、実際にmodelへ渡した枚数だけusageの`imageInputCount`へ加算します。

## Mention model

composerの`@`候補は次です。

- current page
- selected Issues
- Issue
- file
- member

選択後はTiptap文章内の青いinline nodeとして表示し、右端のXで削除します。browser labelはrequestへ送らず、serverはID/pathだけを信用境界内で再解決します。requestは文章順を保つ`contentSegments`です。

```ts
type ContentSegment =
  | { type: "text"; text: string }
  | {
      type: "context_reference"
      reference:
        | { kind: "issue" | "file" | "member"; id: string }
        | { kind: "current_page"; path: string }
    }
```

APIはsegment順を維持したままlive active organizationでID/pathを再解決し、canonical履歴だけへserver生成label付き`data-context-reference`を保存します。Agentへ渡す文章にも同じ位置でcanonical mentionを埋め込みます。

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
