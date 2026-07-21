declare module "cloudflare:workers" {
  export abstract class WorkerEntrypoint<
    Env = Cloudflare.Env,
    Props = unknown,
  > {
    protected ctx: unknown
    protected env: Env
    constructor(ctx: unknown, env: Env)
  }
}
