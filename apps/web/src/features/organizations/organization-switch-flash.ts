const organizationSwitchFlashKey =
  "enterprise-agentic-saas:organization-switch-completed"

type OrganizationSwitchFlashStorage = Pick<
  Storage,
  "getItem" | "removeItem" | "setItem"
>

export const queueOrganizationSwitchFlash = (
  storage: OrganizationSwitchFlashStorage
) => {
  try {
    storage.setItem(organizationSwitchFlashKey, "1")
  } catch {
    // A storage policy must not block a successful tenant-boundary navigation.
  }
}

export const consumeOrganizationSwitchFlash = (
  storage: OrganizationSwitchFlashStorage
) => {
  try {
    const queued = storage.getItem(organizationSwitchFlashKey) === "1"
    storage.removeItem(organizationSwitchFlashKey)
    return queued
  } catch {
    return false
  }
}

export const navigateAfterOrganizationSwitch = (
  storage: OrganizationSwitchFlashStorage,
  location: Pick<Location, "assign">,
  pathname: string
) => {
  queueOrganizationSwitchFlash(storage)
  location.assign(pathname)
}
