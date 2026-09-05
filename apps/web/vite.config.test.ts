import { describe, expect, it } from "vitest"

import { createWebWorkerVariables } from "./vite.config"

describe("createWebWorkerVariables", () => {
  it("Given Workerに必要な値とsecretがある When varsを構築する Then 許可した値だけを渡す", () => {
    const variables = createWebWorkerVariables(
      {
        API_PUBLIC_URL: "https://api.example.test",
        BETTER_AUTH_SECRET: "must-not-leak",
        DEV_SESSION_ID: "session-id",
        TURSO_AUTH_TOKEN: "must-not-leak",
        VITE_API_BASE_URL: "https://api.example.test",
      },
      "development"
    )

    expect(variables).toEqual({
      API_PUBLIC_URL: "https://api.example.test",
      DEV_SESSION_ID: "session-id",
      NODE_ENV: "development",
      VITE_API_BASE_URL: "https://api.example.test",
    })
  })

  it("Given NODE_ENVがある When varsを構築する Then Vite modeより明示値を優先する", () => {
    expect(
      createWebWorkerVariables({ NODE_ENV: "test" }, "production")
    ).toEqual({ NODE_ENV: "test" })
  })
})
