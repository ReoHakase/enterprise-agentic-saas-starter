const loopbackHostname = "127.0.0.1"

export const w6Environment = {
  apiOrigin: `http://${loopbackHostname}:3201`,
  apiPort: 3201,
  webOrigin: `http://${loopbackHostname}:3200`,
  webPort: 3200,
} as const
