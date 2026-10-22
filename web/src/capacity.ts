// Pure helpers for the capacity grid: week arithmetic, cell status and cache
// updates. Kept free of React so they're easy to test.

import type { CapacityResponse } from './api'

// Mirrors maxWeeks in api/capacity.go: two years, widened to whole weeks.
export const MAX_WEEKS = 106

const DAY_MS = 24 * 60 * 60 * 1000

// Dates are ISO strings (YYYY-MM-DD) handled in UTC, so the user's time zone
// and DST changes can't shift a day.
function parse(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  return format(new Date(parse(iso).getTime() + days * DAY_MS))
}

// Weeks run Monday to Sunday.
export function mondayOf(iso: string): string {
  const daysSinceMonday = (parse(iso).getUTCDay() + 6) % 7
  return addDays(iso, -daysSinceMonday)
}

export function sundayOf(iso: string): string {
  return addDays(mondayOf(iso), 6)
}

export function weekCount(from: string, to: string): number {
  return Math.round((parse(mondayOf(to)).getTime() - parse(mondayOf(from)).getTime()) / (7 * DAY_MS)) + 1
}

export type Range = { from: string; to: string }

// Widens a range to whole weeks, the same way the API does.
export function wholeWeeks(from: string, to: string): Range {
  return { from: mondayOf(from), to: sundayOf(to) }
}

export function today(): string {
  const now = new Date()
  return format(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())))
}

export type CellStatus = 'empty' | 'under' | 'full' | 'over'

const EPSILON = 1e-9

export function cellStatus(allocated: number, capacity: number): CellStatus {
  if (allocated > capacity + EPSILON) return 'over' // includes any hours against zero capacity
  if (allocated <= EPSILON) return 'empty'
  if (allocated >= capacity - EPSILON) return 'full'
  return 'under'
}

// Returns the response with one person's weekly hours replaced. Allocations
// don't depend on capacity, so this is the only number an edit changes.
// Returns the same object when the person isn't in this range, so React Query
// doesn't re-render queries the edit didn't touch.
export function withWeeklyHours(
  data: CapacityResponse,
  personId: number,
  weeklyHours: number,
): CapacityResponse {
  if (!data.people.some((p) => p.id === personId && p.weeklyHours !== weeklyHours)) return data
  return {
    ...data,
    people: data.people.map((p) => (p.id === personId ? { ...p, weeklyHours } : p)),
  }
}

export function formatHours(hours: number): string {
  return `${Number(hours.toFixed(2))}h`
}
