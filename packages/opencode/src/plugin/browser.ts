import type { Plugin } from "@opencode-ai/plugin"

const browserSpeedGuidance = `When using browser automation, optimize for speed:
- Prefer direct URL navigation over click-through flows when the destination is known.
- Reuse the current tab and page state instead of repeating navigation.
- Minimize snapshots, screenshots, and waits; use them only after a page change or when visual confirmation is required.
- Prefer targeted extraction or direct actions over broad inspection.
- Finish the task in the fewest browser actions that still preserve correctness.`

const browserCompactionContext = `## Browser Automation Context

Browser tools were used in this session. When resuming:
- Assume the current browser tab may still be useful.
- Check browser state once, then reuse it instead of repeating navigation.
- Prefer direct navigation, extraction, and targeted actions over repeated snapshots or screenshots.
- Use waits only when the page is still loading or an interaction has not settled yet.`

const browserToolHints = [
  { suffixes: ["_browser_navigate", "_navigate"], hint: "Prefer this when you already know the destination URL." },
  { suffixes: ["_browser_snapshot", "_snapshot"], hint: "Relatively expensive. Reuse the latest snapshot unless the page changed." },
  { suffixes: ["_browser_screenshot", "_screenshot"], hint: "Use only when the user needs visual confirmation." },
  { suffixes: ["_browser_wait", "_wait"], hint: "Use only when content is still loading or interaction has not settled." },
]

export const BrowserPlugin: Plugin = async () => {
  const browserSessions = new Set<string>()

  const appendSection = (base: string, section: string): string => {
    const trimmed = section.trim()
    if (!trimmed) return base
    if (base.includes(trimmed)) return base
    return base ? `${base.trimEnd()}\n\n${trimmed}` : trimmed
  }

  const getToolHint = (toolID: string): string => {
    for (const { suffixes, hint } of browserToolHints) {
      if (suffixes.some((s) => toolID.endsWith(s))) return hint
    }
    return "Prefer the smallest action that advances the task."
  }

  return {
    "experimental.chat.system.transform": async (_input, output) => {
      if (!output.system.includes(browserSpeedGuidance)) {
        output.system.push(browserSpeedGuidance)
      }
    },

    "tool.definition": async (input, output) => {
      if (!input.toolID.startsWith("browser_")) return
      output.description = appendSection(output.description, `Hint: ${getToolHint(input.toolID)}`)
    },

    "experimental.session.compacting": async (input, output) => {
      if (browserSessions.has(input.sessionID)) {
        output.context.push(browserCompactionContext)
      }
    },

    event: async ({ event }) => {
      const sessionID = (event as { sessionID?: string }).sessionID
      if (!sessionID) return

      if (event.type === "session.deleted") {
        browserSessions.delete(sessionID)
      }
    },
  }
}

export default BrowserPlugin