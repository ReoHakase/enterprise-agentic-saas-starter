import type { FileDto } from "@enterprise-agentic-saas/api/client"

export const fictionalImageFile = {
  id: "file_01K1ARCHITECTURE00000000",
  owner: { type: "issue", id: "issue_01K1BILLING00000000000" },
  filename: "tenant-architecture.png",
  sizeBytes: 245_760,
  declaredContentType: "image/png",
  previewable: true,
  textPreviewable: false,
  imageWidth: 1440,
  imageHeight: 900,
  uploader: {
    id: "user_01K1AVERY00000000000000",
    name: "Avery Stone",
    profileImage: null,
  },
  createdAt: "2026-07-24T09:30:00.000Z",
  canDelete: true,
} satisfies FileDto

const fictionalTextFile = {
  id: "file_01K1RUNBOOK0000000000000",
  owner: { type: "issue", id: "issue_01K1BILLING00000000000" },
  filename: "incident-runbook.txt",
  sizeBytes: 8_192,
  declaredContentType: "text/plain",
  previewable: false,
  textPreviewable: true,
  imageWidth: null,
  imageHeight: null,
  uploader: {
    id: "user_01K1JORDAN0000000000000",
    name: "Jordan Lee",
    profileImage: null,
  },
  createdAt: "2026-07-24T10:15:00.000Z",
  canDelete: false,
} satisfies FileDto

export const fictionalFiles = [
  fictionalImageFile,
  fictionalTextFile,
] satisfies FileDto[]
