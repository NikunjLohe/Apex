import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../contexts/AuthContext'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import { ISearch, IPlus, IUsers } from '../../components/ui/icons'

/**
 * Entry point for enrolling a customer into a new RD/FD plan.
 * Pick a customer → continue to the enrollment form.
 */
export default function PlanStart() {
  const navigate = useNavigate()
  const { profile, isSuperAdmin } = useAuth()
  const customers = useCollection('customers')
  const [search, setSearch] = useState('')

  const scopeOwn = !isSuperAdmin && (profile?.rank || 0) < 10

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    return customers.data
      .filter((c) => (scopeOwn ? c.enrolledBy === profile?.uid : true))
      .filter((c) => !q || c.name?.toLowerCase().includes(q) || c.phone?.includes(q) || c.accountNumber?.toLowerCase().includes(q))
      .slice(0, 12)
  }, [customers.data, search, scopeOwn, profile?.uid])

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="card p-5">
        <h3 className="font-semibold text-ink-1">New RD / FD Plan</h3>
        <p className="mt-1 text-sm text-ink-2">Choose the customer to enroll. New customer?{' '}
          <Link to="/customers/new" className="text-gold hover:underline">Add one first</Link>.
        </p>
        <div className="relative mt-4">
          <ISearch size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" />
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer by name, phone, account…" className="field pl-10" />
        </div>
      </div>

      {customers.loading ? (
        <div className="skeleton h-40 w-full rounded-card" />
      ) : !matches.length ? (
        <EmptyState
          icon={<IUsers size={24} />}
          title={search ? 'No matching customers' : 'Search to find a customer'}
          message={search ? 'Try a different name or number.' : 'Start typing to pick a customer to enroll.'}
          action={<Link to="/customers/new" className="btn-gold mt-1"><IPlus size={16} /> New Customer</Link>}
        />
      ) : (
        <div className="card divide-y divide-navy-4/60 overflow-hidden">
          {matches.map((c) => (
            <button key={c.id} type="button" onClick={() => navigate(`/customers/${c.id}/enroll`)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-navy-2">
              <span>
                <span className="block font-medium text-ink-1">{c.name}</span>
                <span className="block text-xs text-ink-2">{c.phone} · {c.accountNumber}</span>
              </span>
              <span className="flex items-center gap-3">
                <StatusBadge status={c.kycStatus || 'pending'} />
                <span className="text-sm font-semibold text-gold">Enroll →</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
