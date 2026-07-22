const MAXIMUM_EXPLICIT_PUBLIC_QUERY_CHARACTERS = 200

const explicitPublicWebSearchPattern =
  /(?:^|\n)\s*(?:public\s+)?(?:web|ウェブ)\s*検索\s*[:：]\s*([^\r\n]+)\s*(?:\n|$)/iu

export const normalizeExplicitPublicWebSearchQuery = (value: string) =>
  value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US")

export const extractExplicitPublicWebSearchQuery = (
  currentUserText: string | undefined
): string | null => {
  if (!currentUserText) return null
  const match = explicitPublicWebSearchPattern.exec(currentUserText)
  const query = match?.[1]?.trim()
  if (
    !query ||
    query.length < 2 ||
    query.length > MAXIMUM_EXPLICIT_PUBLIC_QUERY_CHARACTERS
  ) {
    return null
  }
  return query
}

export const matchesExplicitPublicWebSearchQuery = (
  allowedQuery: string | null,
  proposedQuery: string
) =>
  allowedQuery !== null &&
  normalizeExplicitPublicWebSearchQuery(allowedQuery) ===
    normalizeExplicitPublicWebSearchQuery(proposedQuery)
