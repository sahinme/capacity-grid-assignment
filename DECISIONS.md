# Decisions

Yours to write, not your AI's. Short is good — bullets are fine, and half a page is
plenty. We read this first.

## What did the spec not tell you?

There are things this brief doesn't specify. Which ones did you hit, what did you decide,
and why?

- Weeks run Mon–Sun, but only Mon–Fri hours count against capacity. hours_per_day reads as a per-working-day figure. Ana’s Mon–Sun assignment at 8h/day is 40/40 counting weekdays and 56/40 counting all 7 days.Across the seed, 12% of person-weeks are over capacity counting weekdays, 35% counting all days.Weekend assignment-days aren’t shown.
- Range limit. Up to two years (106 weeks once widened to whole weeks); anything longer gets a 400. This matches the brief’s “two years of history”. With no limit, one request could pull the whole table.
- Partial weeks. The range is widened to whole weeks and the API returns the range it actually used.Reason: a partial column would compare a few days of allocation against a full week of capacity.

## What did you notice that looked wrong?

Anything in the output that didn't match what you expected. Whether you fixed it or left
it, we want to know you saw it.

- Eli has 0 capacity but 20h booked
- Holidays. Jan 1 counts as a working day, because the data has no holidays.
- Full-time people showed as over capacity. With all 7 days counted


## What did the AI get wrong that you caught?

One concrete example. Every real session has one.

- Missing optimistic update 
- 26-week cap. The AI first proposed a 26-week cap. You noticed it contradicted the brief’s “two years of history” and that Toggl’s own reports allow two years, so the cap became two years.
- An assumption presented as a rule. The AI presented “weekdays only” as a given rather than an assumption. When you challenged it, it was checked against the data (Ana 40 vs 56, 12% vs 35%).
- UI issues. Verbose error messages, the misleading “+15h” label, and the table shifting sideways when the editor opened. You caught all three by looking at the screen.

## What would you do differently with a week?

- Scale. People pagination and row virtualization; thousands of people × two years is about 300k cells.
- Capacity history. A separate table with effective_from, so each week shows its own capacity.
- Conflict detection. A version column, a 409, and “someone else changed this to X”.
- Working calendar. Public holidays and per-person working days.
- Measurement at scale. EXPLAIN on production-size data, plus an index if needed. On the seed today: about 6 ms for the default range, about 250 ms for two years.
- URL to keep the selected range in the URL, so it can be shared and the back button works.
