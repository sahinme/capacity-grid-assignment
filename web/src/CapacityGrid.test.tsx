import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CapacityResponse } from './api'
import { CapacityGrid } from './CapacityGrid'

// What the fake server holds. Each test starts from a fresh copy.
const initialGrid: CapacityResponse = {
  from: '2026-01-05',
  to: '2026-01-11',
  weeks: ['2026-01-05'],
  people: [{ id: 4, name: 'Dee Okafor', weeklyHours: 40, allocated: [45] }],
}

let grid: CapacityResponse

function renderGrid(patch: () => Promise<Response>) {
  grid = structuredClone(initialGrid)
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) =>
      init?.method === 'PATCH' ? patch() : Promise.resolve(Response.json(grid)),
    ),
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <CapacityGrid from="2026-01-05" to="2026-01-09" />
    </QueryClientProvider>,
  )
}

async function editWeeklyHours(value: string) {
  fireEvent.click(await screen.findByRole('button', { name: /edit weekly hours for dee okafor/i }))
  fireEvent.change(screen.getByLabelText('Weekly hours for Dee Okafor'), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('editing weekly hours', () => {
  it('recolors the row before the server answers', async () => {
    let answer: (res: Response) => void = () => {}
    renderGrid(() => new Promise((resolve) => (answer = resolve)))

    expect(await screen.findByText('5h over')).toBeInTheDocument() // 45h against 40h
    await editWeeklyHours('50')

    await waitFor(() => expect(screen.queryByText('5h over')).not.toBeInTheDocument())
    expect(screen.getByText(/saving/)).toBeInTheDocument()

    grid.people[0].weeklyHours = 50
    answer(Response.json({ id: 4, name: 'Dee Okafor', weeklyHours: 50 }))
    await waitFor(() => expect(screen.queryByText(/saving/)).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /currently 50h/ })).toBeInTheDocument()
  })

  it('puts the old value back and says so when the save fails', async () => {
    renderGrid(() => Promise.resolve(Response.json({ error: 'could not save weekly hours' }, { status: 500 })))

    await editWeeklyHours('50')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't save 50h (server error). Still 40h.")
    expect(screen.getByRole('button', { name: /currently 40h/ })).toBeInTheDocument()
    expect(screen.getByText('5h over')).toBeInTheDocument()
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
