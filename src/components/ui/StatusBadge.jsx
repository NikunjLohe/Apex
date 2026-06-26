// Pill for various status values across the app.
const STYLES = {
  active: 'border-ok/30 bg-ok/10 text-ok',
  verified: 'border-ok/30 bg-ok/10 text-ok',
  completed: 'border-ok/30 bg-ok/10 text-ok',
  matured: 'border-info/30 bg-info/10 text-info',
  paid: 'border-ok/30 bg-ok/10 text-ok',
  pending: 'border-gold-1/40 bg-gold-1/10 text-gold',
  upcoming: 'border-ink-2/30 bg-ink-2/10 text-ink-2',
  inactive: 'border-ink-2/30 bg-ink-2/10 text-ink-2',
  closed: 'border-ink-2/30 bg-ink-2/10 text-ink-2',
  late: 'border-gold-1/40 bg-gold-1/10 text-gold',
  rejected: 'border-danger/30 bg-danger/10 text-danger',
  bounced: 'border-danger/30 bg-danger/10 text-danger',
  defaulted: 'border-danger/30 bg-danger/10 text-danger',
  overdue: 'border-danger/30 bg-danger/10 text-danger',
}

export default function StatusBadge({ status, label, className = '' }) {
  const key = String(status || '').toLowerCase()
  const style = STYLES[key] || STYLES.inactive
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${style} ${className}`}>
      {label || status || '—'}
    </span>
  )
}
