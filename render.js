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
import { annotate, goalNumbers } from "./annotate.js";

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
let onCheck = null;      // set by app.js
let editing = true;      // UI-only: textarea vs annotated draft

export function setCheckHandler(fn) { onCheck = fn; }
export function setEditing(on) { editing = on; syncAll(); }

// ------------------------------------------------------------
// Build
// ------------------------------------------------------------

export function mount(container) {
  root = container;
  root.innerHTML = "";

  const state = get();
  if (!state.breakdown) return;

  editing = !state.verdicts;

  root.appendChild(buildProgress());

  let n = 0;
  for (const key of ORDER) {
    const items = state.breakdown[key] ?? [];
    if (items.length === 0) continue;     // an empty heading reads as a bug
    const section = buildSection(key, items, state);
    section.style.setProperty("--enter", `${n++ * 60}ms`);
    root.appendChild(section);
  }

  if ((state.breakdown.work ?? []).length > 0) {
    const checker = buildChecker(state);
    checker.style.setProperty("--enter", `${n * 60}ms`);
    root.appendChild(checker);
  }

  wireLinking();
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

  // Goal number, so a highlight in the draft can say which goal it answers.
  if (group === "work") {
    li.dataset.n = index + 1;
    li.appendChild(el("div", "item-verdict"));
  }

  return li;
}

// ------------------------------------------------------------
// The draft
// ------------------------------------------------------------

function buildChecker(state) {
  const box = el("section", "checker");
  box.innerHTML = `
    <div class="group-head">
      <span class="dot"></span>
      <h2>Your draft</h2>
      <span class="tally" data-checker-tally></span>
    </div>

    <div data-edit>
      <p class="checker-hint">Paste what you've written. Every goal gets marked against it — nothing is rewritten or edited.</p>
      <textarea data-draft placeholder="Paste your draft…"></textarea>
      <div class="actions">
        <button type="button" data-check>Check it</button>
        <button type="button" class="link" data-cancel hidden>Cancel</button>
      </div>
      <div class="checker-status" data-status hidden></div>
    </div>

    <div data-read hidden>
      <p class="checker-hint">Highlighted sentences are what satisfied a goal. Hover either side to link them.</p>
      <div class="draft-read" data-annotated></div>
      <div class="actions"><button type="button" data-revise>Revise and check again</button></div>
    </div>`;

  box.querySelector("[data-draft]").value = state.draft ?? "";
  box.querySelector("[data-check]").addEventListener("click", () => {
    const draft = box.querySelector("[data-draft]").value;
    set({ draft });
    onCheck?.(draft);
  });
  box.querySelector("[data-revise]").addEventListener("click", () => setEditing(true));
  box.querySelector("[data-cancel]").addEventListener("click", () => setEditing(false));

  return box;
}

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
// Linking: hover a goal to light its sentence, and the reverse
// ------------------------------------------------------------

function wireLinking() {
  const focus = (id) => {
    for (const n of root.querySelectorAll(".is-linked")) n.classList.remove("is-linked");
    root.classList.toggle("is-focusing", Boolean(id));
    if (!id) return;
    for (const n of root.querySelectorAll(`.item[data-id="${id}"], mark[data-goal="${id}"]`)) {
      n.classList.add("is-linked");
    }
  };

  root.addEventListener("pointerover", (e) => {
    const mark = e.target.closest("mark.ev");
    if (mark) return focus(mark.dataset.goal);
    const item = e.target.closest('.item[data-id^="work:"]');
    focus(item ? item.dataset.id : null);
  });

  root.addEventListener("pointerleave", () => focus(null));
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

    slot.replaceChildren(
      el("span", `badge badge-${v.status}`, VERDICT_LABEL[v.status]),
      el("p", "verdict-reason", v.reason)
    );

    // The flip: replay only for goals that actually moved up this check.
    if (improved.has(li.dataset.id)) {
      li.classList.remove("just-improved");
      void li.offsetWidth;                 // restart the animation
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
  const edit = root.querySelector("[data-edit]");
  const read = root.querySelector("[data-read]");
  if (!edit || !read) return;

  const checked = Boolean(state.verdicts);

  edit.hidden = !editing;
  read.hidden = editing || !checked;

  const cancel = root.querySelector("[data-cancel]");
  if (cancel) cancel.hidden = !checked;

  const tally = root.querySelector("[data-checker-tally]");

  if (checked && !editing) {
    const workCount = (state.breakdown?.work ?? []).length;
    const { frag, count } = annotate(state.draft ?? "", state.verdicts, goalNumbers(workCount));
    root.querySelector("[data-annotated]").replaceChildren(frag);

    // Denominator is the number of goals, not the number of verdicts that
    // came back. If the model answered only some, "1 of 1" is a lie.
    const met = Object.values(state.verdicts).filter(v => v.status === "met").length;
    if (tally) tally.textContent = `${met}/${workCount} goals · ${count} highlighted`;
  } else if (tally) {
    tally.textContent = "";
  }
}
