// Labeled field wrapper for forms (works with RHF register).
export function Field({ label, required, error, children, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <label className="label">
          {label} {required && <span className="text-gold">*</span>}
        </label>
      )}
      {children}
      {error && <p className="err">{error.message || String(error)}</p>}
    </div>
  )
}

export function SectionTitle({ children, hint }) {
  return (
    <div className="mb-3 mt-1 flex items-center justify-between border-b border-navy-4 pb-2">
      <h3 className="text-sm font-bold uppercase tracking-wider text-gold">{children}</h3>
      {hint && <span className="text-xs text-ink-2">{hint}</span>}
    </div>
  )
}

export function StatCard({ label, value, icon, accent = 'gold' }) {
  const styles = {
    gold: 'border-gold-1/20 bg-gold-1/10 text-gold',
    ok: 'border-ok/20 bg-ok/10 text-ok',
    info: 'border-info/20 bg-info/10 text-info',
    danger: 'border-danger/20 bg-danger/10 text-danger',
  }
  return (
    <div className="card p-4">
      {icon && <span className={`flex h-10 w-10 items-center justify-center rounded-card border ${styles[accent]}`}>{icon}</span>}
      <p className="mt-3 text-sm text-ink-2">{label}</p>
      <p className="text-2xl font-bold text-ink-1">{value}</p>
    </div>
  )
}
