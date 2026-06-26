import { useMemo, useState } from 'react'
import { format, startOfMonth } from 'date-fns'
import { useCollection } from '../../hooks/useFirestore'
import { formatINR, formatCompactINR, toDate } from '../../utils/format'
import { ALL_PLANS } from '../../data/compensation'

export default function AllReports() {
  const payments = useCollection('payments')
  const plans = useCollection('plans')
  const customers = useCollection('customers')
  const [from, setFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'))

  const report = useMemo(() => {
    const f = new Date(from); f.setHours(0, 0, 0, 0)
    const t = new Date(to); t.setHours(23, 59, 59, 999)
    const inRange = payments.data.filter((p) => { const d = toDate(p.paidDate); return d && d >= f && d <= t })
    const total = inRange.reduce((s, p) => s + (p.amount || 0), 0)
    const planTypeCounts = ALL_PLANS.map((type) => ({ type, count: plans.data.filter((p) => p.type === type).length })).filter((x) => x.count)
    const byStatus = ['active', 'matured', 'closed', 'defaulted'].map((s) => ({ s, n: plans.data.filter((p) => (p.status || 'active') === s).length }))
    return { count: inRange.length, total, planTypeCounts, byStatus }
  }, [payments.data, plans.data, from, to])

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div><label className="label">From</label><input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="label">To</label><input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Collections (range)" value={formatINR(report.total)} highlight />
        <Stat label="Payments (range)" value={report.count} />
        <Stat label="Total Customers" value={customers.data.length} />
        <Stat label="Total Plans" value={plans.data.length} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-3 font-semibold text-ink-1">Plans by type</h3>
          <div className="space-y-2">
            {report.planTypeCounts.length ? report.planTypeCounts.map((x) => (
              <div key={x.type} className="flex items-center justify-between rounded-card border border-navy-4/60 bg-navy-2/50 px-3 py-2 text-sm">
                <span className="text-ink-1">{x.type}</span><span className="font-semibold text-gold">{x.count}</span>
              </div>
            )) : <p className="text-sm text-ink-2">No plans yet.</p>}
          </div>
        </div>
        <div className="card p-5">
          <h3 className="mb-3 font-semibold text-ink-1">Plans by status</h3>
          <div className="space-y-2">
            {report.byStatus.map((x) => (
              <div key={x.s} className="flex items-center justify-between rounded-card border border-navy-4/60 bg-navy-2/50 px-3 py-2 text-sm">
                <span className="capitalize text-ink-1">{x.s}</span><span className="font-semibold text-ink-1">{x.n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, highlight }) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wider text-ink-2">{label}</p>
      <p className={`mt-1 text-xl font-bold ${highlight ? 'text-gold' : 'text-ink-1'}`}>{value}</p>
    </div>
  )
}
