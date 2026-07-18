export const DEVELOPMENT_SEED = 42 as const
export const DEVELOPMENT_SEED_REFERENCE_DATE =
  "2026-01-15T09:00:00.000Z" as const

export const developmentSeedAnchors = {
  users: [
    {
      id: "10000000-0000-4000-8000-000000000001",
      name: "Aki Development",
      email: "aki@seed.local",
    },
    {
      id: "10000000-0000-4000-8000-000000000002",
      name: "Ren Development",
      email: "ren@seed.local",
    },
  ],
  organizations: [
    {
      id: "20000000-0000-4000-8000-000000000001",
      name: "Northstar Seed",
      slug: "northstar-seed",
      primaryUserId: "10000000-0000-4000-8000-000000000001",
    },
    {
      id: "20000000-0000-4000-8000-000000000002",
      name: "Orbit Seed",
      slug: "orbit-seed",
      primaryUserId: "10000000-0000-4000-8000-000000000002",
    },
  ],
  issues: [
    {
      id: "30000000-0000-4000-8000-000000000001",
      organizationId: "20000000-0000-4000-8000-000000000001",
      number: 1,
      title: "Review private file previews",
      creatorId: "10000000-0000-4000-8000-000000000001",
    },
    {
      id: "30000000-0000-4000-8000-000000000002",
      organizationId: "20000000-0000-4000-8000-000000000002",
      number: 1,
      title: "Verify tenant file isolation",
      creatorId: "10000000-0000-4000-8000-000000000002",
    },
  ],
} as const

export type DevelopmentFileFixture = {
  key: string
  id: string
  uploadId: string
  organizationId: string
  ownerType: "issue"
  ownerId: string
  uploaderId: string
  objectKey: string
  filename: string
  fixturePath: string
  declaredContentType: string
  sizeBytes: number
  md5: string
  sha256: string
  expectedImageFormat: "jpeg" | "png" | "webp" | "gif" | "avif" | null
  expectedImageWidth: number | null
  expectedImageHeight: number | null
  previewable: boolean
}

