// ============================================================
// RENDER
//
// Builds the results DOM once per breakdown, then mutates it in place.
//
// Why in place: a checkbox that re-renders its own row on click replaces
// the element mid-transition, and the animation never plays. Build once,
// then only update what moved. The row's checked appearance is handled
// entirely in CSS via :has(:checked) - there is no class to toggle.
// ============================================================

import { get, set, itemId, progress, toggleCheck, improvedIds } from "./state.js";

// Only The Work and The Legwork are tasks. Finishing them means the
// assignment is done, which is the only thing that makes the progress
// number worth showing. The Rules are specifications the finished work
// must satisfy and Unclear holds decisions - neither is something you
// complete, and counting them would dilute what "done" means.
const TASKS = ["work", "legwork"];
const ORDER = ["work", "legwork", "rules", "unclear"];

const LABELS = {
  work:    "The Work",
  legwork: "The Legwork",
  rules:   "The Rules",
  unclear: "Unclear"
};

const VERDICT_LABEL = { met: "Met", partial: "Partly there", missing: "Not yet" };

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

// stroke-dasharray on the path is what lets the tick draw itself in
const TICK = `<svg class="tick" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor"
        stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

let root = null;
let onCheck = null;       // set by app.js
let checkerOpen = true;   // UI-only: collapses to a bar after the first check

export function setCheckHandler(fn) { onCheck = fn; }

/** Collapse the draft box to a bar once a check has landed. */
export function setCheckerOpen(open) { checkerOpen = open; syncAll(); }

// ------------------------------------------------------------
// Build
// ------------------------------------------------------------

export function mount(container) {
  root = container;
  root.innerHTML = "";

  const state = get();
  if (!state.breakdown) return;

  checkerOpen = !state.verdicts;

  root.appendChild(buildProgress());

  for (const key of ORDER) {
    const items = state.breakdown[key] ?? [];
    if (items.length === 0) continue;      // an empty heading reads as a bug
    root.appendChild(buildSection(key, items, state));
  }

  if ((state.breakdown.work ?? []).length > 0) root.appendChild(buildChecker(state));

  syncAll();
}

function buildProgress() {
  const box = el("div", "progress");
  box.innerHTML = `
    <div class="progress-head">
      <span class="progress-count" data-count></span>
      <span class="progress-done">All done</span>
    </div>
    <div class="meter"><i data-bar></i></div>
    <p class="progress-flip" data-flip hidden></p>`;
  return box;
}

function buildSection(key, items, state) {
  const section = el("section", `group group-${key}`);
  const isTask = TASKS.includes(key);

  const head = el("div", "group-head");
  head.appendChild(el("span", "dot"));
  head.appendChild(el("h2", null, LABELS[key]));

  if (isTask) {
    const tally = el("span", "tally");
    tally.dataset.tally = key;
    head.appendChild(tally);
  }
  section.appendChild(head);

  const list = el("ul", isTask ? "items" : "specs");
  items.forEach((text, i) => {
    list.appendChild(isTask ? buildTask(key, i, text, state) : el("li", "spec", text));
  });
  section.appendChild(list);

  return section;
}

function buildTask(group, index, text, state) {
  const id = itemId(group, index);
  const li = el("li", "item");
  li.dataset.id = id;

  // A real checkbox, visually hidden: keyboard and screen readers for free.
  const label = el("label", "item-label");
  const input = el("input", "item-input");
  input.type = "checkbox";
  input.checked = Boolean(state.checks[id]);
  input.addEventListener("change", () => toggleCheck(id));

  const box = el("span", "box");
  box.innerHTML = TICK;

  label.append(input, box, el("span", "item-text", text));
  li.appendChild(label);

  // Only THE WORK is evaluated against a draft - legwork errands leave no
  // trace in writing - so only those rows get a verdict slot.
  if (group === "work") li.appendChild(el("div", "item-verdict"));

  return li;
}

// ------------------------------------------------------------
// The draft box
// ------------------------------------------------------------

function buildChecker(state) {
  const box = el("section", "checker");

  box.innerHTML = `
    <div class="checker-bar" data-bar-row hidden>
      <span class="checker-summary" data-checker-summary></span>
      <button type="button" class="link" data-expand>Check again</button>
    </div>

    <div class="checker-open" data-open-row>
      <h2 class="checker-title">Check your draft</h2>
      <p class="checker-hint">Paste what you've written. Every goal above gets marked against it — nothing is rewritten or edited.</p>
      <textarea data-draft placeholder="Paste your draft…"></textarea>
      <div class="actions">
        <button type="button" id="check" data-check>Check it</button>
        <button type="button" class="link" data-collapse hidden>Cancel</button>
      </div>
      <div class="checker-status" data-status hidden></div>
    </div>`;

  box.querySelector("[data-draft]").value = state.draft ?? "";
  box.querySelector("[data-check]").addEventListener("click", () => {
    const draft = box.querySelector("[data-draft]").value;
    set({ draft });
    onCheck?.(draft);
  });
  box.querySelector("[data-expand]").addEventListener("click", () => { checkerOpen = true; syncAll(); });
  box.querySelector("[data-collapse]").addEventListener("click", () => { checkerOpen = false; syncAll(); });

  return box;
}

/** Called by app.js around the request. */
export function setCheckBusy(busy, message) {
  if (!root) return;
  const btn = root.querySelector("[data-check]");
  const status = root.querySelector("[data-status]");
  if (btn) { btn.disabled = busy; btn.textContent = busy ? "Checking…" : "Check it"; }
  if (status) {
    status.hidden = !message;
    status.textContent = message ?? "";
    status.classList.toggle("is-error", Boolean(message));
  }
}

// ------------------------------------------------------------
// Sync - runs on every state change, touches only what moved
// ------------------------------------------------------------

export function syncAll() {
  if (!root) return;
  const state = get();

  // Only needed when state changes from somewhere other than a click:
  // a restore from storage, or a check marking goals met.
  for (const li of root.querySelectorAll(".item[data-id]")) {
    const input = li.querySelector(".item-input");
    const on = Boolean(state.checks[li.dataset.id]);
    if (input.checked !== on) input.checked = on;
  }

  renderVerdicts(state);
  renderProgress(state);
  renderChecker(state);
}

function renderVerdicts(state) {
  const improved = new Set(improvedIds());

  for (const li of root.querySelectorAll('.item[data-id^="work:"]')) {
    const slot = li.querySelector(".item-verdict");
    const v = state.verdicts?.[li.dataset.id];

    li.dataset.verdict = v ? v.status : "";

    if (!v) { slot.replaceChildren(); continue; }

    const badge = el("span", `badge badge-${v.status}`, VERDICT_LABEL[v.status]);
    const reason = el("p", "verdict-reason", v.reason);
    slot.replaceChildren(badge, reason);

    if (v.evidence) {
      const quote = el("blockquote", "verdict-evidence", v.evidence);
      slot.appendChild(quote);
    }

    // The flip: replay only for goals that actually moved up this check.
    if (improved.has(li.dataset.id)) {
      li.classList.remove("just-improved");
      void li.offsetWidth;                  // restart the animation
      li.classList.add("just-improved");
    }
  }
}

function renderProgress(state) {
  let done = 0, total = 0;

  for (const key of TASKS) {
    const p = progress(key);
    if (p.total === 0) continue;
    done += p.done;
    total += p.total;

    const tally = root.querySelector(`[data-tally="${key}"]`);
    if (tally) tally.textContent = `${p.done}/${p.total}`;

    const section = root.querySelector(`.group-${key}`);
    if (section) section.classList.toggle("is-complete", p.complete);
  }

  const count = root.querySelector("[data-count]");
  if (count) count.textContent = total ? `${done} of ${total} done` : "";

  const bar = root.querySelector("[data-bar]");
  if (bar) bar.style.width = total ? `${(done / total) * 100}%` : "0%";

  const wrap = root.querySelector(".progress");
  if (wrap) wrap.classList.toggle("is-complete", total > 0 && done === total);

  // "2 goals improved" is the sentence people actually want after a recheck.
  const flip = root.querySelector("[data-flip]");
  if (flip) {
    const n = improvedIds().length;
    flip.hidden = n === 0;
    flip.textContent = n ? `${n} goal${n === 1 ? "" : "s"} improved since your last check` : "";
  }
}

function renderChecker(state) {
  const open = root.querySelector("[data-open-row]");
  const bar  = root.querySelector("[data-bar-row]");
  if (!open || !bar) return;

  const checked = Boolean(state.verdicts);

  open.hidden = !checkerOpen;
  bar.hidden = checkerOpen || !checked;

  const cancel = root.querySelector("[data-collapse]");
  if (cancel) cancel.hidden = !checked;

  if (checked) {
    // Denominator is the number of goals, not the number of verdicts that
    // came back. If the model answered only some of them, "1 of 1 met" is
    // a lie and "1 of 3" is the useful truth.
    const goalCount = (state.breakdown?.work ?? []).length;
    const met = Object.values(state.verdicts).filter(v => v.status === "met").length;
    const summary = root.querySelector("[data-checker-summary]");
    if (summary) summary.textContent = `Draft checked — ${met} of ${goalCount} goals met`;
  }
}
