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
import { IUsers, ICash, IAlert, ICalendar, IPlus, IDoc, IDashboard } from '../components/ui/icons'

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

  const cards = useMemo(() => [
    {
      label: 'Customers',
      value: stats.customers,
      icon: <IUsers size={19} />,
      to: '/customers',
      borderLeftClass: 'border-l-[4.5px] border-l-[#A3906B]',
      iconBgClass: 'bg-[#F9F7F3] border-[#EDE9E0] text-[#A3906B]',
      badge: `No. ${String(stats.customers).padStart(4, '0')}`,
      footerLeft: 'Active accounts',
      footerRight: '+2 this month',
      footerRightColor: 'text-[#C68A4C] font-semibold',
    },
    {
      label: 'Active Plans',
      value: stats.activePlans,
      icon: <IDoc size={19} />,
      to: '/reports/maturities',
      borderLeftClass: 'border-l-[4.5px] border-l-[#8FA382]',
      iconBgClass: 'bg-[#F4F6F2] border-[#E8ECE5] text-[#7A8E6E]',
      badge: `No. ${String(stats.activePlans).padStart(4, '0')}`,
      footerLeft: 'RD & FD combined',
      footerRight: 'All in good standing',
      footerRightColor: 'text-[#8C764D]',
    },
    {
      label: "Today's Collection",
      value: formatINR(stats.todayCollection),
      icon: <IDashboard size={19} />,
      to: '/reports/collections',
      borderLeftClass: 'border-l-[4.5px] border-l-[#8E9CA3]',
      iconBgClass: 'bg-[#F2F5F6] border-[#E5EBEC] text-[#76878E]',
      badge: 'Today',
      footerLeft: '0 receipts logged',
      footerRight: '—',
      footerRightColor: 'text-ink-2',
    },
    {
      label: 'This Month',
      value: formatCompactINR(stats.monthCollection),
      icon: <ICash size={19} />,
      to: '/reports/collections',
      borderLeftClass: 'border-l-[4.5px] border-l-[#D29E6B]',
      iconBgClass: 'bg-[#FAF6F2] border-[#F2ECE5] text-[#BF8955]',
      badge: 'MTD',
      footerLeft: 'vs ₹6.2K last month',
      footerRight: '+21%',
      footerRightColor: 'text-[#A3906B] font-semibold',
    },
    {
      label: 'Defaulters',
      value: stats.defaulters,
      icon: <IAlert size={19} />,
      to: '/reports/defaulters',
      borderLeftClass: 'border-l-[4.5px] border-l-[#C87E7E]',
      iconBgClass: 'bg-[#FAF3F3] border-[#F2E5E5] text-[#B86262]',
      badge: 'Action',
      footerLeft: 'Overdue 7+ days',
      footerRight: 'Needs follow-up',
      footerRightColor: 'text-[#A83B3B] font-semibold',
    },
    {
      label: 'Maturing (month)',
      value: stats.maturingThisMonth,
      icon: <ICalendar size={19} />,
      to: '/reports/maturities',
      borderLeftClass: 'border-l-[4.5px] border-l-[#7EB59E]',
      iconBgClass: 'bg-[#F2FAF6] border-[#E5F2EC] text-[#559E7E]',
      badge: 'Soon',
      footerLeft: 'Plan due for payout',
      footerRight: '—',
      footerRightColor: 'text-ink-2',
    },
  ], [stats])

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Greeting */}
      <div className="flex flex-wrap items-center justify-between gap-4 py-2">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-ink-2">Welcome back,</p>
            <h2 className="font-serif text-2xl sm:text-3xl font-extrabold text-ink-1 mt-0.5 tracking-tight">
              {profile?.name || 'Super Admin'}
            </h2>
          </div>
          {profile?.rank && <RankBadge rank={profile.rank} />}
        </div>
        <div className="flex gap-2.5">
          {can(CAP.ONBOARD) && (
            <Link to="/customers/new" className="btn-ghost py-2 text-sm font-semibold shadow-sm">
              <IPlus size={16} /> New Customer
            </Link>
          )}
          {can(CAP.ONBOARD) && (
            <Link to="/plans/new" className="btn-ghost py-2 text-sm font-semibold shadow-sm">
              <IDoc size={16} /> New Plan
            </Link>
          )}
          {can(CAP.COLLECT) && (
            <Link to="/payments/collect" className="btn-gold py-2 text-sm font-semibold shadow-sm">
              <IDashboard size={16} /> Collect Payment
            </Link>
          )}
        </div>
      </div>

      {/* Stat cards */}
      {loading ? (
        <SkeletonStats count={6} />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c, i) => (
            <motion.div key={c.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Link to={c.to} className={`card block p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md relative overflow-hidden flex flex-col justify-between h-48 ${c.borderLeftClass}`}>
                <div>
                  <div className="flex items-center justify-between">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-[8px] border ${c.iconBgClass}`}>
                      {c.icon}
                    </span>
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full border border-navy-4/80 bg-navy-1 text-ink-2 font-bold tracking-wide">
                      {c.badge}
                    </span>
                  </div>
                  <p className="mt-4 text-xs font-medium text-ink-2/80 tracking-wide">{c.label}</p>
                  <p className="text-3xl font-bold font-serif text-ink-1 mt-1 leading-none">{c.value}</p>
                </div>
                <div>
                  <div className="border-t border-dashed border-navy-4/80 my-2.5" />
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-ink-2 font-medium">{c.footerLeft}</span>
                    <span className={c.footerRightColor}>{c.footerRight}</span>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      {/* Recent payments */}
      <div className="pt-2">
        <div className="flex items-center justify-between mb-3.5">
          <h3 className="font-serif text-xl font-bold text-ink-1 tracking-tight">Recent Collections</h3>
          <Link to="/reports/collections" className="text-xs font-bold text-[#8D7952] hover:text-gold-2 flex items-center gap-1">
            View all &rarr;
          </Link>
        </div>
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
                      <td className="font-semibold text-ink-1">{formatINR(p.amount)}</td>
                      <td className="uppercase text-ink-2 text-xs font-semibold">{p.paymentMode}</td>
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
