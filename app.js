// ============================================================
// ENTRY
//
// Wiring only. State lives in state.js, DOM lives in render.js.
// ============================================================

import { get, set, setBreakdown, subscribe, clearAll } from "./state.js";
import { mount, syncAll } from "./render.js";

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

// ------------------------------------------------------------
// Render on change. A new breakdown rebuilds; anything else -
// a check toggling - only syncs, so transitions survive.
// ------------------------------------------------------------

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
// Extract
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

    // The server answered and declined - too short, rate limited, bad input.
    if (!res.ok) {
      errorEl.textContent = data.error || "Something went wrong.";
      showState("error");
      return;
    }

    setBreakdown(
      { work: data.work, legwork: data.legwork, rules: data.rules, unclear: data.unclear },
      text
    );
    showState("results");

  } catch (err) {
    // Nothing answered at all. A different failure, so a different message.
    console.error(err);
    errorEl.textContent = "Couldn't reach the server. Check your connection and try again.";
    showState("error");

  } finally {
    goEl.disabled = false;
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
