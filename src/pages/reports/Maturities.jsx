import { useEffect, useMemo, useState } from 'react'
import { addDays } from 'date-fns'
import { policiesAPI } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatINR, fmtDate, toDate } from '../../utils/format'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { ICalendar } from '../../components/ui/icons'

export default function Maturities() {
  const { profile, isSuperAdmin } = useAuth()
  const agentUid = profile?.uid || profile?.id
  const scopeOwn = !isSuperAdmin && (profile?.rank || 0) < 10

  const [window, setWindow] = useState(30)
  const [plansData, setPlansData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    setLoading(true)

    const filters = {}
    if (scopeOwn && agentUid) filters.agentId = agentUid

    policiesAPI.listPolicies(filters)
      .then(res => {
        if (mounted) {
          setPlansData(res || [])
          setLoading(false)
        }
      })
      .catch(err => {
        console.error('Failed to load maturing policies:', err)
        if (mounted) setLoading(false)
      })

    return () => { mounted = false }
  }, [scopeOwn, agentUid])

  const maturing = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const limit = addDays(today, window)
    return plansData
      .filter((p) => {
        if (scopeOwn && p.agentId !== agentUid) return false
        const m = toDate(p.maturityDate)
        return m && m >= today && m <= limit && p.status !== 'closed'
      })
      .sort((a, b) => (toDate(a.maturityDate) - toDate(b.maturityDate)))
  }, [plansData, window, scopeOwn, agentUid])

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-card border border-navy-4 bg-navy-2 p-1">
          {[30, 60, 90].map((d) => (
            <button key={d} type="button" onClick={() => setWindow(d)} className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${window === d ? 'bg-gold-1 text-navy-1' : 'text-ink-2 hover:text-ink-1'}`}>
              {d} days
            </button>
          ))}
        </div>
        <p className="text-sm text-ink-2">{maturing.length} maturing</p>
      </div>

      {loading ? (
        <SkeletonTable rows={8} cols={5} />
      ) : !maturing.length ? (
        <EmptyState icon={<ICalendar size={24} />} title={`No plans maturing in ${window} days`} />
      ) : (
        <div className="table-wrap">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Customer</th><th>Plan</th><th>Maturity Date</th><th>Maturity Amount</th><th>Status</th></tr></thead>
              <tbody>
                {maturing.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium text-ink-1">{p.customerName}<div className="font-mono text-[11px] text-gold">{p.planAccountNumber || p.policyNumber}</div></td>
                    <td className="text-ink-2">{p.type || p.planCode}</td>
                    <td className="text-ink-2">{fmtDate(p.maturityDate)}</td>
                    <td className="font-semibold">{formatINR(p.maturityAmount || 0)}</td>
                    <td><StatusBadge status={p.status} /></td>
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
