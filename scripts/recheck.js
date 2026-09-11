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
import { parseRun, latestRun } from "./parse-run.js";

const file = process.argv[2] || latestRun();

const expectations = JSON.parse(fs.readFileSync("samples/expectations.json", "utf8"));

const samples = parseRun(file);

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
