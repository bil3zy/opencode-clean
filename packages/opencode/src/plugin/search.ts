import type { Plugin } from "@opencode-ai/plugin"

const searchSpeedGuidance = `When using search tools:
- Prefer direct URLs when the destination is known.
- Use category filters for targeted results.
- Minimizes repeated searches for the same query.
- Use "deep" search type for complex research.
- Combine search with browser verification for research tasks.`

const searchCompactionContext = `## Search Context

Search tools were used in this session. When resuming:
- Review previous search results before repeating the same query.
- Use browser verification (browser_snapshot) to validate sources.
- Combine search + browser for thorough research workflows.`

export const SearchPlugin: Plugin = async () => {
  return {
    "experimental.chat.system.transform": async (_input, output) => {
      if (!output.system.includes(searchSpeedGuidance)) {
        output.system.push(searchSpeedGuidance)
      }
    },

    "tool.definition": async (input, output) => {
      const hints: Record<string, string> = {
        searxng_search: "Privacy-respecting metasearch engine. Results from multiple engines.",
        research_websearch: "Combined search + browser verification. Good for deep research.",
        websearch: "Web search via Exa. Use for general discovery.",
      }

      const hint = hints[input.toolID]
      if (hint) {
        output.description = `${output.description}\n\nHint: ${hint}`
      }
    },

    "experimental.session.compacting": async (input, output) => {
      output.context.push(searchCompactionContext)
    },
  }
}

export default SearchPlugin