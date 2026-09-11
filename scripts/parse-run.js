// Reads a saved runs/*.md back into the structure the checks and the
// baseline diff both expect. Shared so there is exactly one copy of the
// format knowledge.

import fs from "fs";

const LABELS = {
  "THE WORK": "work",
  "THE LEGWORK": "legwork",
  "THE RULES": "rules",
  "UNCLEAR": "unclear"
};

export function parseRun(file) {
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
  return samples;
}

export function latestRun() {
  const runs = fs.readdirSync("runs").filter(f => f.endsWith(".md") && f !== "baseline.md").sort();
  if (!runs.length) throw new Error("no runs found");
  return "runs/" + runs[runs.length - 1];
}
