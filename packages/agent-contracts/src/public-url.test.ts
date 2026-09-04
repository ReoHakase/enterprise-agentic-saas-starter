import { describe, expect, it } from "vitest"

import { canonicalizePublicHttpUrl } from "./public-url"

describe("canonicalizePublicHttpUrlの契約", () => {
  it("公開URLを正規化する", () => {
    expect(
      canonicalizePublicHttpUrl("HTTPS://Example.COM./path?q=1#private")
    ).toBe("https://example.com/path")
  })

  it.each([
    "http://localhost./",
    "http://service.internal/",
    "http://0.1.2.3/",
    "http://100.64.0.1/",
    "http://100.127.255.254/",
    "http://192.0.0.1/",
    "http://192.0.2.1/",
    "http://192.88.99.1/",
    "http://198.18.0.1/",
    "http://198.19.255.254/",
    "http://198.51.100.1/",
    "http://203.0.113.1/",
    "http://224.0.0.1/",
    "http://[::1]/",
    "http://[fc00::1]/",
    "http://[fe80::1]/",
    "http://[ff02::1]/",
    "http://[2001:db8::1]/",
    "http://[2001:2::1]/",
    "http://[3fff::1]/",
    "http://[::ffff:127.0.0.1]/",
  ])("予約済みURL %sを拒否する", (url) => {
    expect(canonicalizePublicHttpUrl(url)).toBeNull()
  })

  it.each([
    "https://example.com/docs?access_token=PRIVATE_ACCESS_TOKEN",
    "https://example.com/docs?api_key=PRIVATE_API_KEY",
    "https://example.com/docs?X-Amz-Signature=PRIVATE_SIGNATURE",
    "https://example.com/docs?sv=2026-01-01&sp=r&sig=PRIVATE_SAS",
    "https://example.com/docs?code=PRIVATE_AUTH_CODE",
    "https://example.com/docs?opaque=PRIVATE_CAPABILITY",
  ])("%sからsource query全体を除去する", (url) => {
    expect(canonicalizePublicHttpUrl(url)).toBe("https://example.com/docs")
  })

  it.each([
    "https://1.1.1.1/",
    "https://93.184.216.34/",
    "https://[2606:4700:4700::1111]/",
  ])("公開URL %sを受け入れる", (url) => {
    expect(canonicalizePublicHttpUrl(url)).toBe(url)
  })
})
