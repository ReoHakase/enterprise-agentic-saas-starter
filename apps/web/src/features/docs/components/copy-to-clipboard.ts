export const copyToClipboard = async (value: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(value)
    return
  } catch {
    const textarea = document.createElement("textarea")
    textarea.value = value
    textarea.setAttribute("readonly", "")
    textarea.style.position = "fixed"
    textarea.style.opacity = "0"
    document.body.append(textarea)
    textarea.select()
    const copied = document.execCommand("copy")
    textarea.remove()
    if (!copied) throw new Error("Clipboard write failed")
  }
}
