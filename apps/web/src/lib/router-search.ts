const rawSearchString = Symbol("rawSearchString")

type FlatSearch = Record<string, unknown> & {
  [rawSearchString]?: string
}

export const parseFlatSearch = (searchString: string): FlatSearch => {
  const search: FlatSearch = Object.create(null)
  for (const [key, value] of new URLSearchParams(searchString)) {
    const current = search[key]
    search[key] =
      current === undefined
        ? value
        : Array.isArray(current)
          ? [...current, value]
          : [current, value]
  }

  Object.defineProperty(search, rawSearchString, {
    value: searchString
      ? searchString.startsWith("?")
        ? searchString
        : `?${searchString}`
      : "",
  })
  return search
}

const appendSearchValue = (
  searchParams: URLSearchParams,
  key: string,
  value: unknown
) => {
  if (value === undefined) return
  const serialized =
    value !== null && typeof value === "object"
      ? JSON.stringify(value)
      : String(value)
  if (serialized !== undefined) searchParams.append(key, serialized)
}

export const stringifyFlatSearch = (search: FlatSearch) => {
  const preservedSearchString = search[rawSearchString]
  if (preservedSearchString !== undefined) return preservedSearchString

  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(search)) {
    if (Array.isArray(value)) {
      for (const item of value) appendSearchValue(searchParams, key, item)
    } else {
      appendSearchValue(searchParams, key, value)
    }
  }
  const searchString = searchParams.toString()
  return searchString ? `?${searchString}` : ""
}
