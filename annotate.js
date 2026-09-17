// ============================================================
// ANNOTATE
//
// Renders the draft with the evidence spans highlighted, each in the
// colour of the goal it satisfied.
//
// Everything is built as DOM nodes, never innerHTML: the draft is text
// a stranger pasted, and the evidence is a model quoting it back.
// ============================================================

import { itemId } from "./state.js";

/**
 * The model sometimes joins two non-contiguous quotes with an ellipsis.
 * Each piece is located separately rather than searching for a string
 * that never appears in the draft verbatim.
 */
function pieces(evidence) {
  return evidence
    .split(/\s*(?:\.\.\.|…)\s*/)
    .map(p => p.trim())
    .filter(p => p.length >= 12);       // too short to locate unambiguously
}

/** First index of `needle` in `hay`, exact then case-insensitive. */
function locate(hay, needle, from = 0) {
  const exact = hay.indexOf(needle, from);
  if (exact !== -1) return exact;
  const i = hay.toLowerCase().indexOf(needle.toLowerCase(), from);
  return i;
}

/**
 * Spans to highlight, as {start, end, id, status}. Overlapping spans are
 * dropped rather than nested - a sentence credited to two goals is rare,
 * and half-open marks render worse than one clean one.
 */
export function findSpans(draft, verdicts) {
  const found = [];

  for (const [id, v] of Object.entries(verdicts ?? {})) {
    if (!v.evidence) continue;
    for (const piece of pieces(v.evidence)) {
      const start = locate(draft, piece);
      if (start === -1) continue;       // model paraphrased; skip silently
      found.push({ start, end: start + piece.length, id, status: v.status });
    }
  }

  found.sort((a, b) => a.start - b.start || b.end - a.end);

  const kept = [];
  let cursor = -1;
  for (const span of found) {
    if (span.start < cursor) continue;  // overlaps one already kept
    kept.push(span);
    cursor = span.end;
  }
  return kept;
}

/**
 * The draft as a DocumentFragment, with <mark> around each located span.
 * Paragraph breaks are preserved so it reads like the thing you wrote.
 */
export function annotate(draft, verdicts, goalIndexById = {}) {
  const frag = document.createDocumentFragment();
  const spans = findSpans(draft, verdicts);

  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) frag.append(plain(draft.slice(cursor, span.start)));

    const mark = document.createElement("mark");
    mark.className = `ev ev-${span.status}`;
    mark.dataset.goal = span.id;
    mark.dataset.n = goalIndexById[span.id] ?? "";
    mark.textContent = draft.slice(span.start, span.end);
    frag.append(mark);

    cursor = span.end;
  }
  if (cursor < draft.length) frag.append(plain(draft.slice(cursor)));

  return { frag, count: spans.length };
}

/** Text with blank lines turned back into paragraph breaks. */
function plain(text) {
  const frag = document.createDocumentFragment();
  const parts = text.split(/\n{2,}/);
  parts.forEach((part, i) => {
    if (i > 0) frag.append(document.createElement("br"), document.createElement("br"));
    frag.append(document.createTextNode(part.replace(/\n/g, " ")));
  });
  return frag;
}

/** Map of itemId -> 1-based goal number, for the little badges on marks. */
export function goalNumbers(workCount) {
  const map = {};
  for (let i = 0; i < workCount; i++) map[itemId("work", i)] = i + 1;
  return map;
}
