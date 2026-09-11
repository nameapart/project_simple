// Re-runs the checks against a SAVED run. No API calls, no cost.
//
// Use this whenever you change checks.js rather than the prompt: the model's
// output would be identical, so paying to regenerate it is waste.
//
//   node scripts/recheck.js                    the most recent run
//   node scripts/recheck.js runs/2026-...md    a specific run

import fs from "fs";
import path from "path";
import { runChecks } from "./checks.js";

const LABELS = { "THE WORK": "work", "THE LEGWORK": "legwork", "THE RULES": "rules", "UNCLEAR": "unclear" };

const file = process.argv[2] ||
  "runs/" + fs.readdirSync("runs").filter(f => f.endsWith(".md")).sort().pop();

const expectations = JSON.parse(fs.readFileSync("samples/expectations.json", "utf8"));

// Walk the saved markdown back into the structure the checks expect.
const samples = [];
let current = null, group = null;
for (const line of fs.readFileSync(file, "utf8").split("\n")) {
  const sample = line.match(/^## (.+\.txt)$/);
  const heading = line.match(/^### (.+)$/);
  if (sample) {
    current = { file: sample[1], out: { work: [], legwork: [], rules: [], unclear: [] } };
    samples.push(current);
    group = null;
  } else if (heading && current) {
    group = LABELS[heading[1].trim()] || null;
  } else if (line.startsWith("- ") && current && group) {
    current.out[group].push(line.slice(2).trim());
  }
}

console.log(`\nrechecking ${file}  (${samples.length} samples, no API calls)\n`);

const pad = (s, n) => String(s).padEnd(n);
let fails = 0, warns = 0;

for (const s of samples) {
  const sourcePath = path.join("samples", s.file);
  if (!fs.existsSync(sourcePath)) { console.log(`  ${s.file}: source missing, skipped`); continue; }
  const source = fs.readFileSync(sourcePath, "utf8");
  const issues = runChecks(source, s.out, expectations[s.file] || {});
  const f = issues.filter(i => i.level === "FAIL").length;
  fails += f; warns += issues.length - f;
  console.log(pad(s.file.replace(".txt", ""), 34) + (issues.length ? `${f} FAIL, ${issues.length - f} warn` : "pass"));
  for (const i of issues) console.log(`  ${pad(i.level, 6)}${pad(i.name, 22)}${i.detail}`);
}

console.log(`\n${fails} FAIL, ${warns} warn\n`);
process.exit(fails ? 1 : 0);
