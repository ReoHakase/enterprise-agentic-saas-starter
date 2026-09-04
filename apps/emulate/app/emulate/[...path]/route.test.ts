import { describe, expect, it } from "vitest"

import { GET } from "./route"

const request = (path: string) => {
  const url = new URL(path, "http://localhost")
  return GET(new Request(url), {
    params: Promise.resolve({
      path: url.pathname.split("/").filter(Boolean).slice(1),
    }),
  })
}

describe("GitHub Next.js emulator routeの契約", () => {
  it("GitHubだけを/emulate/github以下で公開する", async () => {
    const response = await request("/emulate/github/meta")
    const unsupported = await request("/emulate/google/meta")

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      verifiable_password_authentication: true,
    })
    expect(unsupported.status).toBe(404)
    await expect(unsupported.text()).resolves.toBe("Unknown service: google")
  })

  it("並列E1用の3ユーザーをOAuth選択画面へseedする", async () => {
    const response = await request(
      "/emulate/github/login/oauth/authorize?client_id=local&redirect_uri=http%3A%2F%2Flocalhost%2Fcallback&state=test"
    )
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).toContain("oauth-alice")
    expect(body).toContain("oauth-alice@example.test")
    expect(body).toContain("oauth-bob")
    expect(body).toContain("oauth-bob@example.test")
    expect(body).toContain("oauth-carol")
    expect(body).toContain("oauth-carol@example.test")
  })
})
