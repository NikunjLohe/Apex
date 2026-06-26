import { useMemo } from 'react'
import { where } from 'firebase/firestore'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../contexts/AuthContext'
import { formatINR, fmtDate, toDate, daysBetween } from '../../utils/format'
import { shareWhatsApp, reminderMessage } from '../../lib/whatsapp'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { IAlert, IWhatsapp } from '../../components/ui/icons'

export default function Defaulters() {
  const plans = useCollection('plans', [where('status', '==', 'active')], 'def-plans')
  const { profile, isSuperAdmin } = useAuth()
  const scopeOwn = !isSuperAdmin && (profile?.rank || 0) < 10

  const defaulters = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return plans.data
      .filter((p) => {
        if (scopeOwn && p.agentId !== profile?.uid) return false
        const due = toDate(p.nextDueDate)
        return due && due < today
      })
      .map((p) => ({ ...p, daysOverdue: daysBetween(today, toDate(p.nextDueDate)), amountDue: p.monthlyAmount || p.fdAmount || 0 }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
  }, [plans.data, scopeOwn, profile?.uid])

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="card flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-card border border-danger/30 bg-danger/10 text-danger"><IAlert size={20} /></span>
          <div>
            <p className="text-sm text-ink-2">Total overdue installments</p>
            <p className="text-xl font-bold text-ink-1">{defaulters.length}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-ink-2">Amount due</p>
          <p className="text-xl font-bold text-danger">{formatINR(defaulters.reduce((s, d) => s + d.amountDue, 0))}</p>
        </div>
      </div>

      {plans.loading ? (
        <SkeletonTable rows={8} cols={6} />
      ) : !defaulters.length ? (
        <EmptyState icon={<IAlert size={24} />} title="No defaulters" message="All active plans are up to date. 🎉" />
      ) : (
        <div className="table-wrap">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Customer</th><th>Plan</th><th>Due Date</th><th>Days Overdue</th><th>Amount Due</th><th>Agent</th><th></th></tr></thead>
              <tbody>
                {defaulters.map((d) => (
                  <tr key={d.id}>
                    <td className="font-medium text-ink-1">{d.customerName}<div className="font-mono text-[11px] text-gold">{d.customerAccount}</div></td>
                    <td className="text-ink-2">{d.type}</td>
                    <td className="text-ink-2">{fmtDate(d.nextDueDate)}</td>
                    <td><span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-bold text-danger">{d.daysOverdue}d</span></td>
                    <td className="font-semibold">{formatINR(d.amountDue)}</td>
                    <td className="text-ink-2">{d.agentName || '—'}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => shareWhatsApp(reminderMessage({ name: d.customerName, amount: d.amountDue, planAccount: d.planAccountNumber, dueDate: d.nextDueDate, agentName: d.agentName }), null)}
                        className="inline-flex items-center gap-1.5 rounded-card border border-ok/30 px-2.5 py-1.5 text-xs font-semibold text-ok hover:bg-ok/10"
                      >
                        <IWhatsapp size={15} /> Remind
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
