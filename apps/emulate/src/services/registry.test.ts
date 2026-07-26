import { describe, expect, it } from "vitest"

import { getEmulateServiceDefinition, parseEmulateService } from "./registry"

const SERVICES = [
  "github",
  "google",
  "slack",
  "apple",
  "microsoft",
  "okta",
  "stripe",
] as const

describe("emulate service registry", () => {
  it("公開対象を明示した7 serviceへ限定する", () => {
    expect(SERVICES.every((service) => parseEmulateService(service))).toBe(true)
  })

  it.each([
    ["github", 4001, "/meta"],
    ["google", 4002, "/.well-known/openid-configuration"],
    ["slack", 4003, "/"],
    ["apple", 4004, "/.well-known/openid-configuration"],
    ["microsoft", 4005, "/.well-known/openid-configuration"],
    ["okta", 4006, "/.well-known/openid-configuration"],
    ["stripe", 4009, "/v1/customers"],
  ] as const)("%sの既定portとreadinessを固定する", (service, port, path) => {
    expect(getEmulateServiceDefinition(service)).toEqual({
      defaultPort: port,
      readinessPath: path,
    })
  })

  it("空値と対象外serviceを拒否する", () => {
    expect(() => parseEmulateService(undefined)).toThrow(
      "起動するemulate serviceを指定してください。"
    )
    expect(() => parseEmulateService("aws")).toThrow(
      "未対応のemulate serviceです: aws"
    )
  })
})
