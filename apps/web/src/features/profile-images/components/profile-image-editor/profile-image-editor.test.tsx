import { multiSessionQueryKeys } from "@better-auth-ui/core/plugins"
import { FileUploadError } from "@enterprise-agentic-saas/api/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useCallback } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { httpError } from "@/test-support/http-error"

import { ProfileImageEditor } from "./profile-image-editor"

type MockUploadInput = {
  file: File
  onProgress?: (value: {
    loaded: number
    total: number
    percent: number
  }) => void
  organizationId?: string
  signal?: AbortSignal
  uploadId: string
}

const mocks = vi.hoisted(() => ({
  deleteOrganizationProfileImage:
    vi.fn<(client?: unknown, organizationId?: string) => Promise<void>>(),
  deleteUserProfileImage: vi.fn<(client?: unknown) => Promise<void>>(),
  routerInvalidate: vi.fn<() => void>(),
  reportObservedError: vi.fn<(error: unknown) => void>(),
  toastSuccess: vi.fn<(message: string) => void>(),
  uploadOrganizationProfileImageWithProgress:
    vi.fn<(input: MockUploadInput) => Promise<unknown>>(),
  uploadUserProfileImageWithProgress:
    vi.fn<(input: MockUploadInput) => Promise<unknown>>(),
}))

vi.mock("@enterprise-agentic-saas/api/client", async (importOriginal) => ({
  ...(await importOriginal()),
  uploadOrganizationProfileImageWithProgress:
    mocks.uploadOrganizationProfileImageWithProgress,
  uploadUserProfileImageWithProgress: mocks.uploadUserProfileImageWithProgress,
}))

vi.mock("@enterprise-agentic-saas/ui/components/image-crop-dialog", () => ({
  ImageCropDialog: ({
    onConfirm,
  }: {
    onConfirm: (result: { blob: Blob }) => void
  }) => {
    const confirmCrop = useCallback(
      () => onConfirm({ blob: new Blob(["cropped"], { type: "image/png" }) }),
      [onConfirm]
    )
    return (
      <button type="button" onClick={confirmCrop}>
        Confirm crop
      </button>
    )
  },
}))

vi.mock("../../api", () => ({
  deleteOrganizationProfileImage: mocks.deleteOrganizationProfileImage,
  deleteUserProfileImage: mocks.deleteUserProfileImage,
}))

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: mocks.routerInvalidate }),
}))

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess },
}))

vi.mock("@/lib/report-observed-error", () => ({
  reportObservedError: mocks.reportObservedError,
}))

const renderEditor = (
  props:
    | {
        subject: "user"
        userId: string
        name: string
        profileImage: string | null
      }
    | {
        subject: "organization"
        organizationId: string
        name: string
        profileImage: string | null
      } = {
    subject: "user",
    userId: "user-1",
    name: "Alex",
    profileImage: null,
  }
) => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <ProfileImageEditor {...props} />
    </QueryClientProvider>
  )
  return queryClient
}

const profileImageDto = {
  id: "profile-image-1",
  profileImage: "/files/profile-images/users/user-1?v=profile-image-user-1-1",
  width: 512,
  height: 512,
  updatedAt: "2026-07-22T00:00:00.000Z",
} as const

