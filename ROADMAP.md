# Project Simple - roadmap

## The principle
The output must be something the student can act on **right now, alone**.
Anything that creates a dependency - email the professor, wait for a reply,
interpret the reply - is outside their control and doesn't move them forward
tonight.

Second principle: never compromise the student's learning. The app synthesizes
confusing information into achievable parts. It does not produce answers.

Third principle: **what is the absolute most we can do for the user with the
bare minimum of access to their information?** More context produces better
output, but v1 must stand up with nothing but one pasted blob. Cross-referencing
is an upgrade, never a crutch.

Corollary: never cite page numbers. The AI doesn't have the book, so any page
number is invented - and finding where things are in a text is a skill worth
leaving intact. Chapter names from the pasted text are fine.

Fourth principle: the AI is a **managing teacher, not a descriptive one**. It knows
what the assignment is training and never says so. It expresses that understanding
only through how it organizes the work - what leads, what gets separated out, what
it is allowed to spell out and what it must leave alone. Never through explanation.

## v1 (current)

Paste one blob of confusing text -> four groups. The split is about what a thing
IS, not how it is phrased, which is what makes it stable:

- **The Work** - the intellectual task, and nothing else. Requires thought, cannot
  be outsourced. Central task first, no announcement of which one that is.
  Maximum restraint: name the concepts, never explain them.
- **The Legwork** - no-thought actions. Lookups, retrieval, admin. Exists so the
  student can clear it in one sitting and see how much of the assignment was never
  really the assignment.
- **The Rules** - academic and social convention. Format, citation, length,
  deadlines, penalties, grading weights. Maximum helpfulness - there is no learning
  here to protect. Deadlines, lengths, penalties and weights are NEVER dropped.
- **Unclear** - genuine ambiguity that no amount of looking will settle. If a lookup
  would resolve it, it is Legwork. Never "ask your professor."

Earlier two-group versions (requirements/constraints) were unstable because they
split on grammar - "is this an action or a spec" is arguable for half of all items,
so the boundary moved every run. Splitting on what a thing IS fixed it.

Static frontend + one serverless function holding the API key. No database.

## v2 - per-item detail
Ideas captured from the original brainstorm, deliberately deferred:
- How does this item connect to the syllabus?
- Decode grading weight from the syllabus - how much does this assignment
  actually matter?
- AI confidence per item

Explicitly rejected: citing which line of the source text an item came from.
Low value, brittle.

## Later
- Multi-document cross-referencing (syllabus + rubric + schedule together).
  The most interesting feature and the most likely to sink the project if
  attempted early. Needs document management and chunking.
- Rewriting the assignment prompt in plainer language
- Gamification: if each part is complete, the whole thing is done. That's the
  game.

## Next session: consolidation, not fixes

The prompt went 911 -> 2027 words in one evening. UNCLEAR alone carries eight
separate pieces of machinery (positive definition, five search triggers, a
two-item cap, a settled-reading test, lookup precedence, no-repeat, no-invent,
never-ask-your-professor).

A group needing eight rules to behave means rules are doing work that structure
should do. The work/legwork/rules split proved the point: good structure DELETED
rules. The prompt got shorter when it got better.

So the next real move is to read all 2027 words straight through and ask what can
go because the structure already enforces it. Estimate: a third is scaffolding for
problems that no longer exist.

Known carry-over items, to fix during that pass rather than by adding rules:
- UNCLEAR does not restate the no-invention rule, and leaked an invented detail
  ("replies the instructor praised in earlier units" - the source says no such
  thing).
- Three group collapses happened this session, all the same cause: a weak
  positive definition plus a pile of prohibitions makes silence the cheapest
  compliant answer. Any group defined mainly by what it excludes will empty.
  Check every group has a positive definition of what it MUST contain.

## How to evaluate a change

Never judge from one run. Same input gives different output - output_tokens
includes invisible thinking tokens, so cost varies without the answer changing.
Use the chars column for verbosity.

  node --env-file=.env.local scripts/test-all.js
  diff runs/<older>.md runs/<newer>.md

Add every real assignment to samples/ as you collect them.
