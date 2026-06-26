import { useMemo, useState } from 'react'
import { format, startOfMonth } from 'date-fns'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../contexts/AuthContext'
import { formatINR, formatCompactINR, fmtDate, toDate } from '../../utils/format'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonStats, SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { IReport } from '../../components/ui/icons'

export default function Collections() {
  const payments = useCollection('payments')
  const { profile, isSuperAdmin } = useAuth()
  const scopeOwn = !isSuperAdmin && (profile?.rank || 0) < 10
  const [from, setFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [mode, setMode] = useState('all')

  const filtered = useMemo(() => {
    const f = new Date(from); f.setHours(0, 0, 0, 0)
    const t = new Date(to); t.setHours(23, 59, 59, 999)
    return payments.data.filter((p) => {
      if (scopeOwn && p.agentId !== profile?.uid) return false
      const d = toDate(p.paidDate)
      if (!d || d < f || d > t) return false
      if (mode !== 'all' && p.paymentMode !== mode) return false
      return true
    })
  }, [payments.data, from, to, mode, scopeOwn, profile?.uid])

  const summary = useMemo(() => {
    const total = filtered.reduce((s, p) => s + (p.amount || 0), 0)
    const byMode = { cash: 0, upi: 0, cheque: 0 }
    filtered.forEach((p) => { byMode[p.paymentMode] = (byMode[p.paymentMode] || 0) + (p.amount || 0) })
    // group by day for chart
    const byDay = {}
    filtered.forEach((p) => {
      const k = format(toDate(p.paidDate), 'dd MMM')
      byDay[k] = (byDay[k] || 0) + (p.amount || 0)
    })
    const chart = Object.entries(byDay).map(([day, amount]) => ({ day, amount: Math.round(amount) }))
    return { total, count: filtered.length, byMode, chart }
  }, [filtered])

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Filters */}
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div><label className="label">From</label><input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="label">To</label><input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div><label className="label">Mode</label>
          <select className="field" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="all">All modes</option><option value="cash">Cash</option><option value="upi">UPI</option><option value="cheque">Cheque</option>
          </select>
        </div>
      </div>

      {payments.loading ? (
        <SkeletonStats count={4} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Total Collected" value={formatINR(summary.total)} highlight />
            <Stat label="Payments" value={summary.count} />
            <Stat label="Cash" value={formatCompactINR(summary.byMode.cash || 0)} />
            <Stat label="UPI + Cheque" value={formatCompactINR((summary.byMode.upi || 0) + (summary.byMode.cheque || 0))} />
          </div>

          {summary.chart.length > 0 && (
            <div className="card p-5">
              <h3 className="mb-3 font-semibold text-ink-1">Daily collection</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.chart} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#232D42" />
                    <XAxis dataKey="day" stroke="#94A3B8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} tickFormatter={formatCompactINR} width={60} />
                    <Tooltip content={<TT />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                    <Bar dataKey="amount" fill="#C9980A" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {filtered.length ? (
            <div className="table-wrap">
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead><tr><th>Receipt</th><th>Customer</th><th>Amount</th><th>Mode</th><th>Agent</th><th>Date</th></tr></thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr key={p.id}>
                        <td className="font-mono text-xs text-ink-2">{p.receiptNumber}</td>
                        <td className="font-medium text-ink-1">{p.customerName}</td>
                        <td className="font-semibold">{formatINR(p.amount)}</td>
                        <td className="uppercase text-ink-2">{p.paymentMode}</td>
                        <td className="text-ink-2">{p.agentName || '—'}</td>
                        <td className="text-ink-2">{fmtDate(p.paidDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyState icon={<IReport size={24} />} title="No collections in this range" />
          )}
        </>
      )}
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
function TT({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return <div className="rounded-card border border-gold-1/30 bg-navy-3 px-3 py-2 text-xs"><p className="text-ink-2">{label}</p><p className="font-semibold text-ink-1">{formatINR(payload[0].value)}</p></div>
}
