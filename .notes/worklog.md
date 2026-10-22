# Worklog

Running notes on how this got built — decisions, assumptions, dead ends, and anything
left unfinished. Append as you go; a line or two per entry is right.

---

## 2026-10-22

- **Read the seed before writing anything.** 500 people, 12 projects, 126,195 assignments
  (2025-06-02 to 2027-01-03). `hours_per_day` is small (0.125–1.0) because one allocation is
  stored as many identical rows: Ana's Dec 29 – Jan 4 assignment is 1×1.0 + 14×0.5 rows =
  8h/day. Summed, every person lands on believable daily hours, so rows are summed, never
  de-duplicated.
- **Weekends don't count.** Weeks run Monday–Sunday, but only Mon–Fri allocations count
  against `weekly_hours`. Ana's Mon–Sun assignment at 8h/day is then 40/40 (exactly full)
  instead of 56/40, and Bo's Fri→Mon assignment adds 8h to each of two weeks instead of
  24h + 8h. Over-allocated person-weeks across the whole seed: 12% this way, 35% counting
  all seven days. 229,200 assignment-days fall on a weekend and are not shown anywhere.
- **Ranges are whole weeks.** The API widens `from` to its Monday and `to` to its Sunday and
  returns the range it used; the UI does the same before asking. A partial week would put
  a few days of allocation against a full week of capacity.
- **Capacity is one number per person.** No effective date in the schema (and it's fixed
  input), so an edit applies to every week, past ones included. The API returns
  `weeklyHours` once per person instead of per cell, so an edit changes one number.
- **Range cap: 106 weeks** (two years after widening). A cap of 26 weeks would contradict
  the "two years of history" in the brief; no cap means one request can ask for the whole
  table. Each week's allocation is the overlap of the assignment with Mon..Mon+4, so the
  query joins assignments to the weeks they touch instead of expanding every day.
- **Query timings (local PG 16 with the seed, not the PG 17 container):** default 3-week
  range ~6 ms; two years ~170–260 ms for 500 people. A first EXPLAIN ANALYZE took 3.1 s;
  repeated runs didn't, so that was cold cache + JIT, not the plan.
- **Checked the hand-made rows against the API query** (weeks of Dec 29 / Jan 5 / Jan 12):
  Ana 40/0/30, Bo 0/32/8, Cem 0/4/12, Dee 0/45/40, Eli 0/20/0 (capacity 0, so 20h shows as
  over). These match what I worked out by hand from the rows.
- **After a save:** optimistic update of that person's `weeklyHours` in every cached range,
  the server's value written back on success, only that person rolled back on failure (a
  whole-grid snapshot would also undo other people's in-flight edits), then one refetch of
  the visible range once no other saves are pending. Editing is locked per row while it
  saves, and disabled while the grid shows the previous range's rows.
- **Go wasn't compiled outside Docker** (no module proxy access there), only `gofmt`'d.
  The `make up` build is the compile check.
- **Deferred:** people pagination and row virtualization (thousands of people × two years
  is ~300k cells), public holidays (Jan 1 counts as a working day), capacity history,
  detecting a concurrent edit by another manager (no version column, last write wins),
  keeping the range in the URL.
- **Error copy shortened after trying a failed save** (API stopped mid-edit). The row
  already names the person, so it now says what wasn't saved, a short reason and what's
  showing: "Couldn't save 10h (no connection). Still 5h." 5xx bodies aren't shown; 4xx
  messages are, since the manager can act on them.
- **`staleTime` moved onto the capacity query** (30 s) so it sits next to the reason; it was a
  QueryClient default that was easy to miss. It doesn't stop rapid clicks through new weeks
  from requesting each one; aborting the abandoned requests does that.
- **Looked at the grid as an outsider would and it didn't explain itself.** "+15h" next to
  Eli's 20h read as "15 hours added", not "15 over". "Weekly hours" didn't say capacity,
  and nothing said weekends are left out. Cells now read "20 / 5h" with "15h over" under
  them, the column is "Capacity / week", headers say "Week of", one line above the table
  says what a cell is, and the editor says the change applies to every week, past ones
  included (the schema keeps one number). Saves now show "Saved" briefly.
- **Opening the editor shifted the whole table sideways**: the inline input, buttons and hint
  were wider than the "40h" button, so the column resized. The editor now floats over the
  cell and the column has a fixed minimum width that also fits "saving…".
