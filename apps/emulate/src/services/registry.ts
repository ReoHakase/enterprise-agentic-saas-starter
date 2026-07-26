import type { ServiceName } from "emulate"

const EMULATE_SERVICE_NAMES = [
  "github",
  "google",
  "slack",
  "apple",
  "microsoft",
  "okta",
  "stripe",
] as const satisfies readonly ServiceName[]

export type EmulateService = (typeof EMULATE_SERVICE_NAMES)[number]

export type EmulateServiceDefinition = {
  defaultPort: number
  readinessPath: string
}

const EMULATE_SERVICE_DEFINITIONS: Record<
  EmulateService,
  EmulateServiceDefinition
> = {
  github: { defaultPort: 4001, readinessPath: "/meta" },
  google: {
    defaultPort: 4002,
    readinessPath: "/.well-known/openid-configuration",
  },
  slack: { defaultPort: 4003, readinessPath: "/" },
  apple: {
    defaultPort: 4004,
    readinessPath: "/.well-known/openid-configuration",
  },
  microsoft: {
    defaultPort: 4005,
    readinessPath: "/.well-known/openid-configuration",
  },
  okta: {
    defaultPort: 4006,
    readinessPath: "/.well-known/openid-configuration",
  },
  stripe: { defaultPort: 4009, readinessPath: "/v1/customers" },
}

export class EmulateServiceError extends Error {
  constructor(input: string | undefined) {
    const value = input?.trim()
    super(
      value
        ? `未対応のemulate serviceです: ${value}`
        : "起動するemulate serviceを指定してください。"
    )
    this.name = "EmulateServiceError"
  }
}

const isEmulateService = (input: string | undefined): input is EmulateService =>
  input !== undefined &&
  EMULATE_SERVICE_NAMES.some((service) => service === input)

export const parseEmulateService = (
  input: string | undefined
): EmulateService => {
  const value = input?.trim()

  if (!isEmulateService(value)) {
    throw new EmulateServiceError(value)
  }

  return value
}

export const getEmulateServiceDefinition = (
  service: EmulateService
): EmulateServiceDefinition => EMULATE_SERVICE_DEFINITIONS[service]
