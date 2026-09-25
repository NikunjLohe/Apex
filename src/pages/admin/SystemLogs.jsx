import { useEffect, useMemo, useState } from 'react'
import { auditAPI } from '../../lib/supabase'
import { fmtDateTime, formatINR, toDate, fmtDate } from '../../utils/format'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { IClock, IAlert, IDoc } from '../../components/ui/icons'

export default function SystemLogs() {
  const [limitCount, setLimitCount] = useState(100)
  const [auditLogsList, setAuditLogsList] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('audit')

  useEffect(() => {
    let cancelled = false
    async function fetchAuditLogs() {
      setLoading(true)
      try {
        const logs = await auditAPI.listAuditLogs(limitCount)
        if (!cancelled) {
          setAuditLogsList(logs || [])
        }
      } catch (err) {
        console.error('[SystemLogs] Error fetching audit logs:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchAuditLogs()
    return () => { cancelled = true }
  }, [limitCount])

  const auditLogs = useMemo(() => {
    return (auditLogsList || []).map((log) => ({
      id: log.id,
      ts: log.timestamp ? new Date(log.timestamp) : null,
      type: log.type || log.action || 'Audit Event',
      operator: log.performed_by_email || log.performed_by || 'System',
      detail: log.reason || `${log.action || ''} on ${log.target_agent_name || log.target_uid || 'record'}`
    }))
  }, [auditLogsList])

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
                        <td className="font-mono text-ink-2 whitespace-nowrap">{l.ts ? fmtDateTime(l.ts) : '—'}</td>
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

          <div className="flex justify-center pt-4 border-t border-navy-4/50 mt-4">
            <button 
              type="button" 
              onClick={() => setLimitCount(prev => prev + 50)} 
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

