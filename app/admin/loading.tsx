/* Shown by Next.js App Router while the server component fetches data */

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`rounded-xl animate-pulse ${className ?? ''}`}
      style={{ background: 'rgba(255,255,255,0.05)' }}
    />
  )
}

export default function AdminLoading() {
  return (
    <div className="min-h-screen" style={{ background: '#050510' }}>
      {/* Header skeleton */}
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-3">
          <Skeleton className="w-8 h-8" />
          <Skeleton className="w-32 h-4" />
        </div>
        <Skeleton className="w-24 h-6" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Title */}
        <div className="mb-8">
          <Skeleton className="w-48 h-7 mb-2" />
          <Skeleton className="w-72 h-4" />
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="rounded-2xl p-5 flex flex-col gap-3"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <div className="flex items-center justify-between">
                <Skeleton className="w-20 h-3" />
                <Skeleton className="w-8 h-8" />
              </div>
              <div>
                <Skeleton className="w-16 h-8 mb-1.5" />
                <Skeleton className="w-24 h-3" />
              </div>
            </div>
          ))}
        </div>

        {/* Table card */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          {/* Controls skeleton */}
          <div
            className="flex items-center gap-3 px-5 py-4"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <Skeleton className="w-64 h-10" />
            <div className="flex gap-2">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="w-16 h-8" />)}
            </div>
          </div>

          {/* Table header */}
          <div style={{ minWidth: '780px' }}>
            <div
              className="grid px-5 py-3 gap-4"
              style={{
                gridTemplateColumns: '220px 200px 140px 1fr 140px 120px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              {['Lead', 'Email', 'Phone', 'Message', 'Submitted', 'Status'].map(col => (
                <Skeleton key={col} className="h-3 w-14" />
              ))}
            </div>

            {/* Table rows */}
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="grid px-5 py-3.5 gap-4 items-center"
                style={{
                  gridTemplateColumns: '220px 200px 140px 1fr 140px 120px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  opacity: 1 - i * 0.08,
                }}
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="w-8 h-8 flex-shrink-0" />
                  <div className="flex-1">
                    <Skeleton className="h-3.5 w-28 mb-1.5" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-full max-w-[160px]" />
                <div>
                  <Skeleton className="h-3 w-16 mb-1.5" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
