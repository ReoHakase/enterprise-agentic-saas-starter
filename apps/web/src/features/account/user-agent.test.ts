import { describe, expect, it } from "vitest"

import { describeSessionClient } from "./user-agent"

describe("describeSessionClientの契約", () => {
  it("デバイス・ブラウザー・OS・エンジンと生のUser-Agentを説明する", () => {
    const userAgent =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1"

    expect(describeSessionClient(userAgent)).toEqual({
      browser: "Safari 18.5",
      device: "Apple iPhone",
      engine: "WebKit 605.1.15",
      operatingSystem: "iOS 18.5",
      platform: "Mobile",
      userAgent,
    })
  })

  it("User-Agentが記録されていない場合は明示的な不明値を返す", () => {
    expect(describeSessionClient(null)).toEqual({
      browser: "Unknown browser",
      device: "Unknown device",
      engine: "Unknown engine",
      operatingSystem: "Unknown OS",
      platform: "Unknown platform",
      userAgent: "No User-Agent recorded",
    })
  })
})
