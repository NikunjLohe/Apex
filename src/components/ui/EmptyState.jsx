/** Friendly empty state with optional action. */
export default function EmptyState({ icon, title = 'Nothing here yet', message, action, className = '' }) {
  return (
    <div className={`card flex flex-col items-center justify-center gap-3 px-6 py-14 text-center ${className}`}>
      {icon && (
        <span className="flex h-14 w-14 items-center justify-center rounded-card border border-gold-1/30 bg-navy-2 text-gold">
          {icon}
        </span>
      )}
      <div>
        <h3 className="font-semibold text-ink-1">{title}</h3>
        {message && <p className="mt-1 max-w-sm text-sm text-ink-2">{message}</p>}
      </div>
      {action}
    </div>
  )
}
