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

import { get, itemId, progress, toggleCheck } from "./state.js";

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

// ------------------------------------------------------------
// Build
// ------------------------------------------------------------

export function mount(container) {
  root = container;
  root.innerHTML = "";

  const state = get();
  if (!state.breakdown) return;

  root.appendChild(buildProgress());

  for (const key of ORDER) {
    const items = state.breakdown[key] ?? [];
    if (items.length === 0) continue;      // an empty heading reads as a bug
    root.appendChild(buildSection(key, items, state));
  }

  syncAll();
}

function buildProgress() {
  const box = el("div", "progress");
  box.innerHTML = `
    <div class="progress-head">
      <span class="progress-count" data-count></span>
      <span class="progress-done">All done</span>
    </div>
    <div class="meter"><i data-bar></i></div>`;
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

  // Slot for the step-2 verdict. Empty now; the row already has a home for it.
  li.appendChild(el("div", "item-verdict"));

  return li;
}

// ------------------------------------------------------------
// Sync - runs on every state change, touches only what moved
// ------------------------------------------------------------

export function syncAll() {
  if (!root) return;
  const state = get();

  // Only needed when state changes from somewhere other than a click:
  // a restore from storage, or step 2 marking items met.
  for (const li of root.querySelectorAll(".item[data-id]")) {
    const input = li.querySelector(".item-input");
    const on = Boolean(state.checks[li.dataset.id]);
    if (input.checked !== on) input.checked = on;
  }

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
}
