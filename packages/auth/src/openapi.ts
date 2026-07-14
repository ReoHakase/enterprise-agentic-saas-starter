import { auth } from "./index"

export type AuthOpenApiSchema = Awaited<
  ReturnType<typeof auth.api.generateOpenAPISchema>
>

/**
 * Better Authの実際のplugin構成とdisabledPathsからOpenAPIを生成する。
 * apps/apiはこのserver-only境界を通し、auth routeを手書きで複製しない。
 */
export const generateAuthOpenApiSchema = (): Promise<AuthOpenApiSchema> =>
  auth.api.generateOpenAPISchema()
