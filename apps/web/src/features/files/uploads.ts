const activeFileUploadControllers = new Set<AbortController>()
const activeFileUploadQueueCancellations = new Set<() => void>()

export const registerFileUpload = (controller: AbortController) => {
  activeFileUploadControllers.add(controller)
  return () => activeFileUploadControllers.delete(controller)
}

export const registerFileUploadQueueCancellation = (cancel: () => void) => {
  activeFileUploadQueueCancellations.add(cancel)
  return () => activeFileUploadQueueCancellations.delete(cancel)
}

export const cancelActiveFileUploads = () => {
  for (const cancel of activeFileUploadQueueCancellations) cancel()
  for (const controller of activeFileUploadControllers) controller.abort()
  activeFileUploadControllers.clear()
}
