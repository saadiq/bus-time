// src/app/page.tsx
import BusTracker from '@/components/BusTracker'

export default function Home() {
  return (
    <main className="min-h-screen p-4 md:p-8 bg-gray-100">
      <BusTracker />
    </main>
  )
}
