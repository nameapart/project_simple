// ============================================================
// THE BACKEND
//
// One file. It exists for exactly one reason: to hold the API
// key somewhere the browser can't see it.
//
// On Vercel, every file in /api becomes a live URL. This file
// is at api/analyze.js, so it answers requests to /api/analyze.
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { SYSTEM_PROMPT } from "../lib/prompt.js";

// No key written here. The SDK reads ANTHROPIC_API_KEY from the
// environment by itself - from .env.local when running locally,
// from Vercel's settings once deployed. The code never changes.
const client = new Anthropic();

// The shape we demand back. Not a suggestion - the API enforces it.
const BreakdownSchema = z.object({
  work: z.array(z.string()),
  legwork: z.array(z.string()),
  rules: z.array(z.string()),
  unclear: z.array(z.string())
});

export default async function handler(req, res) {
  // This endpoint only accepts POST. Someone visiting the URL in a
  // browser sends a GET, and gets told no rather than burning a
  // request on nothing.
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text } = req.body ?? {};

  // Guard before spending money. Every request past this line costs
  // real credit, so junk gets rejected here, not by the API.
  if (typeof text !== "string" || text.trim().length < 40) {
    return res.status(400).json({
      error: "That's not enough text to work with. Paste the full assignment."
    });
  }

  if (text.length > 50000) {
    return res.status(400).json({
      error: "That's very long. Try pasting just the assignment section."
    });
  }

  try {
    // messages.parse() instead of messages.create(): it sends the schema
    // along with the request, so the model is constrained to return
    // exactly that shape. No JSON.parse, no stripping ```json fences,
    // no "sometimes it adds a sentence before the JSON."
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
      output_config: { format: zodOutputFormat(BreakdownSchema) }
    });

    // parsed_output is null if the model declined or the shape failed.
    if (!response.parsed_output) {
      return res.status(502).json({
        error: "The AI couldn't process that. Try again, or try different text."
      });
    }

    return res.status(200).json(response.parsed_output);

  } catch (error) {
    // The real error goes to the server log, where only you can see it.
    // The browser gets something vague on purpose - error messages leak
    // information about your setup to anyone poking at the endpoint.
    console.error("analyze failed:", error);

    if (error instanceof Anthropic.AuthenticationError) {
      return res.status(500).json({ error: "Server configuration problem." });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: "Too many requests. Wait a moment." });
    }
    return res.status(500).json({ error: "Something went wrong. Try again." });
  }
}
