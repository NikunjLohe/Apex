// Shimmer skeleton primitives + common compositions.
export function SkeletonLine({ className = '' }) {
  return <div className={`skeleton h-4 ${className}`} />
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`card p-5 ${className}`}>
      <div className="skeleton mb-3 h-9 w-9 rounded-lg" />
      <SkeletonLine className="mb-2 w-24" />
      <SkeletonLine className="h-6 w-32" />
    </div>
  )
}

export function SkeletonStats({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 8, cols = 5 }) {
  return (
    <div className="table-wrap p-2">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-2 py-3">
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonLine key={c} className={c === 0 ? 'w-1/4' : 'flex-1'} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonForm({ fields = 6 }) {
  return (
    <div className="card space-y-4 p-6">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i}>
          <SkeletonLine className="mb-2 w-24" />
          <div className="skeleton h-10 w-full" />
        </div>
      ))}
    </div>
  )
}

export default SkeletonLine
