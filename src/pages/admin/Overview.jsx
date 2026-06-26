import { useMemo } from 'react'
import { startOfMonth, startOfDay } from 'date-fns'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { useCollection } from '../../hooks/useFirestore'
import { formatINR, formatCompactINR, fmtDateTime, toDate } from '../../utils/format'
import StatusBadge from '../../components/ui/StatusBadge'
import { SkeletonStats } from '../../components/ui/LoadingSkeleton'
import { IUsers, ICalendar, ICash, IAlert } from '../../components/ui/icons'

export default function Overview() {
  const customers = useCollection('customers')
  const plans = useCollection('plans')
  const payments = useCollection('payments')
  const members = useCollection('users')
  const branches = useCollection('branches')

  const loading = customers.loading || plans.loading || payments.loading

  const data = useMemo(() => {
    const today0 = startOfDay(new Date())
    const month0 = startOfMonth(new Date())
    const monthEnd = new Date(month0.getFullYear(), month0.getMonth() + 1, 0, 23, 59, 59)

    const todayCollection = payments.data.filter((p) => toDate(p.paidDate) >= today0).reduce((s, p) => s + (p.amount || 0), 0)
    const monthCollection = payments.data.filter((p) => toDate(p.paidDate) >= month0).reduce((s, p) => s + (p.amount || 0), 0)
    const activePlans = plans.data.filter((p) => p.status === 'active')
    const defaulters = activePlans.filter((p) => { const d = toDate(p.nextDueDate); return d && d < today0 })
    const maturingThisMonth = plans.data.filter((p) => { const m = toDate(p.maturityDate); return m && m >= month0 && m <= monthEnd })

    // Branch-wise collection (this month)
    const branchMap = {}
    payments.data.filter((p) => toDate(p.paidDate) >= month0).forEach((p) => {
      branchMap[p.branchId || 'unknown'] = (branchMap[p.branchId || 'unknown'] || 0) + (p.amount || 0)
    })
    const branchChart = Object.entries(branchMap).map(([bid, amount]) => ({
      name: branches.data.find((b) => b.id === bid)?.name || 'Unassigned',
      amount: Math.round(amount),
    }))

    // Agent leaderboard (this month)
    const agentMap = {}
    payments.data.filter((p) => toDate(p.paidDate) >= month0).forEach((p) => {
      const k = p.agentId || 'unknown'
      if (!agentMap[k]) agentMap[k] = { name: p.agentName || 'Unknown', amount: 0, count: 0 }
      agentMap[k].amount += p.amount || 0
      agentMap[k].count += 1
    })
    const leaderboard = Object.values(agentMap).sort((a, b) => b.amount - a.amount).slice(0, 10)

    const recent = [...payments.data].sort((a, b) => (toDate(b.paidDate) || 0) - (toDate(a.paidDate) || 0)).slice(0, 20)

    return {
      totalCustomers: customers.data.length,
      activePlans: activePlans.length,
      todayCollection, monthCollection,
      defaulters: defaulters.length,
      maturingThisMonth: maturingThisMonth.length,
      members: members.data.length,
      branchChart, leaderboard, recent,
    }
  }, [customers.data, plans.data, payments.data, members.data, branches.data])

  if (loading) return <div className="mx-auto max-w-6xl space-y-5"><SkeletonStats count={6} /></div>

  const cards = [
    { label: 'Total Customers', value: data.totalCustomers, icon: <IUsers size={20} /> },
    { label: 'Active Plans', value: data.activePlans, icon: <ICalendar size={20} /> },
    { label: "Today's Collection", value: formatCompactINR(data.todayCollection), icon: <ICash size={20} /> },
    { label: 'Month Collection', value: formatCompactINR(data.monthCollection), icon: <ICash size={20} /> },
    { label: 'Defaulters', value: data.defaulters, icon: <IAlert size={20} />, danger: true },
    { label: 'Maturing (month)', value: data.maturingThisMonth, icon: <ICalendar size={20} /> },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="card p-5">
            <span className={`flex h-10 w-10 items-center justify-center rounded-card border ${c.danger ? 'border-danger/30 bg-danger/10 text-danger' : 'border-gold-1/20 bg-gold-1/10 text-gold'}`}>{c.icon}</span>
            <p className="mt-3 text-sm text-ink-2">{c.label}</p>
            <p className="text-2xl font-bold text-ink-1">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Branch chart */}
        <div className="card p-5">
          <h3 className="mb-3 font-semibold text-ink-1">Branch collections (this month)</h3>
          {data.branchChart.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.branchChart} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#232D42" />
                  <XAxis dataKey="name" stroke="#94A3B8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} tickFormatter={formatCompactINR} width={56} />
                  <Tooltip content={<TT />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                  <Bar dataKey="amount" fill="#C9980A" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty />}
        </div>

        {/* Leaderboard */}
        <div className="card p-5">
          <h3 className="mb-3 font-semibold text-ink-1">Agent leaderboard (this month)</h3>
          {data.leaderboard.length ? (
            <ul className="space-y-2">
              {data.leaderboard.map((a, i) => (
                <li key={i} className="flex items-center gap-3 rounded-card border border-navy-4/60 bg-navy-2/50 px-3 py-2">
                  <span className="w-5 text-center text-sm font-bold text-gold">{i + 1}</span>
                  <span className="flex-1 truncate text-sm text-ink-1">{a.name}</span>
                  <span className="text-xs text-ink-2">{a.count} pmts</span>
                  <span className="w-24 text-right text-sm font-semibold text-ink-1">{formatCompactINR(a.amount)}</span>
                </li>
              ))}
            </ul>
          ) : <Empty />}
        </div>
      </div>

      {/* Recent activity */}
      <div className="card p-5">
        <h3 className="mb-3 font-semibold text-ink-1">Recent activity</h3>
        {data.recent.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Receipt</th><th>Customer</th><th>Amount</th><th>Agent</th><th>When</th><th>Status</th></tr></thead>
              <tbody>
                {data.recent.map((p) => (
                  <tr key={p.id}>
                    <td className="font-mono text-xs text-ink-2">{p.receiptNumber}</td>
                    <td className="font-medium text-ink-1">{p.customerName}</td>
                    <td className="font-semibold">{formatINR(p.amount)}</td>
                    <td className="text-ink-2">{p.agentName || '—'}</td>
                    <td className="text-ink-2">{fmtDateTime(p.paidDate)}</td>
                    <td><StatusBadge status={p.isLate ? 'late' : 'completed'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty />}
      </div>
    </div>
  )
}

function TT({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return <div className="rounded-card border border-gold-1/30 bg-navy-3 px-3 py-2 text-xs"><p className="text-ink-2">{label}</p><p className="font-semibold text-ink-1">{formatINR(payload[0].value)}</p></div>
}
function Empty() {
  return <div className="flex h-48 items-center justify-center text-sm text-ink-2">No data yet.</div>
}
