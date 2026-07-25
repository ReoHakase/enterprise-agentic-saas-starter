"use client"

import {
  PROFILE_IMAGE_SIZE,
  PROFILE_IMAGE_SOURCE_CONTENT_TYPE,
  PROFILE_IMAGE_SOURCE_MAX_BYTES,
  uploadOrganizationProfileImageWithProgress,
  uploadUserProfileImageWithProgress,
} from "@enterprise-agentic-saas/api/client"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@enterprise-agentic-saas/ui/components/alert-dialog"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { FieldError } from "@enterprise-agentic-saas/ui/components/field"
import { ImageCropDialog } from "@enterprise-agentic-saas/ui/components/image-crop-dialog"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ImagePlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import {
  type ChangeEvent,
  type MouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"

import { OrganizationProfileImage } from "@/components/organization-identity"
import { UserProfileImage } from "@/components/user-identity"
import { accountKeys } from "@/features/account"
import { consoleKeys } from "@/features/console"
import { fileKeys, registerFileUpload } from "@/features/files"
import { issueKeys } from "@/features/issues"
import { apiClient } from "@/lib/api-client"
import { clientEnv } from "@/lib/env.client"
import { isFirstPartyProfileImageUrl } from "@/lib/profile-image-url"

import { deleteOrganizationProfileImage, deleteUserProfileImage } from "../api"

const acceptedProfileImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
])
const profileImageAccept = "image/png,image/jpeg,image/webp"
const maxSourceBytes = 10_000_000

type UserProfileImageEditorProps = {
  subject: "user"
  name: string
  profileImage: string | null
}

type OrganizationProfileImageEditorProps = {
  subject: "organization"
  organizationId: string
  name: string
  profileImage: string | null
}

type ProfileImageEditorProps =
  | UserProfileImageEditorProps
  | OrganizationProfileImageEditorProps

type PreparedProfileImageUpload = {
  blob: Blob
  uploadId: string
}

const pickerError = (file: File) => {
  if (!acceptedProfileImageTypes.has(file.type)) {
    return "Choose a PNG, JPEG, or WebP image."
  }
  if (file.size > maxSourceBytes) {
    return "Choose an image smaller than 10 MB."
  }
  return undefined
}

const uploadErrorText =
  "The profile image could not be uploaded. Check the image and try again."

type ProfileImageCardProps = {
  busy: boolean
  cancelUpload: () => void
  hasUploadedProfileImage: boolean
  inputRef: RefObject<HTMLInputElement | null>
  openPicker: () => void
  preparedUpload: boolean
  props: ProfileImageEditorProps
  requestRemove: () => void
  retryUpload: () => void
  selectSource: (event: ChangeEvent<HTMLInputElement>) => void
  uploadError?: string
  uploadProgress?: number
}

const ProfileImageCard = ({
  busy,
  cancelUpload,
  hasUploadedProfileImage,
  inputRef,
  openPicker,
  preparedUpload,
  props,
  requestRemove,
  retryUpload,
  selectSource,
  uploadError,
  uploadProgress,
}: ProfileImageCardProps) => (
  <div className="flex min-w-0 flex-col gap-4 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center">
    {props.subject === "user" ? (
      <UserProfileImage user={props} className="size-16" />
    ) : (
      <OrganizationProfileImage organization={props} className="size-16" />
    )}
    <div className="min-w-0 flex-1">
      <p className="font-medium">Profile image</p>
      <p className="text-sm text-muted-foreground">
        PNG, JPEG, or WebP up to 10 MB. The image will be cropped to a square.
      </p>
      {uploadProgress !== undefined ? (
        <div className="mt-3 flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <progress
              className="h-1.5 min-w-0 flex-1 accent-primary"
              max={100}
              value={uploadProgress}
              aria-label="Uploading profile image"
            />
            <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">
              {Math.round(uploadProgress)}%
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={cancelUpload}
          >
            Cancel upload
          </Button>
        </div>
      ) : null}
      {uploadError ? (
        <FieldError className="mt-2" role="alert">
          {uploadError}
        </FieldError>
      ) : null}
      {preparedUpload && uploadProgress === undefined ? (
        <Button
          className="mt-3"
          type="button"
          variant="outline"
          size="sm"
          onClick={retryUpload}
        >
          <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
          Retry upload
        </Button>
      ) : null}
    </div>
    <div className="flex shrink-0 flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={openPicker}
      >
        <ImagePlusIcon data-icon="inline-start" aria-hidden="true" />
        {props.profileImage ? "Replace" : "Choose image"}
      </Button>
      {hasUploadedProfileImage ? (
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={requestRemove}
        >
          <Trash2Icon data-icon="inline-start" aria-hidden="true" />
          Remove
        </Button>
      ) : null}
    </div>
    <input
      ref={inputRef}
      type="file"
      className="sr-only"
      aria-label="Choose profile image"
      accept={profileImageAccept}
      onChange={selectSource}
      tabIndex={-1}
    />
  </div>
)

