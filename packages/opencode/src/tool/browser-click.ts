import z from "zod"
import { Effect } from "effect"
import { Tool } from "./tool"
import { BrowserPool } from "./browser-pool"

const Parameters = z.object({
  selector: z.string().describe("CSS or text selector for the element to click"),
  sessionID: z.string().optional().describe("Session ID for context"),
  timeout: z.number().optional().describe("Timeout in milliseconds (default: 5000)"),
})

export const BrowserClickTool = Tool.define(
  "browser_click",
  // @ts-expect-error - browser tool metadata types need update
  Effect.gen(function* () {
    const pool = yield* BrowserPool.Service

    return {
      description: "Click an element on the page. Wait for the element to be visible before clicking.",
      parameters: Parameters,
      execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const sessionID = params.sessionID ?? ctx.sessionID
          const context = yield* pool.createContext(sessionID)
          const pages = context.pages()
          const page = pages[pages.length - 1]

          if (!page) {
            return { output: "No active page found", title: "Click failed", metadata: {} }
          }

          const timeout = params.timeout ?? 5000
          yield* Effect.promise(() =>
            page.waitForSelector(params.selector, { timeout, state: "visible" }),
          )

          yield* Effect.promise(() => page.click(params.selector))

          return {
            output: `Clicked element: ${params.selector}`,
            title: `Click: ${params.selector}`,
            metadata: { selector: params.selector },
          }
        }),
    }
  }),
)