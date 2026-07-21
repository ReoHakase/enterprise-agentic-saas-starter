import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useCallback } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { accountKeys } from "@/features/account/queries"

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
  refresh: vi.fn<() => void>(),
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

vi.mock("@/features/profile-images/api", () => ({
  deleteOrganizationProfileImage: mocks.deleteOrganizationProfileImage,
  deleteUserProfileImage: mocks.deleteUserProfileImage,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess },
}))

const renderEditor = (
  props:
    | {
        subject: "user"
        name: string
        profileImage: string | null
      }
    | {
        subject: "organization"
        organizationId: string
        name: string
        profileImage: string | null
      } = { subject: "user", name: "Alex", profileImage: null }
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

describe("ProfileImageEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.deleteOrganizationProfileImage.mockResolvedValue(undefined)
    mocks.deleteUserProfileImage.mockResolvedValue(undefined)
    mocks.uploadOrganizationProfileImageWithProgress.mockResolvedValue(
      profileImageDto
    )
    mocks.uploadUserProfileImageWithProgress.mockResolvedValue(profileImageDto)
  })

  it("rejects unsupported source formats before opening the crop dialog", async () => {
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

  it("retries a canceled upload with the same content and upload ID", async () => {
    const actor = userEvent.setup()
    mocks.uploadUserProfileImageWithProgress
      .mockImplementationOnce(
        ({ onProgress, signal }) =>
          new Promise((_resolve, reject) => {
            onProgress?.({ loaded: 42, total: 100, percent: 42 })
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

    expect(
      await screen.findByRole("progressbar", {
        name: "Uploading profile image",
      })
    ).toHaveValue(42)
    expect(screen.queryByRole("button", { name: "Confirm crop" })).toBeNull()

    await actor.click(screen.getByRole("button", { name: "Cancel upload" }))
    expect(
      await screen.findByText("The profile image upload was canceled.")
    ).toBeInTheDocument()
    await actor.click(screen.getByRole("button", { name: "Retry upload" }))

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
    expect(screen.queryByRole("button", { name: "Retry upload" })).toBeNull()
  })

  it("retries a failed upload but gives a newly selected crop a new upload ID", async () => {
    const actor = userEvent.setup()
    mocks.uploadUserProfileImageWithProgress
      .mockRejectedValueOnce(new Error("private upload failure"))
      .mockRejectedValueOnce(new Error("private retry failure"))
      .mockResolvedValueOnce(profileImageDto)
    renderEditor()

    const input = screen.getByLabelText("Choose profile image")
    await actor.upload(
      input,
      new File(["first"], "first.png", { type: "image/png" })
    )
    await actor.click(screen.getByRole("button", { name: "Confirm crop" }))
    expect(
      await screen.findByRole("button", { name: "Retry upload" })
    ).toBeInTheDocument()

    await actor.click(screen.getByRole("button", { name: "Retry upload" }))
    await waitFor(() => {
      expect(mocks.uploadUserProfileImageWithProgress).toHaveBeenCalledTimes(2)
    })
    const firstUploadId =
      mocks.uploadUserProfileImageWithProgress.mock.calls[0]?.[0].uploadId
    expect(
      mocks.uploadUserProfileImageWithProgress.mock.calls[1]?.[0].uploadId
    ).toBe(firstUploadId)

    await actor.upload(
      input,
      new File(["second"], "second.png", { type: "image/png" })
    )
    await actor.click(screen.getByRole("button", { name: "Confirm crop" }))
    await waitFor(() => {
      expect(mocks.uploadUserProfileImageWithProgress).toHaveBeenCalledTimes(3)
    })
    expect(
      mocks.uploadUserProfileImageWithProgress.mock.calls[2]?.[0].uploadId
    ).not.toBe(firstUploadId)
  })

  it("uploads an organization crop through the organization helper", async () => {
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

  it("invalidates cached device accounts after a user upload", async () => {
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
        queryKey: accountKeys.deviceAccounts(),
      })
    })
  })

  it("removes a first-party image and invalidates cached device accounts", async () => {
    const actor = userEvent.setup()
    const queryClient = renderEditor({
      subject: "user",
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
      queryKey: accountKeys.deviceAccounts(),
    })
  })

  it("keeps a safe removal error visible inside the confirmation dialog", async () => {
    const actor = userEvent.setup()
    mocks.deleteUserProfileImage.mockRejectedValueOnce(
      new Error("private provider detail")
    )
    renderEditor({
      subject: "user",
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

  it("does not offer removal for an external fallback image", () => {
    renderEditor({
      subject: "user",
      name: "Alex",
      profileImage: "https://avatars.githubusercontent.com/u/1?v=4",
    })

    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull()
    expect(screen.getByRole("button", { name: "Replace" })).toBeInTheDocument()
  })
})
