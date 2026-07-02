import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { where, orderBy, limit } from 'firebase/firestore'
import { useCollection } from '../../hooks/useFirestore'
import { usePermission, CAP } from '../../hooks/usePermission'
import { useAuth } from '../../contexts/AuthContext'
import { fmtDate } from '../../utils/format'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { ISearch, IPlus, IUsers, IChevron } from '../../components/ui/icons'

const PAGE_SIZE = 25

export default function CustomerList() {
  const navigate = useNavigate()
  const { can } = usePermission()
  const { profile, isSuperAdmin } = useAuth()
  
  const [search, setSearch] = useState('')
  const [kyc, setKyc] = useState('all')
  const [limitCount, setLimitCount] = useState(PAGE_SIZE)

  // Agents (rank < 10) only see customers they enrolled; managers+ see all.
  const scopeOwn = !isSuperAdmin && (profile?.rank || 0) < 10

  const constraints = useMemo(() => {
    const list = []
    if (scopeOwn) {
      list.push(where('enrolledBy', '==', profile?.uid))
    }
    if (kyc !== 'all') {
      list.push(where('kycStatus', '==', kyc))
    }
    list.push(orderBy('createdAt', 'desc'))
    list.push(limit(limitCount))
    return list
  }, [scopeOwn, profile?.uid, kyc, limitCount])

  const depKey = useMemo(() => {
    return `${scopeOwn ? profile?.uid : 'all'}-${kyc}-${limitCount}`
  }, [scopeOwn, profile?.uid, kyc, limitCount])

  const { data, loading, error } = useCollection('customers', constraints, depKey)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return data.filter((c) => {
      if (!q) return true
      return (
        c.name?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.accountNumber?.toLowerCase().includes(q)
      )
    })
  }, [data, search])

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <ISearch size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setLimitCount(PAGE_SIZE) }}
            placeholder="Search name, phone, account number…"
            className="field pl-10"
          />
        </div>
        <select value={kyc} onChange={(e) => { setKyc(e.target.value); setLimitCount(PAGE_SIZE) }} className="field w-auto">
          <option value="all">All KYC</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
        </select>
        {can(CAP.ONBOARD) && (
          <Link to="/customers/new" className="btn-gold py-2.5 text-sm">
            <IPlus size={16} /> New Customer
          </Link>
        )}
      </div>

      {error ? (
        <EmptyState icon={<IUsers size={26} />} title="Couldn't load customers" message={error.message} />
      ) : loading ? (
        <SkeletonTable rows={8} cols={6} />
      ) : !filtered.length ? (
        <EmptyState
          icon={<IUsers size={26} />}
          title="No customers found"
          message={search || kyc !== 'all' ? 'Try adjusting your search or filters.' : 'Onboard your first customer to get started.'}
          action={can(CAP.ONBOARD) && <Link to="/customers/new" className="btn-gold mt-1"><IPlus size={16} /> New Customer</Link>}
        />
      ) : (
        <>
          <p className="text-xs text-ink-2">{filtered.length} customer{filtered.length === 1 ? '' : 's'}</p>
          <div className="table-wrap">
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Account No.</th>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Plans</th>
                    <th>KYC</th>
                    <th>Enrolled By</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} className="cursor-pointer" onClick={() => navigate(`/customers/${c.id}`)}>
                      <td className="font-mono text-xs text-gold">{c.accountNumber}</td>
                      <td className="font-medium text-ink-1">{c.name}</td>
                      <td className="text-ink-2">{c.phone}</td>
                      <td className="text-ink-2">{c.plansCount || 0}</td>
                      <td><StatusBadge status={c.kycStatus || 'pending'} /></td>
                      <td className="text-ink-2">{c.enrolledByName || '—'}</td>
                      <td className="text-ink-2">{fmtDate(c.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {data.length >= limitCount && (
            <div className="flex items-center justify-center pt-2">
              <button 
                type="button" 
                onClick={() => setLimitCount(prev => prev + PAGE_SIZE)} 
                className="btn-gold px-6 py-2 text-xs font-semibold uppercase tracking-wider"
              >
                Load More Customers
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
