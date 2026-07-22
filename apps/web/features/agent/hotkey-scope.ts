export const isAgentHotkeyAllowed = (event: { isComposing: boolean }) =>
  !event.isComposing &&
  document.querySelector('[role="dialog"], [role="alertdialog"]') === null
