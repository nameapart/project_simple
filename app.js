// ============================================================
// ENTRY
//
// Wiring only. State lives in state.js, DOM lives in render.js.
// ============================================================

import { get, setBreakdown, setVerdicts, subscribe, clearAll } from "./state.js";
import { mount, syncAll, setCheckHandler, setCheckBusy, setEditing } from "./render.js";

const sourceEl  = document.getElementById("source");
const goEl      = document.getElementById("go");
const resetEl   = document.getElementById("reset");
const loadingEl = document.getElementById("loading");
const errorEl   = document.getElementById("error");
const resultsEl = document.getElementById("results");

function showState(name) {
  loadingEl.hidden = name !== "loading";
  errorEl.hidden   = name !== "error";
  resultsEl.hidden = name !== "results";
  resetEl.hidden   = name !== "results";
}

// A new breakdown rebuilds the DOM; anything else - a check toggling, a
// verdict arriving - only syncs, so transitions survive.
let mounted = null;

subscribe((state) => {
  if (state.breakdown !== mounted) {
    mounted = state.breakdown;
    mount(resultsEl);
  } else {
    syncAll();
  }
});

// ------------------------------------------------------------
// Step one: extract the goals
// ------------------------------------------------------------

goEl.addEventListener("click", async () => {
  const text = sourceEl.value;
  showState("loading");
  goEl.disabled = true;

  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    const data = await res.json();

    if (!res.ok) {                       // the server answered and declined
      errorEl.textContent = data.error || "Something went wrong.";
      showState("error");
      return;
    }

    setBreakdown(
      { work: data.work, legwork: data.legwork, rules: data.rules, unclear: data.unclear },
      text
    );
    showState("results");

  } catch (err) {                        // nothing answered at all
    console.error(err);
    errorEl.textContent = "Couldn't reach the server. Check your connection and try again.";
    showState("error");
  } finally {
    goEl.disabled = false;
  }
});

// ------------------------------------------------------------
// Step two: check a draft against the goals
// ------------------------------------------------------------

setCheckHandler(async (draft) => {
  const goals = get().breakdown?.work ?? [];
  if (goals.length === 0) return;

  setCheckBusy(true, null);

  try {
    const res = await fetch("/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goals, draft })
    });
    const data = await res.json();

    if (!res.ok) {
      setCheckBusy(false, data.error || "Something went wrong.");
      return;
    }

    setCheckBusy(false, null);
    setVerdicts(data.verdicts);          // fires subscribe -> syncAll -> the flip
    setEditing(false);

  } catch (err) {
    console.error(err);
    setCheckBusy(false, "Couldn't reach the server. Check your connection and try again.");
  }
});

resetEl.addEventListener("click", () => {
  clearAll();
  sourceEl.value = "";
  mounted = null;
  showState("idle");
  sourceEl.focus();
});

// ------------------------------------------------------------
// Restore whatever was here last time
// ------------------------------------------------------------

const saved = get();
if (saved.breakdown) {
  sourceEl.value = saved.sourceText;
  mounted = saved.breakdown;
  mount(resultsEl);
  showState("results");
} else {
  showState("idle");
}
