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
