import { useCallback, useRef, useState } from "react"

import {
  fictionalFiles,
  fictionalImageFile,
} from "../../../test-support/fixtures"
import { FilePreviewDialog } from "../file-preview-dialog"

export const FilePreviewDialogStoryFixture = () => {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [selectedFileId, setSelectedFileId] = useState<string | null>(
    fictionalImageFile.id
  )
  const closePreview = useCallback(() => setSelectedFileId(null), [])

  return (
    <>
      <button ref={triggerRef} type="button">
        Reopen file preview
      </button>
      <FilePreviewDialog
        organizationId="org_01K1ACMECLOUD0000000000"
        files={fictionalFiles}
        selectedFileId={selectedFileId}
        finalFocusRef={triggerRef}
        onSelectFile={setSelectedFileId}
        onClose={closePreview}
      />
    </>
  )
}