describe("ProfileImageEditorの契約", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.deleteOrganizationProfileImage.mockResolvedValue(undefined)
    mocks.deleteUserProfileImage.mockResolvedValue(undefined)
    mocks.uploadOrganizationProfileImageWithProgress.mockResolvedValue(
      profileImageDto
    )
    mocks.uploadUserProfileImageWithProgress.mockResolvedValue(profileImageDto)
  })

  it("crop dialogを開く前に未対応のsource形式を拒否する", async () => {
    const actor = userEvent.setup({ applyAccept: false })
    renderEditor()

    await actor.upload(
      screen.getByLabelText("Choose profile image"),
      new File(["svg"], "profile.svg", { type: "image/svg+xml" })
    )

    expect(
      screen.getByText("Choose a PNG, JPEG, or WebP image.")
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Confirm crop" })).toBeNull()
  })

  it("キャンセル済みuploadを同じ内容・upload IDで再試行する", async () => {
    const actor = userEvent.setup()
    mocks.uploadUserProfileImageWithProgress
      .mockImplementationOnce(
        ({ signal }) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener("abort", () => {
              const error = new Error("aborted")
              error.name = "AbortError"
              reject(error)
            })
          })
      )
      .mockResolvedValueOnce(profileImageDto)
    renderEditor()

    await actor.upload(
      screen.getByLabelText("Choose profile image"),
      new File(["png"], "profile.png", { type: "image/png" })
    )
    await actor.click(screen.getByRole("button", { name: "Confirm crop" }))

    await actor.click(screen.getByRole("button", { name: "Cancel upload" }))
    await actor.click(
      await screen.findByRole("button", { name: "Retry upload" })
    )

    await waitFor(() => {
      expect(mocks.uploadUserProfileImageWithProgress).toHaveBeenCalledTimes(2)
    })
    const firstInput =
      mocks.uploadUserProfileImageWithProgress.mock.calls[0]?.[0]
    const retryInput =
      mocks.uploadUserProfileImageWithProgress.mock.calls[1]?.[0]
    expect(retryInput?.uploadId).toBe(firstInput?.uploadId)
    expect(retryInput?.file.type).toBe(firstInput?.file.type)
    expect(retryInput?.file.size).toBe(firstInput?.file.size)
    expect(await retryInput?.file.text()).toBe(await firstInput?.file.text())
  })

  it("失敗後に新しく選んだcropに新しいupload IDを割り当てる", async () => {
    const actor = userEvent.setup()
    mocks.uploadUserProfileImageWithProgress
      .mockRejectedValueOnce(new Error("private upload failure"))
      .mockResolvedValueOnce(profileImageDto)
    renderEditor()

    const input = screen.getByLabelText("Choose profile image")
    await actor.upload(
      input,
      new File(["first"], "first.png", { type: "image/png" })
    )
    await actor.click(screen.getByRole("button", { name: "Confirm crop" }))
    await screen.findByRole("button", { name: "Retry upload" })

    const firstUploadId =
      mocks.uploadUserProfileImageWithProgress.mock.calls[0]?.[0].uploadId

    await actor.upload(
      input,
      new File(["second"], "second.png", { type: "image/png" })
    )
    await actor.click(screen.getByRole("button", { name: "Confirm crop" }))
    await waitFor(() => {
      expect(mocks.uploadUserProfileImageWithProgress).toHaveBeenCalledTimes(2)
    })
    expect(
      mocks.uploadUserProfileImageWithProgress.mock.calls[1]?.[0].uploadId
    ).not.toBe(firstUploadId)
  })

  it("拒否されたプロフィール画像uploadの安全な理由を要求元へ表示する", async () => {
    const actor = userEvent.setup()
    const uploadError = new FileUploadError({
      code: "unsupported_media_type",
      message: "Choose a PNG, JPEG, or WebP image.",
      status: 415,
    })
    mocks.uploadUserProfileImageWithProgress.mockRejectedValueOnce(uploadError)
    renderEditor()

    await actor.upload(
      screen.getByLabelText("Choose profile image"),
      new File(["png"], "profile.png", { type: "image/png" })
    )
    await actor.click(screen.getByRole("button", { name: "Confirm crop" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a PNG, JPEG, or WebP image."
    )
    expect(mocks.reportObservedError).toHaveBeenCalledWith(uploadError)
  })

  it("組織用helperで組織プロフィール画像のcropをuploadする", async () => {
    const actor = userEvent.setup()
    renderEditor({
      subject: "organization",
      organizationId: "org-1",
      name: "Acme",
      profileImage: null,
    })

    await actor.upload(
      screen.getByLabelText("Choose profile image"),
      new File(["webp"], "profile.webp", { type: "image/webp" })
    )
    await actor.click(screen.getByRole("button", { name: "Confirm crop" }))

    await waitFor(() => {
      expect(
        mocks.uploadOrganizationProfileImageWithProgress
      ).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org-1" })
      )
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Profile image updated")
  })

  it("利用者画像のupload後にdevice account cacheを無効化する", async () => {
    const actor = userEvent.setup()
    const queryClient = renderEditor()
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries")

    await actor.upload(
      screen.getByLabelText("Choose profile image"),
      new File(["png"], "profile.png", { type: "image/png" })
    )
    await actor.click(screen.getByRole("button", { name: "Confirm crop" }))

    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: multiSessionQueryKeys.lists("user-1"),
      })
    })
  })

  it("first-party画像を削除してdevice account cacheを無効化する", async () => {
    const actor = userEvent.setup()
    const queryClient = renderEditor({
      subject: "user",
      userId: "user-1",
      name: "Alex",
      profileImage:
        "/files/profile-images/users/user-1?v=profile-image-user-1-1",
    })
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries")

    await actor.click(screen.getByRole("button", { name: "Remove" }))
    await actor.click(screen.getByRole("button", { name: "Remove image" }))

    await waitFor(() => {
      expect(mocks.deleteUserProfileImage).toHaveBeenCalledOnce()
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Profile image removed")
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: multiSessionQueryKeys.lists("user-1"),
    })
  })

  it("安全な削除エラーを確認dialog内に表示し続ける", async () => {
    const actor = userEvent.setup()
    mocks.deleteUserProfileImage.mockRejectedValueOnce(
      new Error("private provider detail")
    )
    renderEditor({
      subject: "user",
      userId: "user-1",
      name: "Alex",
      profileImage:
        "/files/profile-images/users/user-1?v=profile-image-user-1-1",
    })

    await actor.click(screen.getByRole("button", { name: "Remove" }))
    await actor.click(screen.getByRole("button", { name: "Remove image" }))

    expect(
      await screen.findByText(
        "The profile image could not be removed. Try again."
      )
    ).toBeInTheDocument()
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    expect(screen.queryByText("private provider detail")).toBeNull()
  })

  it("4xxレスポンスからアプリケーション所有の削除理由を表示する", async () => {
    const actor = userEvent.setup()
    mocks.deleteUserProfileImage.mockRejectedValueOnce(
      httpError(409, "conflict", {
        message: "The profile image changed. Review it and try again.",
      })
    )
    renderEditor({
      subject: "user",
      userId: "user-1",
      name: "Alex",
      profileImage:
        "/files/profile-images/users/user-1?v=profile-image-user-1-1",
    })

    await actor.click(screen.getByRole("button", { name: "Remove" }))
    await actor.click(screen.getByRole("button", { name: "Remove image" }))

    expect(
      await screen.findByText(
        "The profile image changed. Review it and try again."
      )
    ).toBeInTheDocument()
  })

  it("外部の代替画像には削除操作を表示しない", () => {
    renderEditor({
      subject: "user",
      userId: "user-1",
      name: "Alex",
      profileImage: "https://avatars.githubusercontent.com/u/1?v=4",
    })

    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull()
    expect(screen.getByRole("button", { name: "Replace" })).toBeInTheDocument()
  })
})
