import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { startOfMonth, startOfDay } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { usePermission, CAP } from '../hooks/usePermission'
import { useCollection } from '../hooks/useFirestore'
import { formatINR, formatCompactINR, fmtDate, toDate } from '../utils/format'
import RankBadge from '../components/ui/RankBadge'
import StatusBadge from '../components/ui/StatusBadge'
import EmptyState from '../components/ui/EmptyState'
import { SkeletonStats, SkeletonTable } from '../components/ui/LoadingSkeleton'
import { IUsers, ICash, IAlert, ICalendar, IPlus } from '../components/ui/icons'

export default function Dashboard() {
  const { profile, isSuperAdmin } = useAuth()
  const { can } = usePermission()

  // Scope data: ranks <10 see their own; managers+/superadmin see branch/all.
  const scopeOwn = !isSuperAdmin && (profile?.rank || 0) < 10
  const agentConstraint = scopeOwn && profile?.uid ? [['agentId', '==', profile.uid]] : []

  const customers = useCollection('customers')
  const plans = useCollection('plans')
  const payments = useCollection('payments')

  const stats = useMemo(() => {
    const today0 = startOfDay(new Date())
    const month0 = startOfMonth(new Date())
    const myPayments = scopeOwn
      ? payments.data.filter((p) => p.agentId === profile?.uid)
      : payments.data
    const myPlans = scopeOwn ? plans.data.filter((p) => p.agentId === profile?.uid) : plans.data

    const todayCollection = myPayments
      .filter((p) => toDate(p.paidDate) >= today0)
      .reduce((s, p) => s + (p.amount || 0), 0)
    const monthCollection = myPayments
      .filter((p) => toDate(p.paidDate) >= month0)
      .reduce((s, p) => s + (p.amount || 0), 0)

    const activePlans = myPlans.filter((p) => p.status === 'active')
    const defaulters = activePlans.filter((p) => {
      const due = toDate(p.nextDueDate)
      return due && due < today0
    })
    const maturingThisMonth = myPlans.filter((p) => {
      const m = toDate(p.maturityDate)
      return m && m >= month0 && m <= new Date(month0.getFullYear(), month0.getMonth() + 1, 0)
    })

    return {
      customers: scopeOwn ? customers.data.filter((c) => c.enrolledBy === profile?.uid).length : customers.data.length,
      activePlans: activePlans.length,
      todayCollection,
      monthCollection,
      defaulters: defaulters.length,
      maturingThisMonth: maturingThisMonth.length,
      recent: [...myPayments].sort((a, b) => (toDate(b.paidDate) || 0) - (toDate(a.paidDate) || 0)).slice(0, 8),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers.data, plans.data, payments.data, scopeOwn, profile?.uid])

  const loading = customers.loading || plans.loading || payments.loading

  const cards = [
    { label: 'Customers', value: stats.customers, icon: <IUsers size={20} />, to: '/customers' },
    { label: 'Active Plans', value: stats.activePlans, icon: <ICalendar size={20} />, to: '/reports/maturities' },
    { label: "Today's Collection", value: formatCompactINR(stats.todayCollection), icon: <ICash size={20} />, to: '/reports/collections' },
    { label: 'This Month', value: formatCompactINR(stats.monthCollection), icon: <ICash size={20} />, to: '/reports/collections' },
    { label: 'Defaulters', value: stats.defaulters, icon: <IAlert size={20} />, to: '/reports/defaulters', danger: stats.defaulters > 0 },
    { label: 'Maturing (month)', value: stats.maturingThisMonth, icon: <ICalendar size={20} />, to: '/reports/maturities' },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Greeting */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-sm text-ink-2">Welcome back,</p>
            <h2 className="text-xl font-bold text-ink-1">{profile?.name || 'Agent'}</h2>
          </div>
          {profile?.rank && <RankBadge rank={profile.rank} />}
        </div>
        <div className="flex gap-2">
          {can(CAP.ONBOARD) && (
            <Link to="/customers/new" className="btn-ghost py-2 text-sm">
              <IPlus size={16} /> New Customer
            </Link>
          )}
          {can(CAP.ONBOARD) && (
            <Link to="/plans/new" className="btn-ghost py-2 text-sm">
              <ICalendar size={16} /> New Plan
            </Link>
          )}
          {can(CAP.COLLECT) && (
            <Link to="/payments/collect" className="btn-gold py-2 text-sm">
              <ICash size={16} /> Collect Payment
            </Link>
          )}
        </div>
      </div>

      {/* Stat cards */}
      {loading ? (
        <SkeletonStats count={6} />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {cards.map((c, i) => (
            <motion.div key={c.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Link to={c.to} className="card card block p-5 transition-colors hover:border-gold-1/50">
                <span className={`flex h-10 w-10 items-center justify-center rounded-card border ${c.danger ? 'border-danger/30 bg-danger/10 text-danger' : 'border-gold-1/20 bg-gold-1/10 text-gold'}`}>
                  {c.icon}
                </span>
                <p className="mt-3 text-sm text-ink-2">{c.label}</p>
                <p className="text-2xl font-bold text-ink-1">{c.value}</p>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      {/* Recent payments */}
      <div>
        <h3 className="mb-3 font-semibold text-ink-1">Recent collections</h3>
        {loading ? (
          <SkeletonTable rows={5} cols={4} />
        ) : stats.recent.length ? (
          <div className="table-wrap">
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Customer</th>
                    <th>Amount</th>
                    <th>Mode</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent.map((p) => (
                    <tr key={p.id}>
                      <td className="font-mono text-xs text-ink-2">{p.receiptNumber}</td>
                      <td className="font-medium text-ink-1">{p.customerName || '—'}</td>
                      <td className="font-semibold">{formatINR(p.amount)}</td>
                      <td className="uppercase text-ink-2">{p.paymentMode}</td>
                      <td className="text-ink-2">{fmtDate(p.paidDate)}</td>
                      <td><StatusBadge status={p.isLate ? 'late' : 'completed'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyState icon={<ICash size={26} />} title="No collections yet" message="Payments you collect will appear here." />
        )}
      </div>
    </div>
  )
}
