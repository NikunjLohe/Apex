import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { limit } from 'firebase/firestore'
import { useCollection } from '../../hooks/useFirestore'
import { fmtDateTime, formatINR, toDate, fmtDate } from '../../utils/format'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { IClock, IAlert, IDoc } from '../../components/ui/icons'

export default function SystemLogs() {
  const [limitCount, setLimitCount] = useState(25)
  const constraints = useMemo(() => [limit(limitCount)], [limitCount])
  const depKey = String(limitCount)

  // Load collections
  const payments = useCollection('payments', constraints, depKey)
  const customers = useCollection('customers', constraints, depKey)
  const plans = useCollection('plans', constraints, depKey)
  const imports = useCollection('imports', constraints, depKey)
  const payouts = useCollection('payouts', constraints, depKey)

  const [activeTab, setActiveTab] = useState('audit')

  const loading = payments.loading || customers.loading || plans.loading || imports.loading || payouts.loading

  // 1. Audit Trail logs calculation
  const auditLogs = useMemo(() => {
    if (loading) return []
    const events = []
    
    payments.data.forEach((p) => {
      events.push({
        id: `pay-${p.id}`,
        ts: toDate(p.createdAt) || toDate(p.paidDate),
        type: 'Collection Payment',
        operator: p.agentName || 'System',
        detail: `Collected premium of ${formatINR(p.amount)} from customer ${p.customerName} (Receipt: ${p.receiptNumber})`
      })
    })

    customers.data.forEach((c) => {
      events.push({
        id: `cust-${c.id}`,
        ts: toDate(c.createdAt),
        type: 'Client Enrolled',
        operator: c.enrolledByName || 'System',
        detail: `Onboarded verification folder for customer ${c.name} (CIF Account: ${c.customerId})`
      })
    })

    plans.data.forEach((p) => {
      events.push({
        id: `plan-${p.id}`,
        ts: toDate(p.createdAt),
        type: 'Policy Created',
        operator: p.agentName || 'System',
        detail: `Registered ${p.type} savings plan policy account ${p.policyNumber} (Maturity: ${p.duration} Years)`
      })
    })

    payouts.data.forEach((p) => {
      events.push({
        id: `payo-${p.id}`,
        ts: toDate(p.generatedDate),
        type: 'Payout Calculated',
        operator: 'Payout Engine',
        detail: `Generated monthly commission calculation for ${p.agentName} (Period: ${p.month}/${p.year}, Net: ${formatINR(p.totalPayable)})`
      })
    })

    return events.filter(e => e.ts).sort((a, b) => b.ts - a.ts)
  }, [payments.data, customers.data, plans.data, payouts.data, loading])

  // 2. Error and Diagnostics log list
  const errorLogs = useMemo(() => {
    if (loading) return []
    const errors = []

    imports.data.forEach(imp => {
      if (imp.failedRows > 0) {
        errors.push({
          id: `imp-err-${imp.id}`,
          ts: toDate(imp.importDate),
          type: 'Import Excel Error',
          operator: 'Excel Parser',
          detail: `File '${imp.fileName}' had ${imp.failedRows} rows fail validation. Check imports history logs for row-by-row diagnostics.`
        })
      }
    })

    return errors.sort((a, b) => b.ts - a.ts)
  }, [imports.data, loading])

  const TYPE_CLASSES = {
    'Collection Payment': 'text-ok font-bold',
    'Client Enrolled': 'text-info font-bold',
    'Policy Created': 'text-gold font-bold',
    'Payout Calculated': 'text-gold-1 font-bold',
    'Import Excel Error': 'text-danger font-bold'
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Title */}
      <div className="flex justify-between items-center border-b border-navy-4/50 pb-4">
        <div>
          <h2 className="font-serif text-2xl font-bold text-ink-1 tracking-tight">System Audit & Logs Workspace</h2>
          <p className="text-xs text-ink-2">Verify operational audit trails, examine data parse diagnostics, and list upload session records.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-navy-4">
        <button 
          onClick={() => setActiveTab('audit')}
          className={`pb-2.5 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
            activeTab === 'audit' 
              ? 'border-gold text-gold-1' 
              : 'border-transparent text-ink-2 hover:text-ink-1'
          }`}
        >
          Operational Audit Trail ({auditLogs.length})
        </button>
        <button 
          onClick={() => setActiveTab('errors')}
          className={`pb-2.5 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
            activeTab === 'errors' 
              ? 'border-gold text-gold-1' 
              : 'border-transparent text-ink-2 hover:text-ink-1'
          }`}
        >
          Data Error Diagnostics ({errorLogs.length})
        </button>
        <button 
          onClick={() => setActiveTab('imports')}
          className={`pb-2.5 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
            activeTab === 'imports' 
              ? 'border-gold text-gold-1' 
              : 'border-transparent text-ink-2 hover:text-ink-1'
          }`}
        >
          Import Session Log ({imports.data.length})
        </button>
      </div>

      {/* Loading Skeleton */}
      {loading ? (
        <SkeletonTable rows={8} cols={4} />
      ) : (
        <div className="card p-5">
          
          {/* Audit Tab */}
          {activeTab === 'audit' && (
            auditLogs.length === 0 ? (
              <EmptyState icon={<IClock size={24} />} title="Audit trail empty" message="No operational actions have been captured yet." />
            ) : (
              <div className="table-wrap">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th>Time Logged</th>
                      <th>Activity Event</th>
                      <th>Operator</th>
                      <th>Operational Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map(l => (
                      <tr key={l.id}>
                        <td className="font-mono text-ink-2 whitespace-nowrap">{fmtDateTime(l.ts)}</td>
                        <td><span className={TYPE_CLASSES[l.type] || 'text-ink-1'}>{l.type}</span></td>
                        <td className="text-ink-2 font-medium">{l.operator}</td>
                        <td className="text-ink-1 leading-relaxed">{l.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* Errors Tab */}
          {activeTab === 'errors' && (
            errorLogs.length === 0 ? (
              <EmptyState icon={<IAlert size={24} />} title="No system errors logged" message="Excellent! All imported rows and payout processes ran smoothly." />
            ) : (
              <div className="table-wrap">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th>Time Logged</th>
                      <th>Error Type</th>
                      <th>Module</th>
                      <th>Diagnostic Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorLogs.map(l => (
                      <tr key={l.id}>
                        <td className="font-mono text-ink-2 whitespace-nowrap">{fmtDateTime(l.ts)}</td>
                        <td><span className="text-danger font-bold uppercase">{l.type}</span></td>
                        <td className="text-ink-2 font-semibold">{l.operator}</td>
                        <td className="text-danger leading-relaxed font-semibold">{l.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* Import Sessions Tab */}
          {activeTab === 'imports' && (
            imports.data.length === 0 ? (
              <EmptyState icon={<IDoc size={24} />} title="No uploads history" message="Onboard bank data using the Excel Import Center." />
            ) : (
              <div className="table-wrap">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th>Upload Date</th>
                      <th>Excel Filename</th>
                      <th>Onboarded Rows</th>
                      <th>Failed Validation</th>
                      <th>Total Scanned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {imports.data.map(imp => (
                      <tr key={imp.id}>
                        <td className="font-mono text-ink-2">{imp.importDate ? fmtDate(imp.importDate) : '—'}</td>
                        <td className="font-semibold text-ink-1 font-mono">{imp.fileName}</td>
                        <td className="text-ok font-bold font-mono">{imp.successRows}</td>
                        <td className={imp.failedRows > 0 ? 'text-danger font-bold font-mono' : 'text-ink-2 font-mono'}>
                          {imp.failedRows}
                        </td>
                        <td className="font-mono font-semibold text-ink-1">{imp.totalRows}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          <div className="flex justify-center pt-4 border-t border-navy-4/50 mt-4">
            <button 
              type="button" 
              onClick={() => setLimitCount(prev => prev + 25)} 
              className="btn-gold py-2 px-6 text-xs font-semibold uppercase tracking-wider"
            >
              Load More Activity Logs
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
