const searchParams = new URLSearchParams()

export const usePathname = () => "/dashboard"
export const useSearchParams = () => searchParams
export const useParams = () => ({})
export const useRouter = () => ({
  back: () => undefined,
  forward: () => undefined,
  prefetch: async () => undefined,
  push: () => undefined,
  refresh: () => undefined,
  replace: () => undefined,
})
