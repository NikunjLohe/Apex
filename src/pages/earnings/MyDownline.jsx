import { useMemo } from 'react'
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
  const allUsers = useCollection('users')

  const downline = useMemo(() => {
    if (!uid || !allUsers.data || !allUsers.data.length) return []

    const myRank = Number(profile?.rank) || 0
    const list = []
    const visited = new Set()

    // Recursively find all children in the sponsor tree
    const findChildren = (parentId) => {
      allUsers.data.forEach((u) => {
        if (u.referredBy === parentId && !visited.has(u.id)) {
          visited.add(u.id)
          // Only show members whose rank is strictly below my rank
          if ((Number(u.rank) || 0) < myRank) {
            list.push(u)
          }
          findChildren(u.id)
        }
      })
    }

    findChildren(uid)
    return list.sort((a, b) => (Number(b.rank) || 0) - (Number(a.rank) || 0))
  }, [allUsers.data, uid, profile?.rank])

  const sponsorName = (m) => {
    if (!m.referredBy) return '—'
    if (m.referredBy === uid) return 'You'
    return allUsers.data.find((u) => u.id === m.referredBy)?.name || '—'
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="card flex items-center gap-3 p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-card border border-gold-1/20 bg-gold-1/10 text-gold">
          <INetwork size={20} />
        </span>
        <div>
          <p className="text-sm text-ink-2">Downline members (Ranks below you)</p>
          <p className="text-xl font-bold text-ink-1">{downline.length}</p>
        </div>
      </div>

      {allUsers.loading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : !downline.length ? (
        <EmptyState 
          icon={<INetwork size={24} />} 
          title="No downline members found" 
          message="Members you sponsor with ranks lower than yours will appear here." 
        />
      ) : (
        <div className="table-wrap">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Rank</th>
                  <th>Sponsor / Upline</th>
                  <th>Phone</th>
                  <th>Joined</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {downline.map((m) => (
                  <tr key={m.id}>
                    <td className="font-medium text-ink-1">{m.name}</td>
                    <td><RankBadge rank={m.rank} size="sm" showName /></td>
                    <td className="text-ink-2 font-medium">{sponsorName(m)}</td>
                    <td className="text-ink-2 font-mono text-xs">{m.phone || '—'}</td>
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
