// src/app/page.tsx
import BusTracker from '@/components/BusTracker'
import ErrorBoundary from '@/components/ErrorBoundary'

export default function Home() {
  return (
    <main className="min-h-screen p-4 md:p-8">
      <ErrorBoundary>
        <BusTracker />
      </ErrorBoundary>
    </main>
  )
}
