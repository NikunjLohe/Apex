import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCollection } from '../../hooks/useFirestore'
import { usePermission, CAP } from '../../hooks/usePermission'
import { useAuth } from '../../contexts/AuthContext'
import { fmtDate } from '../../utils/format'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { ISearch, IPlus, IUsers, IChevron } from '../../components/ui/icons'

const PAGE_SIZE = 20

export default function CustomerList() {
  const navigate = useNavigate()
  const { can } = usePermission()
  const { profile, isSuperAdmin } = useAuth()
  const { data, loading, error } = useCollection('customers')
  const [search, setSearch] = useState('')
  const [kyc, setKyc] = useState('all')
  const [page, setPage] = useState(1)

  // Agents (rank < 10) only see customers they enrolled; managers+ see all.
  const scopeOwn = !isSuperAdmin && (profile?.rank || 0) < 10

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return data
      .filter((c) => {
        if (scopeOwn && c.enrolledBy !== profile?.uid) return false
        if (kyc !== 'all' && (c.kycStatus || 'pending') !== kyc) return false
        if (!q) return true
        return (
          c.name?.toLowerCase().includes(q) ||
          c.phone?.includes(q) ||
          c.accountNumber?.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => (toMs(b.createdAt) - toMs(a.createdAt)))
  }, [data, search, kyc, scopeOwn, profile?.uid])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <ISearch size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search name, phone, account number…"
            className="field pl-10"
          />
        </div>
        <select value={kyc} onChange={(e) => { setKyc(e.target.value); setPage(1) }} className="field w-auto">
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
                  {pageItems.map((c) => (
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

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button type="button" disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="btn-ghost py-1.5 disabled:opacity-40">
                <IChevron size={16} className="rotate-180" /> Prev
              </button>
              <span className="text-sm text-ink-2">Page {page} of {totalPages}</span>
              <button type="button" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="btn-ghost py-1.5 disabled:opacity-40">
                Next <IChevron size={16} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function toMs(ts) {
  return ts?.toDate ? ts.toDate().getTime() : new Date(ts || 0).getTime()
}
