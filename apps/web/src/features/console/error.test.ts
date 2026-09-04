import { FileUploadError } from "@enterprise-agentic-saas/api/client"
import { describe, expect, it } from "vitest"

import { httpError } from "@/test-support/http-error"

import {
  clearConsoleApiFieldError,
  getConsoleApiFieldError,
  getConsoleApiFieldErrors,
  hasConsoleApiFieldError,
  isStepUpRequiredError,
  presentConsoleApiError,
  shouldRetryConsoleQuery,
} from "./error"

describe("コンソール API エラー表示", () => {
  it("エラーを包み直さずnativeのstatusとcodeを読み取る", () => {
    const error = httpError(403, "step_up_required", {
      message: "Recent authentication is required.",
    })

    expect(isStepUpRequiredError(error)).toBe(true)
    expect(
      presentConsoleApiError(error, "The operation was not completed.").message
    ).toBe("Recent authentication is required.")
  })

  it("サーバー障害には固定の操作文言を使う", () => {
    expect(
      presentConsoleApiError(
        httpError(500, "internal_error"),
        "The organization was not updated."
      )
    ).toEqual({
      description: "Try again. If the problem continues, contact support.",
      fieldErrors: {},
      message: "The organization was not updated.",
    })
  })

  it("未検証のError.messageを表示しない", () => {
    expect(
      presentConsoleApiError(
        new Error("libsql://token@private.example.test"),
        "The issue could not be created."
      )
    ).toEqual({
      description: undefined,
      fieldErrors: {},
      message: "The issue could not be created.",
    })
  })

  it("4xxレスポンスから上限付きの公開可能なフィールドエラーだけを表示する", () => {
    const error = httpError(400, "validation_error", {
      fieldErrors: {
        __proto__: ["unsafe"],
        name: ["Choose another name."],
        title: ["x".repeat(501)],
      },
      message: "Check the highlighted fields.",
    })

    expect(getConsoleApiFieldErrors(error)).toEqual({
      name: ["Choose another name."],
    })
    expect(getConsoleApiFieldError(error, "name")).toBe("Choose another name.")
    expect(presentConsoleApiError(error, "Request failed").message).toBe(
      "Check the highlighted fields."
    )
  })

  it("5xxレスポンスではサーバー指定の詳細を表示しない", () => {
    const error = httpError(500, "internal_error", {
      fieldErrors: { token: ["private"] },
      message: "provider token=private",
    })

    expect(presentConsoleApiError(error, "Request failed")).toEqual({
      description: "Try again. If the problem continues, contact support.",
      fieldErrors: {},
      message: "Request failed",
    })
  })

  it("XHR upload adapterが渡す上限付きメッセージだけを表示する", () => {
    expect(
      presentConsoleApiError(
        new FileUploadError({
          code: "unsupported_media_type",
          message: "Choose a PNG, JPEG, or WebP image.",
          status: 415,
        }),
        "Upload failed"
      ).message
    ).toBe("Choose a PNG, JPEG, or WebP image.")

    expect(
      presentConsoleApiError(
        new FileUploadError({
          message: "provider token=private",
          status: 503,
        }),
        "Upload failed"
      ).message
    ).toBe("Upload failed")
  })

  it("エラーを置き換えずにプロパティ アクセスのスローを処理する", () => {
    const error = new Proxy(new Error("provider detail"), {
      get() {
        throw new Error("getter failed")
      },
    })

    expect(isStepUpRequiredError(error)).toBe(false)
    expect(presentConsoleApiError(error, "Request failed").message).toBe(
      "Request failed"
    )
  })

  it("編集されたローカルフィールドのみを不変更新でクリアする", () => {
    const fieldErrors = {
      name: ["Choose another name."],
      slug: ["Choose another slug."],
    }

    const nextFieldErrors = clearConsoleApiFieldError(fieldErrors, "name")

    expect(nextFieldErrors).toEqual({ slug: ["Choose another slug."] })
    expect(fieldErrors).toHaveProperty("name")
  })

  it("指定フィールドがなければ同じエラー状態を返す", () => {
    const fieldErrors = { slug: ["Choose another slug."] }

    expect(clearConsoleApiFieldError(fieldErrors, "missing")).toBe(fieldErrors)
  })

  it("指定フィールドに公開可能なエラーが残るか判定する", () => {
    const fieldErrors = { slug: ["Choose another slug."] }

    expect(hasConsoleApiFieldError(fieldErrors, ["name", "slug"])).toBe(true)
    expect(hasConsoleApiFieldError(fieldErrors, ["name"])).toBe(false)
  })

  it("network・server障害は1回再試行し、API 4xxは再試行しない", () => {
    const badRequest = httpError(400, "validation_error")
    const unavailable = httpError(503, "service_unavailable")

    expect(shouldRetryConsoleQuery(0, badRequest)).toBe(false)
    expect(shouldRetryConsoleQuery(0, unavailable)).toBe(true)
    expect(shouldRetryConsoleQuery(0, new TypeError("Failed to fetch"))).toBe(
      true
    )
    expect(shouldRetryConsoleQuery(1, unavailable)).toBe(false)
    expect(shouldRetryConsoleQuery(1, new TypeError("Failed to fetch"))).toBe(
      false
    )
  })
})
