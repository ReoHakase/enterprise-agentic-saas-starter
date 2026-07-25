type FixtureEnvironment = {
  MESSAGE: string
}

export default {
  fetch(_request, environment) {
    return Response.json({ message: environment.MESSAGE })
  },
} satisfies ExportedHandler<FixtureEnvironment>

// @ts-expect-error Node globals must not leak into the Worker config.
process.cwd()
