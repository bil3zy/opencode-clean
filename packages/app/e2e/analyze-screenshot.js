#!/usr/bin/env node

// e2e/analyze-screenshot.ts
var {spawn} = (() => ({}));
var {readFileSync} = (() => ({}));
var SYSTEM_PROMPT = `You are a UI/UX expert analyzing screenshots from e2e tests. Your job is to carefully examine the image and identify any visual issues, bugs, or problems.

Look for:
- Visual artifacts or rendering issues
- Alignment or spacing problems
- Color or contrast issues
- Missing or cut-off elements
- Incorrect layouts
- Blurriness or low-quality rendering
- Any UI elements that look wrong or broken

Respond with ONLY a JSON object in this exact format (no markdown, no code blocks):
{"hasIssues": boolean, "issues": ["issue 1", "issue 2"], "summary": "brief summary of what you see"}

If you see NO issues, respond with:
{"hasIssues": false, "issues": [], "summary": "The UI looks correct with no visible issues."}

If you find issues, list each one specifically in the issues array and provide a brief summary.
`;
async function analyzeWithOpenCode(imagePath) {
  return new Promise((resolve, reject) => {
    const prompt = `${SYSTEM_PROMPT}

Image to analyze: ${imagePath}

Analyze this image now and respond with only the JSON object.`;
    const proc = spawn("opencode", ["run", prompt, "--model", "minimax/MiniMax-M2.7", "--pure"], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120000
    });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });
    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0 && stderr) {
        console.error("OpenCode stderr:", stderr);
      }
      resolve(stdout);
    });
    proc.on("error", (err) => {
      reject(err);
    });
    setTimeout(() => {
      proc.kill();
      reject(new Error("Timeout after 120 seconds"));
    }, 120000);
  });
}
function parseOutput(output) {
  const jsonMatch = output.match(/\{[\s\S]*"hasIssues"[\s\S]*\}/);
  if (!jsonMatch) {
    const anyJsonMatch = output.match(/\{[\s\S]*\}\s*$/);
    if (anyJsonMatch) {
      try {
        const parsed = JSON.parse(anyJsonMatch[0]);
        return {
          hasIssues: parsed.hasIssues ?? false,
          issues: Array.isArray(parsed.issues) ? parsed.issues : [],
          summary: parsed.summary ?? "No summary provided",
          rawOutput: output
        };
      } catch {}
    }
    if (output.toLowerCase().includes("no issues")) {
      return {
        hasIssues: false,
        issues: [],
        summary: "The UI looks correct with no visible issues.",
        rawOutput: output
      };
    }
    const hasIssuesIndicator = output.toLowerCase().includes("issue") || output.toLowerCase().includes("bug") || output.toLowerCase().includes("problem") || output.toLowerCase().includes("wrong") || output.toLowerCase().includes("incorrect");
    return {
      hasIssues: hasIssuesIndicator,
      issues: hasIssuesIndicator ? ["Unknown issue - could not parse response"] : [],
      summary: output.slice(0, 500),
      rawOutput: output
    };
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      hasIssues: parsed.hasIssues ?? false,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      summary: parsed.summary ?? "No summary provided",
      rawOutput: output
    };
  } catch (err) {
    return {
      hasIssues: false,
      issues: [],
      summary: `Failed to parse response: ${err instanceof Error ? err.message : String(err)}`,
      rawOutput: output
    };
  }
}
async function main() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error("Usage: analyze-screenshot <path-to-image>");
    process.exit(1);
  }
  try {
    readFileSync(imagePath);
  } catch {
    console.error(`Error: File not found: ${imagePath}`);
    process.exit(1);
  }
  console.error(`Analyzing image: ${imagePath}`);
  try {
    const output = await analyzeWithOpenCode(imagePath);
    const result = parseOutput(output);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.hasIssues ? 1 : 0);
  } catch (err) {
    console.error(`Error analyzing image: ${err instanceof Error ? err.message : String(err)}`);
    const errorResult = {
      hasIssues: true,
      issues: [`Analysis failed: ${err instanceof Error ? err.message : String(err)}`],
      summary: "Failed to analyze image",
      rawOutput: ""
    };
    console.log(JSON.stringify(errorResult, null, 2));
    process.exit(1);
  }
}
main();
