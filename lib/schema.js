// The shape the extraction endpoint demands back from the model.
// Shared so api/ and scripts/ cannot drift apart - this was duplicated in
// three files and a change had to be remembered three times.
//
// Node only. The browser never imports this (it would pull in zod for nothing).

import { z } from "zod";

export const BreakdownSchema = z.object({
  work:    z.array(z.string()),
  legwork: z.array(z.string()),
  rules:   z.array(z.string()),
  unclear: z.array(z.string())
});

/**
 * One verdict per goal from THE WORK. `index` addresses back into the
 * goal list that was sent, so order can never silently drift.
 * `evidence` is a span copied from the draft, empty when nothing was found.
 */
export const VerdictSchema = z.object({
  verdicts: z.array(z.object({
    index:    z.number(),
    status:   z.enum(["met", "partial", "missing"]),
    reason:   z.string(),
    evidence: z.string()
  }))
});
