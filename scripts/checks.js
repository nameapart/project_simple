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

// Everything reachable by adding up to three source numbers, or by
// subtracting one from 100 (percentages). Used to tell arithmetic from
// invention: "5 points + 5 + 5 = 15 total" is reasoning, not a hallucination.
function derivable(srcNums) {
  const base = [...srcNums].map(Number).filter(n => n > 0 && n < 1000).slice(0, 40);
  const out = new Set(base.map(String));
  for (const a of base) {
    out.add(String(100 - a));
    for (const b of base) {
      out.add(String(a + b));
      for (const c of base) out.add(String(a + b + c));
    }
  }
  return out;
}

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

const normText = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tokensOf = (s) => new Set(normText(s).split(" ").filter(w => w.length >= 3));

// How alike are two items? Used to tell a reworded item from a new one.
// Long prose compares on distinctive words; short items like a bare date have
// none of those, so they fall back to all tokens - otherwise a stray comma
// makes an item look brand new.
export function similarity(a, b) {
  if (normText(a) === normText(b)) return 1;

  const A = significant(a), B = significant(b);
  const score = (X, Y) => {
    if (!X.size || !Y.size) return 0;
    let shared = 0;
    for (const w of X) if (Y.has(w)) shared++;
    return shared / Math.min(X.size, Y.size);
  };

  if (A.size >= 3 && B.size >= 3) return score(A, B);
  return score(tokensOf(a), tokensOf(b));
}

const overlap = (a, b) => {
  const A = significant(a), B = significant(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return { ratio: shared / Math.min(A.size, B.size), shared };
};

const IMPERATIVES = new Set(["check","find","open","write","submit","post","use","read","click","go","select","add","make","ensure","include","cite","draft","search","locate","bring","pull","label","answer","review","choose","pick","apply","compare","identify","explain","save","upload","watch","email","visit","download","start","begin","confirm","set"]);

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

  // --- 2. Numbers not in the source. Often a real hallucination, but the
  //        model also does legitimate arithmetic ("the other 90%" from a 10%
  //        weight), so this is a WARN for a human to judge. ---
  const srcNums = numbersIn(source);
  const factText = [...out.work, ...out.legwork, ...out.rules].join(" ");
  const reachable = new Set([...srcNums, ...derivable(srcNums)]);
  const invented = [...numbersIn(factText)].filter(n => !reachable.has(n) && n.length <= 4);
  if (invented.length) add("WARN", "invented-numbers", `not in source: ${invented.join(", ")}`);

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
    const clean = t.trim().toLowerCase().replace(/^[^a-z]+/, "");
    const first = clean.split(/\s+/)[0];
    // Noun-phrase specs look like "Post due Friday" or "Entry title: ..." -
    // the leading word is a noun, not a command.
    const isNounPhrase = /^\w+\s*(:|due\b|length\b|title\b|format\b|count\b|limit\b|size\b|type\b|settings\b|scale\b)/.test(clean);
    if (IMPERATIVES.has(first) && !isNounPhrase) {
      add("WARN", "action-phrased-rule", `rules[${i}]: "${t.slice(0, 60)}..."`);
    }
  }

  // --- 8. Item ceiling. A bullet taking two breaths is not a checklist item. ---
  for (const { g, i, t } of allItems) {
    if (g === "unclear") continue;                   // two sentences by design
    const words = t.split(/\s+/).length;
    // RULES legitimately carries rubric tables and option lists, which run to
    // about 35 words. A 130-word bullet is unreadable in any group.
    const ceiling = g === "rules" ? 60 : 30;
    if (words > ceiling) add("WARN", "item-too-long", `${g}[${i}]: ${words} words (max ${ceiling})`);
  }

  // --- 9. A missing deadline is LEGWORK, never UNCLEAR. Recurring violation. ---
  for (const [i, t] of out.unclear.entries()) {
    const aboutTiming = /\b(deadline|due date|due time|closing time|when it closes|close time)\b/i.test(t);
    const saysMissing = /\b(not stated|never states?|does not (?:say|state|give)|no (?:date|time|deadline) is|unstated|is not given)\b/i.test(t);
    const citesAConcreteTime = /\d{1,2}:\d{2}|\b\d+\s*(?:minutes|hours|days)\b|\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(t);
    if (aboutTiming && saysMissing && !citesAConcreteTime) {
      add("WARN", "deadline-in-unclear", `unclear[${i}]: "${t.slice(0, 60)}..."`);
    }
  }

  // --- 10. Cross-group duplication. Heuristic, so WARN. ---
  const factItems = allItems.filter(x => x.g !== "unclear");
  for (let a = 0; a < factItems.length; a++) {
    for (let b = a + 1; b < factItems.length; b++) {
      if (factItems[a].g === factItems[b].g) continue;
      const { ratio, shared } = overlap(factItems[a].t, factItems[b].t);
      if (ratio >= 0.6 && shared >= 6) {
        add("WARN", "cross-group-dup",
          `${factItems[a].g}[${factItems[a].i}] ~ ${factItems[b].g}[${factItems[b].i}] (${shared} shared words)`);
      }
    }
  }

  // --- 11. Padding. Restructuring can legitimately land near the source's
  //         own length; ballooning past it cannot. ---
  // Below ~600 chars the denominator is too small for the ratio to mean
  // anything; over-produced covers that case by counting items instead.
  if (source.length >= 600) {
    const ratio = allText.length / source.length;
    // Never a FAIL: three calibration attempts established that this measures
    // how densely instructions are packed into the source, not how much
    // ceremony was added. Worth a look, never worth blocking on.
    if (ratio > 2.5) add("WARN", "padded", `${ratio.toFixed(2)}x the source length - check for manufactured items`);
  }

  // --- 12. Over-production on a simple assignment. ---
  if (opts.maxTotalItems && allItems.length > opts.maxTotalItems) {
    add("WARN", "over-produced", `${allItems.length} items, expected <= ${opts.maxTotalItems}`);
  }

  return issues;
}
