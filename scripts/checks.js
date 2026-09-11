// ============================================================
// AUTOMATED CHECKS
//
// Every check here exists because we broke it at least once.
// They run on text we already have - no API calls, no cost.
//
// FAIL = a real defect. WARN = heuristic, look at it yourself.
// ============================================================

const NUM_WORDS = {
  one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10,
  eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, twenty:20,
  thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90, hundred:100
};

// Turn "three citations" into "3 citations" so we compare like with like.
// The model reliably swaps between the two forms and that isn't an error.
function normalize(text) {
  let t = text.toLowerCase();
  for (const [word, digit] of Object.entries(NUM_WORDS)) {
    t = t.replace(new RegExp(`\\b${word}\\b`, "g"), String(digit));
  }
  return t;
}

const numbersIn = (text) => new Set((normalize(text).match(/\d+/g) || []));

const DAYS = "monday|tuesday|wednesday|thursday|friday|saturday|sunday";
const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";

// Dates and times are the highest-stakes facts in any assignment.
// Dropping one is the worst thing this app can do.
function datesIn(text) {
  const t = text.toLowerCase();
  const found = new Set();
  for (const re of [
    new RegExp(`\\b(${DAYS})\\b`, "g"),
    new RegExp(`\\b(${MONTHS})\\s+\\d{1,2}\\b`, "g"),
    /\b\d{1,2}:\d{2}\s*(?:am|pm)?\b/g
  ]) {
    for (const m of t.matchAll(re)) found.add(m[0].trim());
  }
  return found;
}

const STOP = new Set(["that","this","with","from","your","their","which","about","there","these","those","have","into","they","them","been","when","what","where","will","would","should","must","also","than","then","each","both","only","other","more","most","such","some","said","post","posts"]);

const significant = (s) =>
  new Set(s.toLowerCase().match(/[a-z]{5,}/g)?.filter(w => !STOP.has(w)) || []);

const overlap = (a, b) => {
  const A = significant(a), B = significant(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return { ratio: shared / Math.min(A.size, B.size), shared };
};

const IMPERATIVES = new Set(["check","find","open","write","submit","post","use","read","click","go","select","add","make","ensure","include","cite","draft","search","locate","bring","pull","label","answer","proofread","complete","review","choose","pick","apply","compare","identify","explain","save","upload","watch","email","visit","download","start","begin","confirm","set"]);

// ============================================================

export function runChecks(source, out, opts = {}) {
  const skip = new Set(opts.skipChecks || []);
  const issues = [];
  const add = (level, name, detail) => { if (!skip.has(name)) issues.push({ level, name, detail }); };

  const groups = { work: out.work, legwork: out.legwork, rules: out.rules, unclear: out.unclear };
  const allItems = Object.entries(groups).flatMap(([g, items]) => items.map((t, i) => ({ g, i, t })));
  const allText = allItems.map(x => x.t).join(" ");

  // --- 1. Group collapse. Three groups emptied on us this session. ---
  if (!opts.expectAllEmpty) {
    if (out.work.length === 0)  add("FAIL", "empty-group", "THE WORK is empty");
    if (out.rules.length === 0) add("FAIL", "empty-group", "THE RULES is empty");
  } else {
    const total = allItems.length;
    if (total > 0) add("FAIL", "should-be-empty", `expected no items for this input, got ${total}`);
  }

  // --- 2. Invented numbers. The dangerous hallucination: a page count or
  //        weight that was never in the source, stated confidently. ---
  const srcNums = numbersIn(source);
  const invented = [...numbersIn(allText)].filter(n => !srcNums.has(n) && n.length <= 4);
  if (invented.length) add("FAIL", "invented-numbers", `not in source: ${invented.join(", ")}`);

  // --- 3. Dropped dates. The round-four disaster detector. ---
  const srcDates = datesIn(source), outDates = datesIn(allText);
  const dropped = [...srcDates].filter(d => !outDates.has(d));
  if (dropped.length) add("FAIL", "dropped-dates", `in source, missing from output: ${dropped.join(", ")}`);

  // --- 4. Page numbers. Cannot be known; always invented. ---
  const pages = allText.match(/\b(?:page|pp?\.)\s*\d+/gi) || [];
  if (pages.length) add("FAIL", "page-numbers", pages.join(", "));

  // --- 5. Dependency language. The principle: actionable alone, tonight. ---
  for (const { g, i, t } of allItems) {
    if (/\b(ask|email|e-mail|contact|message)\b[^.]{0,40}\b(professor|instructor|teacher|ta\b)/i.test(t)
      || /\bseek clarification\b|\bclarify with\b|\breach out to\b/i.test(t)) {
      add("FAIL", "dependency-language", `${g}[${i}]: ${t.slice(0, 70)}...`);
    }
  }

  // --- 6. Unclear cap. ---
  if (out.unclear.length > 2) add("FAIL", "unclear-cap", `${out.unclear.length} items, max 2`);

  // --- 7. Rules phrased as actions. A rule describes; it does not instruct. ---
  for (const [i, t] of out.rules.entries()) {
    const first = t.trim().toLowerCase().replace(/^[^a-z]+/, "").split(/\s+/)[0];
    if (IMPERATIVES.has(first)) add("WARN", "action-phrased-rule", `rules[${i}]: "${t.slice(0, 60)}..."`);
  }

  // --- 8. Item ceiling. A bullet taking two breaths is not a checklist item. ---
  for (const { g, i, t } of allItems) {
    if (g === "unclear") continue;             // UNCLEAR gets two sentences by design
    const words = t.split(/\s+/).length;
    if (words > 30) add("WARN", "item-too-long", `${g}[${i}]: ${words} words`);
  }

  // --- 9. Cross-group duplication. Heuristic, so WARN. ---
  for (let a = 0; a < allItems.length; a++) {
    for (let b = a + 1; b < allItems.length; b++) {
      if (allItems[a].g === allItems[b].g) continue;
      const { ratio, shared } = overlap(allItems[a].t, allItems[b].t);
      if (ratio >= 0.6 && shared >= 4) {
        add("WARN", "cross-group-dup",
          `${allItems[a].g}[${allItems[a].i}] ~ ${allItems[b].g}[${allItems[b].i}] (${shared} shared words)`);
      }
    }
  }

  // --- 10. Bloat. Output longer than the thing it was meant to simplify. ---
  if (allText.length > source.length) {
    add("FAIL", "longer-than-source", `${allText.length} chars vs ${source.length} in source`);
  }

  // --- 11. Over-production on a simple assignment. ---
  if (opts.maxTotalItems && allItems.length > opts.maxTotalItems) {
    add("WARN", "over-produced", `${allItems.length} items, expected <= ${opts.maxTotalItems}`);
  }

  return issues;
}
