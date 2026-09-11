// Runs the prompt against a text file and prints the result.
// No Vercel, no browser, no frontend. Just: does the prompt work?
//
//   node --env-file=.env.local scripts/test-prompt.js
//   node --env-file=.env.local scripts/test-prompt.js path/to/your-own.txt

import fs from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { SYSTEM_PROMPT } from "../lib/prompt.js";

const file = process.argv[2] || "samples/messy-assignment.txt";
const text = fs.readFileSync(file, "utf8");

const BreakdownSchema = z.object({
  work: z.array(z.string()),
  legwork: z.array(z.string()),
  rules: z.array(z.string()),
  unclear: z.array(z.string())
});

console.log(`\nreading: ${file}  (${text.length} chars)\nthinking...\n`);

const response = await new Anthropic().messages.parse({
  model: "claude-opus-5",
  max_tokens: 16000,
  system: SYSTEM_PROMPT,
  messages: [{ role: "user", content: text }],
  output_config: { format: zodOutputFormat(BreakdownSchema) }
});

const out = response.parsed_output;

for (const [heading, items] of [
  ["THE WORK", out.work],
  ["THE LEGWORK", out.legwork],
  ["THE RULES", out.rules],
  ["UNCLEAR", out.unclear]
]) {
  console.log(`\n${heading}`);
  console.log("-".repeat(heading.length));
  if (items.length === 0) console.log("  (none)");
  items.forEach((item, i) => console.log(`  ${i + 1}. ${item}`));
}

const u = response.usage;
const cost = (u.input_tokens / 1e6) * 5 + (u.output_tokens / 1e6) * 25;
console.log(`\n---\n${u.input_tokens} in / ${u.output_tokens} out - about $${cost.toFixed(4)}\n`);
