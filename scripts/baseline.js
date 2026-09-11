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
import { similarity } from "./checks.js";

// The model never writes the same sentence twice, so a literal diff marks
// everything changed on every run. Pair each item with its closest match in
// the baseline: a close match is the same item reworded, and only items with
// no match at all are genuinely new or gone.
const SAME = 0.6;

function pairUp(before, after) {
  const unmatched = [...before];
  const added = [], reworded = [];
  for (const item of after) {
    let best = -1, bestScore = 0;
    for (let i = 0; i < unmatched.length; i++) {
      const score = item === unmatched[i] ? 1 : similarity(item, unmatched[i]);
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (bestScore >= SAME) {
      if (unmatched[best] !== item) reworded.push([unmatched[best], item]);
      unmatched.splice(best, 1);
    } else {
      added.push(item);
    }
  }
  return { added, removed: unmatched, reworded };
}

const BASELINE = "runs/baseline.md";
const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const [cmd, arg] = args.filter(a => a !== "--verbose");

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
  let rewordCount = 0;
  for (const [key, label] of GROUPS) {
    const { added, removed, reworded } = pairUp(before[file][key], after[file][key]);
    rewordCount += reworded.length;
    if (removed.length || added.length) deltas.push({ label, removed, added });
  }

  if (!deltas.length) {
    unchanged++;
    if (rewordCount && verbose) console.log(`same      ${file}  (${rewordCount} reworded)`);
    continue;
  }

  changed++;
  console.log(`CHANGED   ${file}${rewordCount ? `  (+${rewordCount} reworded)` : ""}`);
  for (const d of deltas) {
    console.log(`  ${d.label}`);
    for (const r of d.removed) console.log(`    - ${r}`);
    for (const a of d.added)   console.log(`    + ${a}`);
  }
  console.log();
}

// A filtered run (--core, or a substring) legitimately contains fewer samples
// than the baseline. That is not a deletion, so it collapses to a count.
const missing = Object.keys(before).filter(f => !after[f]);

console.log(`${changed} changed, ${unchanged} unchanged${appeared ? `, ${appeared} new` : ""}`);
if (missing.length) console.log(`${missing.length} baseline sample(s) not in this run - filtered run, not a deletion`);
console.log();
