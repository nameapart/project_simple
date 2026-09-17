// ============================================================
// EVALUATION ENDPOINT
//
// Step two: given the goals already extracted from an assignment and
// the student's draft, decide which goals the draft addresses.
//
// Haiku rather than Opus, deliberately. This is coverage classification
// against a fixed list - not the open judgment that extraction needs -
// and it runs several times per session as the draft is revised.
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { VerdictSchema } from "../lib/schema.js";
import { EVAL_PROMPT } from "../lib/eval-prompt.js";

const client = new Anthropic();

const MAX_DRAFT = 60000;
const MIN_DRAFT = 200;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { goals, draft } = req.body ?? {};

  if (!Array.isArray(goals) || goals.length === 0) {
    return res.status(400).json({ error: "No goals to check against. Break down an assignment first." });
  }
  if (typeof draft !== "string" || draft.trim().length < MIN_DRAFT) {
    return res.status(400).json({ error: "Paste more of your draft - there isn't enough here to check." });
  }
  if (draft.length > MAX_DRAFT) {
    return res.status(400).json({ error: "That draft is very long. Try checking one section at a time." });
  }

  // The goals are identical on every recheck; only the draft changes, so
  // this is the right shape for caching. It does not currently engage:
  // measured at 719 tokens, which is under Haiku's minimum cacheable
  // prefix (cache_creation came back 0, so nothing was even written).
  // Left in place because it costs nothing and starts working if the
  // eval prompt grows - but it is not saving anything today, and it
  // would only be worth ~0.06c per recheck if it did. The caching that
  // matters is on /api/analyze, where the prompt is 3,362 Opus tokens.
  const goalList = goals.map((g, i) => `${i}. ${g}`).join("\n");

  try {
    const response = await client.messages.parse({
      model: "claude-haiku-4-5",
      max_tokens: 4000,
      system: [
        {
          type: "text",
          text: `${EVAL_PROMPT}\n\n## The goals\n\n${goalList}`,
          cache_control: { type: "ephemeral" }
        }
      ],
      messages: [{ role: "user", content: `Here is my draft:\n\n${draft}` }],
      output_config: { format: zodOutputFormat(VerdictSchema) }
    });

    const parsed = response.parsed_output;
    if (!parsed) {
      return res.status(502).json({ error: "Couldn't read the check results. Try again." });
    }

    // Index is how a verdict finds its goal, so anything out of range is
    // dropped rather than silently attached to the wrong one.
    const verdicts = parsed.verdicts.filter(v => v.index >= 0 && v.index < goals.length);

    return res.status(200).json({
      verdicts,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        cacheRead: response.usage.cache_read_input_tokens ?? 0,
        cacheWrite: response.usage.cache_creation_input_tokens ?? 0
      }
    });

  } catch (error) {
    console.error("check failed:", error);
    if (error instanceof Anthropic.AuthenticationError) {
      return res.status(500).json({ error: "Server configuration problem." });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: "Too many requests. Wait a moment." });
    }
    return res.status(500).json({ error: "Something went wrong. Try again." });
  }
}
