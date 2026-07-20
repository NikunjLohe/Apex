import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useCollection, useDoc } from '../../hooks/useFirestore'
import { fmtDate } from '../../utils/format'
import RankBadge from '../../components/ui/RankBadge'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { IPlus, IUsers, ISearch } from '../../components/ui/icons'
import MemberModal from '../../components/MemberModal'

export default function Members() {
  const [searchParams, setSearchParams] = useSearchParams()
  const members = useCollection('users')
  const branches = useCollection('branches')
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || '')
  const [filterProfile, setFilterProfile] = useState(searchParams.get('profile') || '')
  const [modal, setModal] = useState(null) // { mode:'new'|'edit', member }
  const navigate = useNavigate()
  const { data: settings } = useDoc('config/settings')

  const isProfileComplete = (m) => {
    if (!m.dob || !m.address || !m.pan || !m.bankDetails?.bankName || !m.bankDetails?.accountNumber || !m.bankDetails?.ifscCode) {
      return false
    }
    return true
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return members.data
      .filter((m) => {
        if (filterStatus && m.status !== filterStatus) return false
        if (filterProfile) {
          const complete = isProfileComplete(m)
          if (filterProfile === 'completed' && !complete) return false
          if (filterProfile === 'pending' && complete) return false
        }
        return !q || m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q) || m.phone?.includes(q) || m.sponsorCode?.toLowerCase().includes(q)
      })
      .sort((a, b) => (b.rank || 0) - (a.rank || 0))
  }, [members.data, search, filterStatus])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      const match = members.data.find(
        (m) => m.sponsorCode?.toLowerCase() === search.trim().toLowerCase()
      )
      if (match) {
        navigate(`/admin/members/${match.id}`)
      }
    }
  }

  const branchName = (bid) => branches.data.find((b) => b.id === bid)?.name || '—'
  const memberName = (uid) => members.data.find((m) => m.id === uid)?.name || '—'

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[220px]">
          <div className="relative flex-1">
            <ISearch size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={handleKeyDown} placeholder="Search members by code, name, phone…" className="field pl-10" />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="field w-32">
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select value={filterProfile} onChange={(e) => setFilterProfile(e.target.value)} className="field w-36">
            <option value="">All Profiles</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        <button type="button" onClick={() => setModal({ mode: 'new' })} className="btn-gold py-2.5 text-sm"><IPlus size={16} /> Add Member</button>
      </div>

      {members.loading ? (
        <SkeletonTable rows={8} cols={6} />
      ) : !filtered.length ? (
        <EmptyState icon={<IUsers size={24} />} title="No members" message="Add your first team member." />
      ) : (
        <div className="table-wrap">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Name</th><th>Agent ID</th><th>Rank</th><th>Sponsor</th><th>Branch</th><th>Joined</th><th>Status</th><th>Profile</th><th></th></tr></thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id}>
                    <td className="font-medium text-ink-1">
                      <Link to={`/admin/members/${m.id}`} className="hover:text-gold-1 hover:underline">
                        {m.name}
                      </Link>
                      <div className="text-xs text-ink-2">{m.email}</div>
                    </td>
                    <td className="font-mono text-sm">
                      <Link to={`/admin/members/${m.id}`} className="text-ink-1 font-semibold hover:text-gold-1 hover:underline">
                        {m.sponsorCode || '—'}
                      </Link>
                    </td>
                    <td><RankBadge rank={m.rank} size="sm" />{m.isSuperAdmin && <span className="ml-1 rounded-full bg-gold-1/15 px-2 py-0.5 text-[10px] font-bold text-gold">SUPER</span>}</td>

                    <td className="text-ink-2">{m.referredBy ? memberName(m.referredBy) : '—'}</td>
                    <td className="text-ink-2">{branchName(m.branchId)}</td>
                    <td className="text-ink-2">{fmtDate(m.joinDate)}</td>
                    <td><StatusBadge status={m.status || 'active'} /></td>
                    <td>
                      {isProfileComplete(m) ? (
                        <span className="text-ok text-xs font-semibold">✓ Complete</span>
                      ) : (
                        <span className="text-gold text-xs font-semibold">⚠ Pending</span>
                      )}
                    </td>
                    <td className="space-x-2">
                      <Link to={`/admin/members/${m.id}`} className="text-xs font-semibold text-gold hover:underline">View Profile</Link>
                      <button type="button" onClick={() => setModal({ mode: 'edit', member: m })} className="text-xs font-semibold text-gold hover:underline">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && <MemberModal modal={modal} branches={branches.data} members={members.data} settings={settings} onClose={() => setModal(null)} />}
    </div>
  )
}
