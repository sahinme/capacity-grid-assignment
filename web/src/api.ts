// Types and requests for the capacity API (api/capacity.go, api/people.go).

export type PersonCapacity = {
  id: number
  name: string
  weeklyHours: number
  allocated: number[] // hours per week, same order as CapacityResponse.weeks
}

export type CapacityResponse = {
  from: string // Monday of the first week
  to: string // Sunday of the last week
  weeks: string[] // Monday of each week
  people: PersonCapacity[]
}

export type Person = {
  id: number
  name: string
  weeklyHours: number
}

export class ApiError extends Error {
  // status is 0 when the request never reached the server.
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export const capacityKeys = {
  all: ['capacity'] as const,
  range: (from: string, to: string) => ['capacity', from, to] as const,
}

export function fetchCapacity(from: string, to: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ from, to })
  return request<CapacityResponse>(`/api/capacity?${params}`, { signal })
}

export function updateWeeklyHours(personId: number, weeklyHours: number) {
  return request<Person>(`/api/people/${personId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weeklyHours }),
  })
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch (err) {
    // Let cancellations through untouched so React Query can tell them apart.
    if (init.signal?.aborted) throw err
    throw new ApiError('no connection', 0)
  }
  if (!res.ok) {
    throw new ApiError(await errorMessage(res), res.status)
  }
  return (await res.json()) as T
}

// Short reasons that read well after "Couldn't save 10h". A 4xx carries the
// server's message because the manager can act on it ("weekly hours must be
// between 0 and 168"); anything else is just a server error.
async function errorMessage(res: Response): Promise<string> {
  if (res.status >= 500) return 'server error'
  try {
    const body: unknown = await res.json()
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
      return body.error
    }
  } catch {
    // Not JSON (a proxy error page, for example): fall through.
  }
  return 'request failed'
}
