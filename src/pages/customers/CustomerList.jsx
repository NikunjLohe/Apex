import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePermission, CAP } from '../../hooks/usePermission'
import { useAuth } from '../../contexts/AuthContext'
import { listCustomers } from '../../lib/supabase/customers'
import { fmtDate } from '../../utils/format'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { ISearch, IPlus, IUsers } from '../../components/ui/icons'

export default function CustomerList() {
  const navigate = useNavigate()
  const { can } = usePermission()
  const { profile, isSuperAdmin, isViewingAs } = useAuth()
  
  const [search, setSearch] = useState('')
  const [kyc, setKyc] = useState('all')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Agents (rank < 10) only see customers they enrolled; managers+ see all.
  const scopeOwn = !isSuperAdmin && (profile?.rank || 0) < 10

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    const filters = {}
    if (scopeOwn && profile?.id) {
      filters.enrolledBy = profile.id
    }

    listCustomers(filters)
      .then((customers) => {
        if (!mounted) return
        setData(customers)
        setLoading(false)
      })
      .catch((err) => {
        if (!mounted) return
        console.error('[CustomerList] Failed to load customers:', err)
        setError(err)
        setLoading(false)
      })

    return () => { mounted = false }
  }, [scopeOwn, profile?.id])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return data.filter((c) => {
      if (kyc !== 'all' && (c.kycStatus || 'pending') !== kyc) return false
      if (!q) return true
      return (
        c.name?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.accountNumber?.toLowerCase().includes(q)
      )
    })
  }, [data, search, kyc])

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
        {can(CAP.ONBOARD) && !isViewingAs && (
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
          action={can(CAP.ONBOARD) && !isViewingAs && <Link to="/customers/new" className="btn-gold mt-1"><IPlus size={16} /> New Customer</Link>}
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
        </>
      )}
    </div>
  )
}
