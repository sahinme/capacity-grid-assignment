import { CapacityGrid } from './CapacityGrid'

// The range the grid opens on. The grid widens it to whole weeks (Monday to
// Sunday) and lets the user move or resize it from there.
const FROM = '2025-12-29'
const TO = '2026-01-16'

export function App() {
  return (
    <main>
      <h1>Team capacity</h1>
      <CapacityGrid from={FROM} to={TO} />
    </main>
  )
}
