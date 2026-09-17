// ============================================================
// STATE
//
// One store. Everything the page knows lives here, and every change
// goes through set(). Views subscribe and re-render; nothing reaches
// into the DOM to read what it previously wrote.
//
// Mirrored to localStorage so a refresh mid-draft doesn't wipe the
// breakdown and the draft with it.
// ============================================================

const KEY = "project-simple";
const VERSION = 1;

/**
 * Items are addressed as "group:index" - stable within one breakdown,
 * which is all we need: a new extraction replaces the breakdown and
 * clears the checks along with it, because the indices no longer mean
 * the same things.
 */
export const itemId = (group, index) => `${group}:${index}`;

const EMPTY = {
  version: VERSION,
  sourceText: "",
  breakdown: null,   // { work, legwork, rules, unclear } - arrays of strings
  checks: {},        // itemId -> true
  draft: "",
  verdicts: null,      // itemId -> { status, reason, evidence }
  prevVerdicts: null,  // the set before the last check, for the flip
  checkedAt: null
};

/** missing < partial < met. Used to tell an improvement from a change. */
export const RANK = { missing: 0, partial: 1, met: 2 };

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const saved = JSON.parse(raw);
    // A stored shape from an older version is discarded rather than
    // migrated. Cheap now; revisit when losing it would actually hurt.
    if (saved?.version !== VERSION) return { ...EMPTY };
    // prevVerdicts is forced null rather than trusted from storage: it is
    // session-only by design, and older saves may still contain one.
    return { ...EMPTY, ...saved, prevVerdicts: null };
  } catch {
    // Private windows, cleared site data, storage disabled. Not an error.
    return { ...EMPTY };
  }
}

function save() {
  try {
    // prevVerdicts is deliberately NOT persisted. It exists to answer
    // "what just improved", which is a thing that happened in this
    // session - not a fact about the work. Persisting it made the
    // "2 goals improved" line and the celebration animation replay on
    // every page load, which cheapens the one moment that matters.
    const { prevVerdicts, ...durable } = state;
    localStorage.setItem(KEY, JSON.stringify(durable));
  } catch {
    // Quota or a browser refusing storage. The app keeps working in memory.
  }
}

export const get = () => state;

export function set(patch) {
  state = { ...state, ...patch };
  save();
  for (const fn of listeners) fn(state);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** A new breakdown invalidates every check and verdict attached to the old one. */
export function setBreakdown(breakdown, sourceText) {
  set({ breakdown, sourceText, checks: {}, verdicts: null, checkedAt: null });
}

export function toggleCheck(id) {
  const checks = { ...state.checks };
  if (checks[id]) delete checks[id]; else checks[id] = true;
  set({ checks });
}

/**
 * Record a check. A met verdict ticks its box, because the point of the
 * loop is watching goals complete - but a check NEVER unticks something.
 * The checkbox is what you consider done; the verdict is what the last
 * check found. When they disagree, the page shows both rather than
 * overruling you.
 */
export function setVerdicts(list) {
  const verdicts = {};
  for (const v of list) verdicts[itemId("work", v.index)] = v;

  const checks = { ...state.checks };
  for (const [id, v] of Object.entries(verdicts)) {
    if (v.status === "met") checks[id] = true;
  }

  set({
    prevVerdicts: state.verdicts,
    verdicts,
    checks,
    checkedAt: Date.now()
  });
}

/** Item ids whose verdict improved in the last check. The flip. */
export function improvedIds() {
  const { verdicts, prevVerdicts } = state;
  if (!verdicts || !prevVerdicts) return [];
  return Object.keys(verdicts).filter(id => {
    const before = prevVerdicts[id];
    return before && RANK[verdicts[id].status] > RANK[before.status];
  });
}

export function clearAll() {
  state = { ...EMPTY };
  save();
  for (const fn of listeners) fn(state);
}

/** Cleared / total for one group. Used by the progress meters. */
export function progress(group) {
  const items = state.breakdown?.[group] ?? [];
  const done = items.filter((_, i) => state.checks[itemId(group, i)]).length;
  return { done, total: items.length, complete: items.length > 0 && done === items.length };
}
