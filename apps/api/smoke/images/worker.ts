import {
  IMAGES_SMOKE_HEALTH_ROUTE,
  IMAGES_SMOKE_INPUT_CONTENT_TYPES,
  IMAGES_SMOKE_MAX_INPUT_BYTES,
  IMAGES_SMOKE_OUTPUT,
  IMAGES_SMOKE_ROUTE,
  IMAGES_SMOKE_TRANSFORM,
  readBearerToken,
  verifySmokeToken,
} from "./protocol"

const responseHeaders = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'",
  "Cross-Origin-Resource-Policy": "same-site",
  "X-Content-Type-Options": "nosniff",
} as const

const errorResponse = (status: number, code: string): Response =>
  Response.json(
    { error: code },
    {
      status,
      headers: responseHeaders,
    }
  )

const unauthorizedResponse = (): Response => {
  const response = errorResponse(401, "UNAUTHORIZED")
  response.headers.set("WWW-Authenticate", "Bearer")
  return response
}

export type ImagesSmokeBinding = {
  input(stream: ReadableStream<Uint8Array>): {
    transform(options: typeof IMAGES_SMOKE_TRANSFORM): {
      output(options: typeof IMAGES_SMOKE_OUTPUT): Promise<{
        response(): Response
      }>
    }
  }
}

type ImagesSmokeRequestEnv = {
  IMAGES: ImagesSmokeBinding
  SMOKE_TOKEN: string
}

const transformImage = async (
  request: Request,
  images: ImagesSmokeBinding
): Promise<Response> => {
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0]
  if (!contentType || !IMAGES_SMOKE_INPUT_CONTENT_TYPES.has(contentType)) {
    return errorResponse(415, "UNSUPPORTED_MEDIA_TYPE")
  }

  const contentLengthHeader = request.headers.get("Content-Length")
  const contentLength =
    contentLengthHeader === null ? null : Number(contentLengthHeader)
  if (
    contentLength !== null &&
    (!Number.isSafeInteger(contentLength) ||
      contentLength <= 0 ||
      contentLength > IMAGES_SMOKE_MAX_INPUT_BYTES)
  ) {
    return errorResponse(413, "INVALID_INPUT_SIZE")
  }
  if (!request.body) return errorResponse(400, "MISSING_IMAGE")

  try {
    const transformed = await images
      .input(request.body)
      .transform(IMAGES_SMOKE_TRANSFORM)
      .output(IMAGES_SMOKE_OUTPUT)
    const providerResponse = transformed.response()

    return new Response(providerResponse.body, {
      status: providerResponse.status,
      headers: {
        ...responseHeaders,
        "Content-Type": "image/webp",
      },
    })
  } catch {
    return errorResponse(502, "IMAGE_TRANSFORMATION_FAILED")
  }
}

export const handleImagesSmokeRequest = async (
  request: Request,
  env: ImagesSmokeRequestEnv
): Promise<Response> => {
  const url = new URL(request.url)
  if (
    url.pathname !== IMAGES_SMOKE_HEALTH_ROUTE &&
    url.pathname !== IMAGES_SMOKE_ROUTE
  ) {
    return errorResponse(404, "NOT_FOUND")
  }

  if (env.SMOKE_TOKEN.length < 32) {
    return errorResponse(503, "SMOKE_TOKEN_NOT_CONFIGURED")
  }

  const authorized = await verifySmokeToken(
    readBearerToken(request.headers.get("Authorization")),
    env.SMOKE_TOKEN
  )
  if (!authorized) return unauthorizedResponse()

  if (url.pathname === IMAGES_SMOKE_HEALTH_ROUTE) {
    return request.method === "GET"
      ? new Response(null, { status: 204, headers: responseHeaders })
      : errorResponse(405, "METHOD_NOT_ALLOWED")
  }

  return request.method === "POST"
    ? transformImage(request, env.IMAGES)
    : errorResponse(405, "METHOD_NOT_ALLOWED")
}

export default {
  fetch: handleImagesSmokeRequest,
} satisfies ExportedHandler<ImagesSmokeEnv>
