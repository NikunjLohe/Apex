import { where } from 'firebase/firestore'
import { useAuth } from '../../contexts/AuthContext'
import { useCollection } from '../../hooks/useFirestore'
import { fmtDate } from '../../utils/format'
import RankBadge from '../../components/ui/RankBadge'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { INetwork } from '../../components/ui/icons'

export default function MyDownline() {
  const { profile } = useAuth()
  const uid = profile?.uid
  const downline = useCollection('users', uid ? [where('referredBy', '==', uid)] : [], `dl-${uid}`)

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="card flex items-center gap-3 p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-card border border-gold-1/20 bg-gold-1/10 text-gold"><INetwork size={20} /></span>
        <div>
          <p className="text-sm text-ink-2">Direct downline members</p>
          <p className="text-xl font-bold text-ink-1">{downline.data.length}</p>
        </div>
      </div>

      {downline.loading ? (
        <SkeletonTable rows={6} cols={4} />
      ) : !downline.data.length ? (
        <EmptyState icon={<INetwork size={24} />} title="No downline yet" message="Members you sponsor will appear here." />
      ) : (
        <div className="table-wrap">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Name</th><th>Rank</th><th>Phone</th><th>Joined</th><th>Status</th></tr></thead>
              <tbody>
                {downline.data.map((m) => (
                  <tr key={m.id}>
                    <td className="font-medium text-ink-1">{m.name}</td>
                    <td><RankBadge rank={m.rank} size="sm" showName /></td>
                    <td className="text-ink-2">{m.phone || '—'}</td>
                    <td className="text-ink-2">{fmtDate(m.joinDate)}</td>
                    <td><StatusBadge status={m.status || 'active'} /></td>
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