const RemoveProfileImageDialog = ({
  error,
  onOpenChange,
  onRemove,
  open,
  pending,
}: {
  error?: string
  onOpenChange: (open: boolean) => void
  onRemove: (event: MouseEvent<HTMLButtonElement>) => void
  open: boolean
  pending: boolean
}) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Remove profile image?</AlertDialogTitle>
        <AlertDialogDescription>
          The previous profile image will be restored when one is available.
          Otherwise initials or an organization symbol will be shown.
        </AlertDialogDescription>
      </AlertDialogHeader>
      {error ? <FieldError role="alert">{error}</FieldError> : null}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          disabled={pending}
          onClick={onRemove}
        >
          {pending ? <Spinner data-icon="inline-start" /> : null}
          Remove image
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)

export const ProfileImageEditor = (props: ProfileImageEditorProps) => {
  const router = useRouter()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const uploadControllerRef = useRef<AbortController | null>(null)
  const unregisterUploadRef = useRef<(() => boolean) | null>(null)
  const [source, setSource] = useState<File>()
  const [preparedUpload, setPreparedUpload] =
    useState<PreparedProfileImageUpload>()
  const [uploadProgress, setUploadProgress] = useState<number>()
  const [uploadError, setUploadError] = useState<string>()
  const [removeOpen, setRemoveOpen] = useState(false)
  const [removeError, setRemoveError] = useState<string>()

  const refreshProfileImages = useCallback(async () => {
    try {
      if (props.subject === "user") {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: consoleKeys.all }),
          queryClient.invalidateQueries({
            queryKey: accountKeys.deviceAccounts(),
          }),
          queryClient.invalidateQueries({ queryKey: issueKeys.all }),
          queryClient.invalidateQueries({ queryKey: fileKeys.all }),
        ])
      } else {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: consoleKeys.organization(props.organizationId),
          }),
          queryClient.invalidateQueries({
            queryKey: consoleKeys.organizations(),
          }),
          queryClient.invalidateQueries({ queryKey: consoleKeys.me() }),
        ])
      }
    } finally {
      router.refresh()
    }
  }, [props, queryClient, router])

  const removeMutation = useMutation({
    mutationFn: () =>
      props.subject === "user"
        ? deleteUserProfileImage(apiClient)
        : deleteOrganizationProfileImage(apiClient, props.organizationId),
    onSuccess: async () => {
      setRemoveOpen(false)
      setUploadError(undefined)
      setRemoveError(undefined)
      try {
        await refreshProfileImages()
      } catch {
        // Deletion is authoritative. Normal query retry or the RSC refresh
        // will reconcile a cache refresh that failed afterward.
      }
      toast.success("Profile image removed")
    },
    onError: () => {
      setRemoveError("The profile image could not be removed. Try again.")
    },
  })
  const { isPending: removePending, mutate: mutateRemove } = removeMutation

  const releaseUpload = useCallback(() => {
    unregisterUploadRef.current?.()
    unregisterUploadRef.current = null
    uploadControllerRef.current = null
  }, [])

  const uploadCroppedImage = useCallback(
    async (prepared: PreparedProfileImageUpload) => {
      if (prepared.blob.size > PROFILE_IMAGE_SOURCE_MAX_BYTES) {
        setUploadError("The cropped image is too large. Choose another image.")
        setPreparedUpload(undefined)
        setUploadProgress(undefined)
        return
      }

      const controller = new AbortController()
      uploadControllerRef.current = controller
      unregisterUploadRef.current = registerFileUpload(controller)
      setUploadError(undefined)
      setUploadProgress(0)
      const file = new File([prepared.blob], "profile-image.png", {
        type: PROFILE_IMAGE_SOURCE_CONTENT_TYPE,
      })

      try {
        if (props.subject === "user") {
          await uploadUserProfileImageWithProgress({
            baseUrl: clientEnv.NEXT_PUBLIC_API_BASE_URL,
            uploadId: prepared.uploadId,
            file,
            signal: controller.signal,
            onProgress: ({ percent }) => setUploadProgress(percent),
          })
        } else {
          await uploadOrganizationProfileImageWithProgress({
            baseUrl: clientEnv.NEXT_PUBLIC_API_BASE_URL,
            organizationId: props.organizationId,
            uploadId: prepared.uploadId,
            file,
            signal: controller.signal,
            onProgress: ({ percent }) => setUploadProgress(percent),
          })
        }
        setSource(undefined)
        setPreparedUpload(undefined)
        setUploadProgress(undefined)
        try {
          await refreshProfileImages()
        } catch {
          // Upload is authoritative. Normal query retry or the RSC refresh
          // will reconcile a cache refresh that failed afterward.
        }
        toast.success("Profile image updated")
      } catch (error) {
        setUploadProgress(undefined)
        if (error instanceof Error && error.name === "AbortError") {
          setUploadError("The profile image upload was canceled.")
        } else {
          setUploadError(uploadErrorText)
        }
      } finally {
        releaseUpload()
      }
    },
    [props, refreshProfileImages, releaseUpload]
  )

  const openPicker = useCallback(() => inputRef.current?.click(), [])
  const selectSource = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    const error = pickerError(file)
    if (error) {
      setUploadError(error)
      return
    }
    uploadControllerRef.current?.abort()
    setPreparedUpload(undefined)
    setUploadError(undefined)
    setSource(file)
  }, [])
  const handleCropOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setSource(undefined)
    }
  }, [])
  const handleCroppedImage = useCallback(
    ({ blob }: { blob: Blob }) => {
      const prepared = { blob, uploadId: crypto.randomUUID() }
      setSource(undefined)
      setPreparedUpload(prepared)
      setUploadProgress(0)
      queueMicrotask(() => {
        void uploadCroppedImage(prepared)
      })
    },
    [uploadCroppedImage]
  )
  const handleRemoveOpenChange = useCallback((open: boolean) => {
    setRemoveOpen(open)
    if (!open) setRemoveError(undefined)
  }, [])
  const requestRemove = useCallback(() => {
    setRemoveError(undefined)
    setRemoveOpen(true)
  }, [])
  const cancelUpload = useCallback(() => {
    uploadControllerRef.current?.abort()
  }, [])
  const retryUpload = useCallback(() => {
    if (!preparedUpload || uploadProgress !== undefined) return
    setUploadError(undefined)
    setUploadProgress(0)
    queueMicrotask(() => {
      void uploadCroppedImage(preparedUpload)
    })
  }, [preparedUpload, uploadCroppedImage, uploadProgress])
  const removeProfileImage = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      mutateRemove()
    },
    [mutateRemove]
  )

  useEffect(
    () => () => {
      uploadControllerRef.current?.abort()
      unregisterUploadRef.current?.()
    },
    []
  )

  const busy = uploadProgress !== undefined || removePending
  const hasUploadedProfileImage = isFirstPartyProfileImageUrl(
    props.profileImage,
    clientEnv.NEXT_PUBLIC_API_BASE_URL
  )

  return (
    <>
      <ProfileImageCard
        busy={busy}
        cancelUpload={cancelUpload}
        hasUploadedProfileImage={hasUploadedProfileImage}
        inputRef={inputRef}
        openPicker={openPicker}
        preparedUpload={preparedUpload !== undefined}
        props={props}
        requestRemove={requestRemove}
        retryUpload={retryUpload}
        selectSource={selectSource}
        uploadError={uploadError}
        uploadProgress={uploadProgress}
      />

      {source ? (
        <ImageCropDialog
          open
          source={source}
          shape={props.subject === "user" ? "circle" : "rounded"}
          aspect={1}
          outputSize={PROFILE_IMAGE_SIZE}
          outputType={PROFILE_IMAGE_SOURCE_CONTENT_TYPE}
          title="Crop profile image"
          description="Move and zoom the image to choose the square area to use."
          confirmLabel="Upload image"
          onOpenChange={handleCropOpenChange}
          onConfirm={handleCroppedImage}
        />
      ) : null}

      <RemoveProfileImageDialog
        error={removeError}
        onOpenChange={handleRemoveOpenChange}
        onRemove={removeProfileImage}
        open={removeOpen}
        pending={removePending}
      />
    </>
  )
}
