export const formatFileSize = (bytes: number) => {
  if (bytes < 1_000) return `${bytes.toString()} B`
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} KB`
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}
