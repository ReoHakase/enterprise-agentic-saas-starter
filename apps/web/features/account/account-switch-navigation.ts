const defaultAccountSwitchReturnTo = "/dashboard"
const returnToBase = new URL("https://account-switch.invalid")
const hasAsciiControlCharacter = (value: string) =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint !== undefined && (codePoint < 32 || codePoint === 127)
  })

export const resolveAccountSwitchReturnTo = (returnTo: string) => {
  if (
    !returnTo.startsWith("/") ||
    returnTo.startsWith("//") ||
    returnTo.includes("\\") ||
    hasAsciiControlCharacter(returnTo)
  ) {
    return defaultAccountSwitchReturnTo
  }

  const destination = new URL(returnTo, returnToBase)
  if (destination.origin !== returnToBase.origin) {
    return defaultAccountSwitchReturnTo
  }
  return `${destination.pathname}${destination.search}${destination.hash}`
}

export const navigateAfterAccountSwitch = (
  returnTo = defaultAccountSwitchReturnTo
) => {
  globalThis.location.assign(resolveAccountSwitchReturnTo(returnTo))
}
