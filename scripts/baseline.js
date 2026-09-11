// A blessed baseline: the last run you actually read and accepted.
//
// The checks catch mechanical regressions. They cannot tell you whether a
// breakdown is any good - only reading it can, and 25 outputs is too many to
// read every time. So read the DELTA instead.
//
//   node scripts/baseline.js bless          accept the latest run as the baseline
//   node scripts/baseline.js bless runs/X   accept a specific run
//   node scripts/baseline.js diff           what changed since the baseline
//   node scripts/baseline.js diff runs/X    compare a specific run
//
// Free - no API calls.

import fs from "fs";
import { parseRun, latestRun } from "./parse-run.js";

const BASELINE = "runs/baseline.md";
const [cmd, arg] = process.argv.slice(2);

if (cmd === "bless") {
  const src = arg || latestRun();
  fs.copyFileSync(src, BASELINE);
  console.log(`\nblessed ${src} as the baseline.`);
  console.log(`future runs diff against this until you bless another.\n`);
  process.exit(0);
}

if (cmd !== "diff") {
  console.error("usage: node scripts/baseline.js [bless|diff] [run-file]");
  process.exit(1);
}

if (!fs.existsSync(BASELINE)) {
  console.error(`no baseline yet. run:  node scripts/baseline.js bless`);
  process.exit(1);
}

const target = arg || latestRun();
const before = Object.fromEntries(parseRun(BASELINE).map(s => [s.file, s.out]));
const after = Object.fromEntries(parseRun(target).map(s => [s.file, s.out]));

console.log(`\nbaseline  ${BASELINE}`);
console.log(`against   ${target}\n`);

const GROUPS = [["work", "THE WORK"], ["legwork", "THE LEGWORK"], ["rules", "THE RULES"], ["unclear", "UNCLEAR"]];
let changed = 0, unchanged = 0, appeared = 0;

for (const file of Object.keys(after)) {
  if (!before[file]) {
    console.log(`NEW       ${file}`);
    appeared++;
    continue;
  }
  const deltas = [];
  for (const [key, label] of GROUPS) {
    const b = new Set(before[file][key]);
    const a = new Set(after[file][key]);
    const removed = [...b].filter(x => !a.has(x));
    const added = [...a].filter(x => !b.has(x));
    if (removed.length || added.length) deltas.push({ label, removed, added });
  }
  if (!deltas.length) { unchanged++; continue; }

  changed++;
  console.log(`CHANGED   ${file}`);
  for (const d of deltas) {
    console.log(`  ${d.label}`);
    for (const r of d.removed) console.log(`    - ${r}`);
    for (const a of d.added)   console.log(`    + ${a}`);
  }
  console.log();
}

for (const file of Object.keys(before)) {
  if (!after[file]) console.log(`GONE      ${file}`);
}

console.log(`${changed} changed, ${unchanged} unchanged${appeared ? `, ${appeared} new` : ""}\n`);
