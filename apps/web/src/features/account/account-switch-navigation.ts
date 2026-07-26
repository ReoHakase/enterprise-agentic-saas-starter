import {
  defaultAccountSwitchReturnTo,
  resolveAccountSwitchReturnTo,
} from "./account-switch-return-to"

export const navigateAfterAccountSwitch = (
  returnTo = defaultAccountSwitchReturnTo
) => {
  globalThis.location.assign(resolveAccountSwitchReturnTo(returnTo))
}
