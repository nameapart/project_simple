// Runs the prompt against every sample, checks the output automatically,
// and writes runs/<timestamp>.md so prompt versions can be diffed.
//
//   node --env-file=.env.local scripts/test-all.js           every sample (~$1.20)
//   node --env-file=.env.local scripts/test-all.js --core    one per input class (~$0.35)
//   node --env-file=.env.local scripts/test-all.js soc2015   only samples matching "soc2015"
//
// Exits non-zero if anything FAILs, so it can gate a commit later.

import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { SYSTEM_PROMPT } from "../lib/prompt.js";
import { runChecks } from "./checks.js";

const Schema = z.object({
  work: z.array(z.string()),
  legwork: z.array(z.string()),
  rules: z.array(z.string()),
  unclear: z.array(z.string())
});

const client = new Anthropic();
const expectations = JSON.parse(fs.readFileSync("samples/expectations.json", "utf8"));

const arg = process.argv[2];
const coreOnly = arg === "--core";
const filter = coreOnly ? null : arg;

const files = fs.readdirSync("samples")
  .filter(f => f.endsWith(".txt"))
  .filter(f => !coreOnly || expectations[f]?.suite === "core")
  .filter(f => !filter || f.includes(filter))
  .sort();

if (!files.length) { console.error(`no samples match "${filter}"`); process.exit(1); }
console.log(`\nrunning ${files.length} sample(s) in parallel...\n`);

const results = await Promise.all(files.map(async (file) => {
  const source = fs.readFileSync(path.join("samples", file), "utf8");
  const res = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: source }],
    output_config: { format: zodOutputFormat(Schema) }
  });
  const out = res.parsed_output;
  const issues = runChecks(source, out, expectations[file] || {});
  return { file, source, out, usage: res.usage, issues };
}));

const pad = (s, n) => String(s).padEnd(n);
console.log("(chars = visible output. out tok includes invisible thinking tokens.)\n");
console.log(pad("sample", 34) + pad("work", 6) + pad("leg", 5) + pad("rules", 7) +
            pad("uncl", 6) + pad("chars", 8) + pad("cost", 9) + "checks");
console.log("-".repeat(92));

let total = 0, anyFail = false;
for (const r of results) {
  const cost = (r.usage.input_tokens / 1e6) * 5 + (r.usage.output_tokens / 1e6) * 25;
  total += cost;
  const fails = r.issues.filter(i => i.level === "FAIL").length;
  const warns = r.issues.length - fails;
  if (fails) anyFail = true;
  const status = fails ? `${fails} FAIL` + (warns ? `, ${warns} warn` : "")
               : warns ? `${warns} warn` : "pass";
  const chars = [...r.out.work, ...r.out.legwork, ...r.out.rules, ...r.out.unclear].join(" ").length;
  console.log(
    pad(r.file.replace(".txt", ""), 34) +
    pad(r.out.work.length, 6) + pad(r.out.legwork.length, 5) +
    pad(r.out.rules.length, 7) + pad(r.out.unclear.length, 6) +
    pad(chars, 8) + pad("$" + cost.toFixed(4), 9) + status
  );
}
console.log("-".repeat(92));
console.log(pad("total", 66) + pad("$" + total.toFixed(4), 9) + (anyFail ? "NOT CLEAN" : "clean"));

// Detail for anything that tripped
for (const r of results) {
  if (!r.issues.length) continue;
  console.log(`\n${r.file}`);
  for (const i of r.issues) console.log(`  ${pad(i.level, 6)}${pad(i.name, 22)}${i.detail}`);
}

fs.mkdirSync("runs", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outPath = `runs/${stamp}.md`;

let md = `# run ${stamp}\n\nprompt: ${SYSTEM_PROMPT.split(/\s+/).length} words\n`;
for (const r of results) {
  md += `\n## ${r.file}\n`;
  if (r.issues.length) {
    md += `\n**checks:** ` + r.issues.map(i => `${i.level} ${i.name} (${i.detail})`).join("; ") + "\n";
  } else {
    md += `\n**checks:** pass\n`;
  }
  for (const [label, key] of [["THE WORK", "work"], ["THE LEGWORK", "legwork"], ["THE RULES", "rules"], ["UNCLEAR", "unclear"]]) {
    md += `\n### ${label}\n`;
    md += r.out[key].length ? r.out[key].map(i => `- ${i}`).join("\n") + "\n" : "_(none)_\n";
  }
}
fs.writeFileSync(outPath, md);

console.log(`\nfull output -> ${outPath}`);
console.log(`compare:      diff runs/<older>.md ${outPath}\n`);
process.exit(anyFail ? 1 : 0);
