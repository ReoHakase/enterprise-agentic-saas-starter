import type { ParserMap, UrlKeys } from "nuqs/server"

export const createDataTableUrlKeys = <TParsers extends ParserMap>(
  parsers: TParsers,
  { prefix }: { prefix?: string } = {}
): UrlKeys<TParsers> => {
  const namespace = prefix?.replace(/_+$/u, "")
  const urlKeys: UrlKeys<TParsers> = {}
  for (const key of Object.keys(parsers)) {
    Reflect.set(urlKeys, key, namespace ? `${namespace}_${key}` : key)
  }
  return urlKeys
}
