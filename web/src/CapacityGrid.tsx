import { memo, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { capacityKeys, fetchCapacity, type PersonCapacity } from './api'
import {
  MAX_WEEKS,
  addDays,
  cellStatus,
  formatHours,
  mondayOf,
  sundayOf,
  today,
  weekCount,
  wholeWeeks,
  type Range,
} from './capacity'
import { useUpdateWeeklyHours } from './useUpdateWeeklyHours'

type Props = {
  // The range shown first. The user can move and resize it from the grid.
  from: string
  to: string
}

const MAX_WEEKLY_HOURS = 168 // mirrors maxWeeklyHours in api/people.go

const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const dayMonthYear = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`)

// CapacityGrid renders one row per person and one column per week (Monday to
// Sunday), with each cell showing the hours allocated that week and turning
// red when they exceed the person's weekly hours.
export function CapacityGrid({ from, to }: Props) {
  const [range, setRange] = useState<Range>(() => wholeWeeks(from, to))
  const weeks = weekCount(range.from, range.to)
  const tooLong = weeks > MAX_WEEKS

  const query = useQuery({
    queryKey: capacityKeys.range(range.from, range.to),
    queryFn: ({ signal }) => fetchCapacity(range.from, range.to, signal),
    // Going back to a range seen in the last 30 s, or refocusing the tab,
    // doesn't refetch. Ranges stay cached for gcTime's default 5 minutes, so
    // stepping back a week shows data at once. Clicking quickly through new
    // weeks still requests each one, but the requests a click leaves behind
    // are aborted through the signal.
    staleTime: 30_000,
    // Keep showing the previous range while the next one loads, instead of
    // flashing an empty grid on every click of "next week".
    placeholderData: keepPreviousData,
    enabled: !tooLong,
  })

  const shift = (days: number) =>
    setRange((r) => ({ from: addDays(r.from, days), to: addDays(r.to, days) }))

  const goToThisWeek = () =>
    setRange((r) => {
      const start = mondayOf(today())
      return { from: start, to: addDays(start, weekCount(r.from, r.to) * 7 - 1) }
    })

  const changeFrom = (value: string) => {
    if (!value) return // the input is mid-edit
    setRange((r) => {
      const start = mondayOf(value)
      return { from: start, to: r.to < start ? sundayOf(start) : r.to }
    })
  }

  const changeTo = (value: string) => {
    if (!value) return
    setRange((r) => {
      const end = sundayOf(value)
      return { from: r.from > end ? mondayOf(end) : r.from, to: end }
    })
  }

  const data = query.data
  // Rows from the previous range are shown while the new one loads; they
  // aren't editable until the range they belong to is on screen.
  const showingOldRange = query.isPlaceholderData

  const overCount = useMemo(
    () => data?.people.filter((p) => p.allocated.some((h) => cellStatus(h, p.weeklyHours) === 'over')).length ?? 0,
    [data],
  )

  return (
    <section className="capacity">
      <div className="toolbar">
        <div className="nav" role="group" aria-label="Move the range">
          <button type="button" onClick={() => shift(-7)} aria-label="Previous week">
            ‹
          </button>
          <button type="button" onClick={goToThisWeek}>
            This week
          </button>
          <button type="button" onClick={() => shift(7)} aria-label="Next week">
            ›
          </button>
        </div>
        <label>
          From <input type="date" value={range.from} onChange={(e) => changeFrom(e.target.value)} />
        </label>
        <label>
          To <input type="date" value={range.to} onChange={(e) => changeTo(e.target.value)} />
        </label>
        <span className="range-label">
          {dayMonthYear.format(asDate(range.from))} – {dayMonthYear.format(asDate(range.to))} · {weeks}{' '}
          {weeks === 1 ? 'week' : 'weeks'}
        </span>
        <span className="status" aria-live="polite">
          {query.isFetching && data ? 'Updating…' : ''}
        </span>
      </div>

      {tooLong ? (
        <p className="notice" role="alert">
          That range covers {weeks} weeks. Pick at most {MAX_WEEKS} weeks (two years).
        </p>
      ) : query.isError && !data ? (
        <div className="notice error" role="alert">
          <p>Couldn't load capacity ({query.error.message}).</p>
          <button type="button" onClick={() => void query.refetch()}>
            Try again
          </button>
        </div>
      ) : !data ? (
        <GridSkeleton weeks={weeks} />
      ) : (
        <>
          {query.isRefetchError && (
            <p className="notice error" role="alert">
              Couldn't refresh. The numbers may be out of date.{' '}
              <button type="button" onClick={() => void query.refetch()}>
                Retry
              </button>
            </p>
          )}
          <p className="summary">
            {overCount === 0
              ? 'Nobody is over capacity in this range.'
              : `${overCount} of ${data.people.length} people are over capacity in at least one week.`}{' '}
            <span className="legend">
              <span className="swatch over" /> over capacity
              <span className="swatch full" /> at capacity
              <span className="swatch under" /> under
            </span>
          </p>
          <div className="grid-scroll">
            <table aria-busy={query.isFetching} className={showingOldRange ? 'stale' : undefined}>
              <thead>
                <tr>
                  <th scope="col" className="person">
                    Person
                  </th>
                  <th scope="col" className="capacity-col">
                    Weekly hours
                  </th>
                  {data.weeks.map((week) => (
                    <th scope="col" key={week} title={`Week of ${week}`}>
                      {dayMonth.format(asDate(week))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.people.map((person) => (
                  <PersonRow key={person.id} person={person} weeks={data.weeks} editable={!showingOldRange} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

type RowProps = {
  person: PersonCapacity
  weeks: string[]
  editable: boolean
}

// Memoized: an edit replaces only the edited person's object in the cache, so
// the other rows skip re-rendering.
const PersonRow = memo(function PersonRow({ person, weeks, editable }: RowProps) {
  const save = useUpdateWeeklyHours(person.id)
  const [editing, setEditing] = useState(false)

  return (
    <>
      <tr>
        <th scope="row" className="person">
          {person.name}
        </th>
        <td className="capacity-col">
          {editing ? (
            <CapacityEditor
              name={person.name}
              initial={person.weeklyHours}
              onCancel={() => setEditing(false)}
              onSave={(weeklyHours) => {
                setEditing(false)
                if (weeklyHours !== person.weeklyHours) {
                  save.mutate({ weeklyHours, previous: person.weeklyHours })
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="edit"
              // One save per person at a time keeps responses in order.
              disabled={!editable || save.isPending}
              onClick={() => {
                save.reset()
                setEditing(true)
              }}
              aria-label={`Edit weekly hours for ${person.name}, currently ${formatHours(person.weeklyHours)}`}
            >
              {formatHours(person.weeklyHours)}
              {save.isPending && <span className="saving"> saving…</span>}
            </button>
          )}
        </td>
        {person.allocated.map((hours, i) => {
          const status = cellStatus(hours, person.weeklyHours)
          return (
            <td
              key={weeks[i]}
              className={`cell ${status}`}
              title={`${formatHours(hours)} allocated of ${formatHours(person.weeklyHours)}, week of ${weeks[i]}`}
            >
              {status === 'empty' ? '–' : formatHours(hours)}
              {status === 'over' && <span className="excess"> +{formatHours(hours - person.weeklyHours)}</span>}
            </td>
          )
        })}
      </tr>
      {save.isError && (
        <tr className="row-error">
          <td colSpan={weeks.length + 2} role="alert">
            Couldn't save {formatHours(save.variables.weeklyHours)} ({save.error.message}). Still{' '}
            {formatHours(save.variables.previous)}.{' '}
            <button type="button" onClick={() => save.mutate(save.variables)}>
              Retry
            </button>{' '}
            <button type="button" onClick={() => save.reset()}>
              Dismiss
            </button>
          </td>
        </tr>
      )}
    </>
  )
})

type EditorProps = {
  name: string
  initial: number
  onSave: (weeklyHours: number) => void
  onCancel: () => void
}

function CapacityEditor({ name, initial, onSave, onCancel }: EditorProps) {
  const [value, setValue] = useState(String(initial))
  const hours = Number(value)
  const valid = value.trim() !== '' && Number.isFinite(hours) && hours >= 0 && hours <= MAX_WEEKLY_HOURS

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (valid) onSave(hours)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onCancel()
  }

  return (
    <form className="editor" onSubmit={submit} onKeyDown={onKeyDown}>
      <input
        type="number"
        min={0}
        max={MAX_WEEKLY_HOURS}
        step={0.5}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={`Weekly hours for ${name}`}
        aria-invalid={!valid}
        autoFocus
        onFocus={(e) => e.target.select()}
      />
      <button type="submit" disabled={!valid}>
        Save
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      {!valid && <span className="field-error">0–{MAX_WEEKLY_HOURS}</span>}
    </form>
  )
}

function GridSkeleton({ weeks }: { weeks: number }) {
  return (
    <div className="grid-scroll" aria-busy="true" aria-label="Loading capacity">
      <table className="skeleton">
        <tbody>
          {Array.from({ length: 8 }, (_, row) => (
            <tr key={row}>
              {Array.from({ length: Math.min(weeks, 26) + 2 }, (_, col) => (
                <td key={col}>
                  <span className="bone" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
