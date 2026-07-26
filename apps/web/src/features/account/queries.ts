export const accountKeys = {
  deviceAccounts: () => ["auth", "device-accounts"] as const,
  deviceAccountsFor: (userId: string) =>
    [...accountKeys.deviceAccounts(), userId] as const,
}
