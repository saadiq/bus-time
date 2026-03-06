// src/app/page.tsx
import BusTracker from '@/components/BusTracker'
import ErrorBoundary from '@/components/ErrorBoundary'

export default function Home() {
  return (
    <main className="min-h-screen p-4 bg-[var(--bg-card)]">
      <ErrorBoundary>
        <BusTracker />
      </ErrorBoundary>
    </main>
  )
}
