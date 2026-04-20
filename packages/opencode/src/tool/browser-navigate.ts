import z from "zod"
import { Effect } from "effect"
import { Tool } from "./tool"
import { BrowserPool } from "./browser-pool"
import { SessionID } from "../session/schema"

const Parameters = z.object({
  url: z.string().describe("URL to navigate to"),
  sessionID: z.string().optional().describe("Session ID for context (defaults to tool context)"),
})

export const BrowserNavigateTool = Tool.define(
  "browser_navigate",
  Effect.gen(function* () {
    const pool = yield* BrowserPool.Service

    return {
      description: "Navigate to a URL in the browser. Prefer this over click-through navigation when the destination URL is known.",
      parameters: Parameters,
      execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const sessionID = params.sessionID ?? ctx.sessionID
          const context = yield* pool.createContext(sessionID)
          const page = yield* Effect.promise(() => context.newPage())
          
          yield* Effect.promise(() => page.goto(params.url, { waitUntil: "domcontentloaded" }))
          
          const title = yield* Effect.promise(() => page.title())
          
          return {
            output: `Navigated to ${params.url}\nTitle: ${title}`,
            title: `Navigate: ${params.url}`,
            metadata: { url: params.url, title },
          }
        }),
    }
  }),
)