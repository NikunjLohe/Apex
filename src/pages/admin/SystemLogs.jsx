import { useMemo } from 'react'
import { useCollection } from '../../hooks/useFirestore'
import { fmtDateTime, formatINR, toDate } from '../../utils/format'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { IClock } from '../../components/ui/icons'

// Activity log derived from payments + customer + plan creation events.
export default function SystemLogs() {
  const payments = useCollection('payments')
  const customers = useCollection('customers')
  const plans = useCollection('plans')

  const loading = payments.loading || customers.loading || plans.loading

  const logs = useMemo(() => {
    const events = []
    payments.data.forEach((p) => events.push({ id: `pay-${p.id}`, ts: toDate(p.createdAt) || toDate(p.paidDate), type: 'Payment', who: p.agentName, detail: `${formatINR(p.amount)} from ${p.customerName} (${p.receiptNumber})` }))
    customers.data.forEach((c) => events.push({ id: `cust-${c.id}`, ts: toDate(c.createdAt), type: 'Customer', who: c.enrolledByName, detail: `Onboarded ${c.name} (${c.accountNumber})` }))
    plans.data.forEach((p) => events.push({ id: `plan-${p.id}`, ts: toDate(p.createdAt), type: 'Plan', who: p.agentName, detail: `${p.type} for ${p.customerName} (${p.planAccountNumber})` }))
    return events.filter((e) => e.ts).sort((a, b) => b.ts - a.ts).slice(0, 100)
  }, [payments.data, customers.data, plans.data])

  const TYPE = { Payment: 'text-ok', Customer: 'text-info', Plan: 'text-gold' }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {loading ? (
        <SkeletonTable rows={10} cols={4} />
      ) : !logs.length ? (
        <EmptyState icon={<IClock size={24} />} title="No activity yet" />
      ) : (
        <div className="table-wrap">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Time</th><th>Type</th><th>By</th><th>Detail</th></tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap text-ink-2">{fmtDateTime(l.ts)}</td>
                    <td><span className={`text-xs font-bold ${TYPE[l.type]}`}>{l.type}</span></td>
                    <td className="text-ink-2">{l.who || '—'}</td>
                    <td className="text-ink-1">{l.detail}</td>
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
