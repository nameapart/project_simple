// Runs the prompt against EVERY sample at once and prints a comparison table.
// Writes full output to runs/<timestamp>.md so you can diff prompt versions.
//
//   node --env-file=.env.local scripts/test-all.js
//   diff runs/<older>.md runs/<newer>.md

import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { SYSTEM_PROMPT } from "../lib/prompt.js";

const Schema = z.object({
  work: z.array(z.string()),
  legwork: z.array(z.string()),
  rules: z.array(z.string()),
  unclear: z.array(z.string())
});

const client = new Anthropic();
const files = fs.readdirSync("samples").filter(f => f.endsWith(".txt")).sort();

console.log(`\nrunning ${files.length} samples in parallel...\n`);

// Parallel, not sequential - these don't depend on each other, so waiting
// for one before starting the next just wastes your time.
const results = await Promise.all(files.map(async (file) => {
  const text = fs.readFileSync(path.join("samples", file), "utf8");
  const res = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: text }],
    output_config: { format: zodOutputFormat(Schema) }
  });
  return { file, out: res.parsed_output, usage: res.usage };
}));

const pad = (s, n) => String(s).padEnd(n);
console.log("(chars = visible output. out tok includes invisible thinking tokens.)\n");
console.log(pad("sample", 34) + pad("work", 6) + pad("leg", 5) + pad("rules", 7) + pad("uncl", 6) + pad("chars", 8) + pad("out tok", 9) + "cost");
console.log("-".repeat(84));

let total = 0;
for (const r of results) {
  const cost = (r.usage.input_tokens / 1e6) * 5 + (r.usage.output_tokens / 1e6) * 25;
  total += cost;
  console.log(
    pad(r.file.replace(".txt", ""), 34) +
    pad(r.out.work.length, 6) + pad(r.out.legwork.length, 5) +
    pad(r.out.rules.length, 7) + pad(r.out.unclear.length, 6) +
    pad([...r.out.work, ...r.out.legwork, ...r.out.rules, ...r.out.unclear].join(" ").length, 8) + pad(r.usage.output_tokens, 9) + "$" + cost.toFixed(4)
  );
}
console.log("-".repeat(76));
console.log(pad("total", 75) + "$" + total.toFixed(4));

fs.mkdirSync("runs", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outPath = `runs/${stamp}.md`;

let md = `# run ${stamp}\n\nprompt: ${SYSTEM_PROMPT.split(/\s+/).length} words\n`;
for (const r of results) {
  md += `\n## ${r.file}\n`;
  for (const [label, key] of [["THE WORK", "work"], ["THE LEGWORK", "legwork"], ["THE RULES", "rules"], ["UNCLEAR", "unclear"]]) {
    md += `\n### ${label}\n`;
    md += r.out[key].length ? r.out[key].map(i => `- ${i}`).join("\n") + "\n" : "_(none)_\n";
  }
}
fs.writeFileSync(outPath, md);

console.log(`\nfull output -> ${outPath}`);
console.log(`compare:      diff runs/<older>.md ${outPath}\n`);
