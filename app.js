// ============================================================
// GRAB THE ELEMENTS
// Done once, up front. Each of these is now a live handle to
// a real element on the page, matched by its id.
// ============================================================
const sourceEl   = document.getElementById("source");
const goEl       = document.getElementById("go");
const loadingEl  = document.getElementById("loading");
const errorEl    = document.getElementById("error");
const resultsEl  = document.getElementById("results");

// ============================================================
// STATE SWITCHING
// The four states, finally behaving. Exactly one is visible at
// a time. `hidden` is a built-in HTML property - set it true and
// the browser stops rendering that element entirely.
// ============================================================
function showState(name) {
  loadingEl.hidden = (name !== "loading");
  errorEl.hidden   = (name !== "error");
  resultsEl.hidden = (name !== "results");
}

// ============================================================
// RENDER ONE LIST
//
// Receives:
//   ulElement - an actual <ul> on the page
//   items     - an array of strings
//
// Must do:
//   put one <li> into that <ul> for each string in items
//
// The four pieces you need:
//   document.createElement("li")   makes a new <li>, not yet on the page
//   someLi.textContent = "words"   puts text inside it
//   ulElement.appendChild(someLi)  attaches it to the page
//   for (const item of items) {}   loops over the array
//
// Use textContent, not innerHTML. textContent treats the string as
// literal text; innerHTML would treat it as markup. This content comes
// from an AI reading text a stranger pasted in, so we never let it be
// interpreted as code.
// ============================================================
function renderList(ulElement, items) {
  // Clear first. Without this line, a second click appends a fresh set of
  // <li> items underneath the old ones instead of replacing them.
  ulElement.innerHTML = "";

  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    ulElement.appendChild(li);
  }
}

// ============================================================
// SHOW ONE GROUP
// Hides the whole section - heading included - when the group is
// empty. An empty list under a bold heading looks like a bug.
// ============================================================
function renderGroup(name, items) {
  document.getElementById(name + "-section").hidden = items.length === 0;
  renderList(document.getElementById(name), items);
}

// ============================================================
// WIRE UP THE BUTTON
// ============================================================
goEl.addEventListener("click", async () => {
  showState("loading");
  goEl.disabled = true;   // a second click costs real money

  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: sourceEl.value })
    });

    const data = await res.json();

    // The server answered, but said no - too short, rate limited, etc.
    // It put a human-readable reason in data.error.
    if (!res.ok) {
      errorEl.textContent = data.error || "Something went wrong.";
      showState("error");
      return;
    }

    renderGroup("work",    data.work);
    renderGroup("legwork", data.legwork);
    renderGroup("rules",   data.rules);
    renderGroup("unclear", data.unclear);
    showState("results");

  } catch (err) {
    // Nothing answered at all - offline, server down, request blocked.
    // A different failure from the one above, and it needs its own message.
    console.error(err);
    errorEl.textContent = "Couldn't reach the server. Check your connection and try again.";
    showState("error");

  } finally {
    goEl.disabled = false;   // runs either way, so the button always comes back
  }
});

// Page loads with all three state boxes hidden.
showState("idle");
