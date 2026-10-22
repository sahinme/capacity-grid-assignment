import { describe, expect, it } from 'vitest'
import type { CapacityResponse } from './api'
import { cellStatus, mondayOf, weekCount, wholeWeeks, withWeeklyHours } from './capacity'

describe('week arithmetic', () => {
  it('widens a range to whole Monday-to-Sunday weeks', () => {
    // The default range ends on a Friday.
    expect(wholeWeeks('2025-12-29', '2026-01-16')).toEqual({ from: '2025-12-29', to: '2026-01-18' })
    expect(weekCount('2025-12-29', '2026-01-16')).toBe(3)
  })

  it('treats Sunday as the end of the week, across a year boundary', () => {
    expect(mondayOf('2026-01-04')).toBe('2025-12-29') // Sunday
    expect(mondayOf('2025-12-29')).toBe('2025-12-29') // Monday
  })
})

describe('cellStatus', () => {
  it('flags hours above capacity, but not hours exactly at it', () => {
    expect(cellStatus(45, 40)).toBe('over')
    expect(cellStatus(40, 40)).toBe('full')
    expect(cellStatus(30, 40)).toBe('under')
    expect(cellStatus(0, 40)).toBe('empty')
  })

  it('flags any allocation against zero capacity', () => {
    expect(cellStatus(20, 0)).toBe('over')
    expect(cellStatus(0, 0)).toBe('empty')
  })
})

describe('withWeeklyHours', () => {
  const data: CapacityResponse = {
    from: '2026-01-05',
    to: '2026-01-11',
    weeks: ['2026-01-05'],
    people: [
      { id: 1, name: 'Ana', weeklyHours: 40, allocated: [40] },
      { id: 2, name: 'Bo', weeklyHours: 40, allocated: [32] },
    ],
  }

  it("changes only that person's capacity and keeps everyone else's object", () => {
    const next = withWeeklyHours(data, 1, 32)
    expect(next.people[0]).toEqual({ id: 1, name: 'Ana', weeklyHours: 32, allocated: [40] })
    expect(next.people[1]).toBe(data.people[1])
  })

  it('returns the same object when the person is not in the range', () => {
    expect(withWeeklyHours(data, 99, 32)).toBe(data)
  })
})
