import z from "zod"
import { Effect } from "effect"
import { Tool } from "./tool"
import { BrowserPool } from "./browser-pool"

const Parameters = z.object({
  selector: z.string().optional().describe("Selector to wait for (if not provided, waits for fixed duration)"),
  timeout: z.number().optional().describe("Timeout in milliseconds (default: 5000)"),
  state: z.enum(["visible", "hidden", "attached"]).optional().describe("Element state (default: visible)"),
  duration: z.number().optional().describe("Fixed duration to wait in milliseconds"),
  sessionID: z.string().optional().describe("Session ID for context"),
})

export const BrowserWaitTool = Tool.define(
  "browser_wait",
  // @ts-expect-error - browser tool metadata types need update
  Effect.gen(function* () {
    const pool = yield* BrowserPool.Service

    return {
      description: "Wait for an element or for a fixed duration. Use sparingly - prefer action-based waiting over fixed delays.",
      parameters: Parameters,
      execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const sessionID = params.sessionID ?? ctx.sessionID
          const context = yield* pool.createContext(sessionID)
          const pages = context.pages()
          const page = pages[pages.length - 1]

          if (!page) {
            return { output: "No active page found", title: "Wait failed", metadata: {} }
          }

          if (params.selector) {
            const timeout = params.timeout ?? 5000
            const state = params.state ?? "visible"
            yield* Effect.promise(() =>
              page.waitForSelector(params.selector!, { timeout, state }),
            )
            return {
              output: `Element appeared: ${params.selector}`,
              title: `Wait: ${params.selector}`,
              metadata: { selector: params.selector },
            }
          } else if (params.duration) {
            yield* Effect.sleep(params.duration)
            return {
              output: `Waited ${params.duration}ms`,
              title: `Wait: ${params.duration}ms`,
              metadata: { duration: params.duration },
            }
          }

          return { output: "No selector or duration specified", title: "Wait", metadata: {} }
        }),
    }
  }),
)