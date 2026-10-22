import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { capacityKeys, updateWeeklyHours, type CapacityResponse } from './api'
import { withWeeklyHours } from './capacity'

const mutationKey = ['updateWeeklyHours'] as const

type Variables = { weeklyHours: number; previous: number }

// Saving a person's weekly hours:
// 1. Optimistic: the new number goes into every cached range at once, so the
//    row's cells re-color before the request returns.
// 2. Success: the server's value replaces the optimistic one.
// 3. Failure: only this person's number is put back. Restoring a snapshot of
//    the whole grid would also undo other people's edits that are in flight.
// 4. Afterwards the visible range is refetched once to pick up anything the
//    cache can't know (another manager's edit, a save that failed after it
//    committed). It's skipped while other saves are pending, so a refetch
//    can't overwrite their optimistic values with stale ones.
export function useUpdateWeeklyHours(personId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey,
    mutationFn: ({ weeklyHours }: Variables) => updateWeeklyHours(personId, weeklyHours),
    onMutate: async ({ weeklyHours }) => {
      // A capacity request already in flight was read before this save and
      // would land the old number on top of the new one.
      await queryClient.cancelQueries({ queryKey: capacityKeys.all })
      setWeeklyHours(queryClient, personId, weeklyHours)
    },
    onSuccess: (person) => {
      setWeeklyHours(queryClient, person.id, person.weeklyHours)
    },
    onError: (_error, { previous }) => {
      setWeeklyHours(queryClient, personId, previous)
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey }) === 1) {
        void queryClient.invalidateQueries({ queryKey: capacityKeys.all })
      }
    },
  })
}

function setWeeklyHours(queryClient: QueryClient, personId: number, weeklyHours: number) {
  queryClient.setQueriesData<CapacityResponse>(
    { queryKey: capacityKeys.all },
    (data) => data && withWeeklyHours(data, personId, weeklyHours),
  )
}