export const developmentFileFixtures = [
  {
    key: "wideJpeg",
    id: "40000000-0000-4000-8000-000000000001",
    uploadId: "50000000-0000-4000-8000-000000000001",
    organizationId: "20000000-0000-4000-8000-000000000001",
    ownerType: "issue",
    ownerId: "30000000-0000-4000-8000-000000000001",
    uploaderId: "10000000-0000-4000-8000-000000000001",
    objectKey:
      "organizations/20000000-0000-4000-8000-000000000001/files/issue/30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001",
    filename: "preview-wide.jpg",
    fixturePath: "../fixtures/files/preview-wide.jpg",
    declaredContentType: "image/jpeg",
    sizeBytes: 35_537,
    md5: "c9b33d741b04583c678a99956aee7a29",
    sha256: "7ac57a02342a3f8c817f457a0776bbceb7152bc664bd0d0e71ebbc6992c1e644",
    expectedImageFormat: "jpeg",
    expectedImageWidth: 3_000,
    expectedImageHeight: 2_000,
    previewable: true,
  },
  {
    key: "png",
    id: "40000000-0000-4000-8000-000000000002",
    uploadId: "50000000-0000-4000-8000-000000000002",
    organizationId: "20000000-0000-4000-8000-000000000001",
    ownerType: "issue",
    ownerId: "30000000-0000-4000-8000-000000000001",
    uploaderId: "10000000-0000-4000-8000-000000000002",
    objectKey:
      "organizations/20000000-0000-4000-8000-000000000001/files/issue/30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000002",
    filename: "preview.png",
    fixturePath: "../fixtures/files/preview.png",
    declaredContentType: "image/png",
    sizeBytes: 4_340,
    md5: "be126e4a3e4d01e9b18b83f918371be9",
    sha256: "06e29c89b5a5457d5221947ec59f4d4d7859e430fc2442e0974be8d2c471e74f",
    expectedImageFormat: "png",
    expectedImageWidth: 720,
    expectedImageHeight: 480,
    previewable: true,
  },
  {
    key: "avif",
    id: "40000000-0000-4000-8000-000000000003",
    uploadId: "50000000-0000-4000-8000-000000000003",
    organizationId: "20000000-0000-4000-8000-000000000001",
    ownerType: "issue",
    ownerId: "30000000-0000-4000-8000-000000000001",
    uploaderId: "10000000-0000-4000-8000-000000000001",
    objectKey:
      "organizations/20000000-0000-4000-8000-000000000001/files/issue/30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000003",
    filename: "download-only.avif",
    fixturePath: "../fixtures/files/download-only.avif",
    declaredContentType: "image/avif",
    sizeBytes: 286,
    md5: "131a49cba1b4f4b6cda6665edf506f7b",
    sha256: "300b39286a3cdcd392b5294d8a2ac0d3587dd6981cf13a8414ffe095cb601d40",
    expectedImageFormat: "avif",
    expectedImageWidth: 64,
    expectedImageHeight: 64,
    previewable: false,
  },
  {
    key: "text",
    id: "40000000-0000-4000-8000-000000000004",
    uploadId: "50000000-0000-4000-8000-000000000004",
    organizationId: "20000000-0000-4000-8000-000000000001",
    ownerType: "issue",
    ownerId: "30000000-0000-4000-8000-000000000001",
    uploaderId: "10000000-0000-4000-8000-000000000002",
    objectKey:
      "organizations/20000000-0000-4000-8000-000000000001/files/issue/30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000004",
    filename: "notes.txt",
    fixturePath: "../fixtures/files/notes.txt",
    declaredContentType: "text/plain",
    sizeBytes: 57,
    md5: "f84ce3ad5b9e2d926bb7e70688068cd4",
    sha256: "469d5cdc2b63d6223cf5ffb83b0db2e1f84b690b61abebaa284c3faf60b0dc17",
    expectedImageFormat: null,
    expectedImageWidth: null,
    expectedImageHeight: null,
    previewable: false,
  },
  {
    key: "webp",
    id: "40000000-0000-4000-8000-000000000005",
    uploadId: "50000000-0000-4000-8000-000000000005",
    organizationId: "20000000-0000-4000-8000-000000000002",
    ownerType: "issue",
    ownerId: "30000000-0000-4000-8000-000000000002",
    uploaderId: "10000000-0000-4000-8000-000000000002",
    objectKey:
      "organizations/20000000-0000-4000-8000-000000000002/files/issue/30000000-0000-4000-8000-000000000002/40000000-0000-4000-8000-000000000005",
    filename: "preview.webp",
    fixturePath: "../fixtures/files/preview.webp",
    declaredContentType: "image/webp",
    sizeBytes: 234,
    md5: "b48c11f8e7a4833f91b2a47c89d55371",
    sha256: "2239d3ef52a0e523b6c44061c9dcfcac74505b4e4c05a9be49a1b7e02af932bc",
    expectedImageFormat: "webp",
    expectedImageWidth: 360,
    expectedImageHeight: 240,
    previewable: true,
  },
  {
    key: "gif",
    id: "40000000-0000-4000-8000-000000000006",
    uploadId: "50000000-0000-4000-8000-000000000006",
    organizationId: "20000000-0000-4000-8000-000000000002",
    ownerType: "issue",
    ownerId: "30000000-0000-4000-8000-000000000002",
    uploaderId: "10000000-0000-4000-8000-000000000001",
    objectKey:
      "organizations/20000000-0000-4000-8000-000000000002/files/issue/30000000-0000-4000-8000-000000000002/40000000-0000-4000-8000-000000000006",
    filename: "preview.gif",
    fixturePath: "../fixtures/files/preview.gif",
    declaredContentType: "image/gif",
    sizeBytes: 313,
    md5: "540427f10aaf51cc7e4697f317aedc2b",
    sha256: "239f5cd5d59f5a058feb5f31f949aa0b867fc7bd262eff1f9dd3a60fb6c8ec32",
    expectedImageFormat: "gif",
    expectedImageWidth: 120,
    expectedImageHeight: 80,
    previewable: true,
  },
  {
    key: "svg",
    id: "40000000-0000-4000-8000-000000000007",
    uploadId: "50000000-0000-4000-8000-000000000007",
    organizationId: "20000000-0000-4000-8000-000000000002",
    ownerType: "issue",
    ownerId: "30000000-0000-4000-8000-000000000002",
    uploaderId: "10000000-0000-4000-8000-000000000002",
    objectKey:
      "organizations/20000000-0000-4000-8000-000000000002/files/issue/30000000-0000-4000-8000-000000000002/40000000-0000-4000-8000-000000000007",
    filename: "download-only.svg",
    fixturePath: "../fixtures/files/download-only.svg",
    declaredContentType: "image/svg+xml",
    sizeBytes: 258,
    md5: "bb942e385946dc569e910f4334220000",
    sha256: "2501eca31a6f247aeca9ebc65a610d11d3459a5831e6ade2cdfa13a5db55dddf",
    expectedImageFormat: null,
    expectedImageWidth: null,
    expectedImageHeight: null,
    previewable: false,
  },
] as const satisfies readonly DevelopmentFileFixture[]

export type ExistingDevelopmentFileRow = {
  id: string
  organizationId: string
  uploadId: string
  objectKey: string
}

// DBに残っているmanifest rowだけをR2 reconcile対象にする。
// 利用者が削除したseed fileを通常起動で復活させないことが重要。
export const selectDevelopmentFileFixturesForReconciliation = (
  existingRows: readonly ExistingDevelopmentFileRow[]
): DevelopmentFileFixture[] => {
  const fixturesById = new Map<string, DevelopmentFileFixture>(
    developmentFileFixtures.map((fixture) => [fixture.id, fixture])
  )

  return existingRows.flatMap((row) => {
    const fixture = fixturesById.get(row.id)
    if (!fixture) return []

    if (
      fixture.organizationId !== row.organizationId ||
      fixture.uploadId !== row.uploadId ||
      fixture.objectKey !== row.objectKey
    ) {
      throw new Error(
        `Development file fixture row ${row.id} does not match the committed manifest. Reset the local development data explicitly instead of overwriting it.`
      )
    }

    return [fixture]
  })
}

export const getDevelopmentFileFixtureUrl = (fixture: DevelopmentFileFixture) =>
  new URL(fixture.fixturePath, import.meta.url)
