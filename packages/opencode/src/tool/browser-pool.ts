import { chromium, type Browser, type BrowserContext } from "playwright"
import { Effect, Layer, Context } from "effect"
import { Log } from "../util/log"

export namespace BrowserPool {
  const log = Log.create({ service: "browser-pool" })

  type State = {
    browser: Browser | null
    contexts: Map<string, BrowserContext>
  }

  export interface Interface {
    readonly getBrowser: () => Effect.Effect<Browser>
    readonly createContext: (sessionID: string) => Effect.Effect<BrowserContext>
    readonly closeContext: (sessionID: string) => Effect.Effect<void>
    readonly closeAll: () => Effect.Effect<void>
  }

  export class Service extends Context.Service<Service, Interface>()("@opencode/BrowserPool") {}

  let browserRef: Browser | null = null
  let shutdownRegistered = false

  const shutdown = () => {
    log.info("browser pool shutting down")
    if (browserRef) {
      browserRef.close().catch(() => {})
      browserRef = null
    }
  }

  if (!shutdownRegistered) {
    shutdownRegistered = true
    process.on("SIGINT", shutdown)
    process.on("SIGTERM", shutdown)
    process.on("uncaughtException", shutdown)
    process.on("unhandledRejection", shutdown)
  }

  export const layer: Layer.Layer<Service, never> = Layer.effect(
    Service,
    Effect.gen(function* () {
      const contexts = new Map<string, BrowserContext>()

      const getBrowser = Effect.fn("BrowserPool.getBrowser")(function* () {
        if (!browserRef || !browserRef.isConnected()) {
          log.info("launching browser")
          browserRef = yield* Effect.promise(() =>
            chromium.launch({ headless: true }),
          )
        }
        return browserRef
      })

      const createContext = Effect.fn("BrowserPool.createContext")(function* (sessionID: string) {
        const br = yield* getBrowser()
        let ctx = contexts.get(sessionID)
        // @ts-expect-error browser() API varies by playwright version
        if (ctx && "browser" in ctx && ctx.browser() && !ctx.browser().isClosed()) {
          return ctx
        }
        log.info("creating context", { sessionID })
        ctx = yield* Effect.promise(() => br.newContext())
        contexts.set(sessionID, ctx)
        return ctx
      })

      const closeContext = Effect.fn("BrowserPool.closeContext")(function* (sessionID: string) {
        const ctx = contexts.get(sessionID)
        if (ctx) {
          log.info("closing context", { sessionID })
          yield* Effect.promise(() => ctx.close())
          contexts.delete(sessionID)
        }
      })

      const closeAll = Effect.fn("BrowserPool.closeAll")(function* () {
        log.info("closing all contexts")
        yield* Effect.forEach(contexts.values(), (ctx) => Effect.promise(() => ctx.close()), { concurrency: "unbounded" })
        contexts.clear()
        if (browserRef) {
          yield* Effect.promise(() => browserRef!.close())
          browserRef = null
        }
      })

      return Service.of({ getBrowser, createContext, closeContext, closeAll })
    }),
  )

  export const defaultLayer = layer
}