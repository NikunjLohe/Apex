import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { useCollection } from '../../hooks/useFirestore'
import { usePermission, CAP } from '../../hooks/usePermission'
import { memberSchema } from '../../lib/schemas'
import { createMember } from '../../lib/admin'
import { fmtDate } from '../../utils/format'
import RankBadge from '../../components/ui/RankBadge'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { INetwork, IPlus } from '../../components/ui/icons'

export default function MyDownline() {
  const { profile } = useAuth()
  const uid = profile?.uid
  const allUsers = useCollection('users')
  const { can } = usePermission()

  const [showRecruit, setShowRecruit] = useState(false)
  const [recruiting, setRecruiting] = useState(false)

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(memberSchema),
    defaultValues: {
      name: '', email: '', phone: '', rank: 1, // default to AO
      branchId: profile?.branchId || '', referredBy: uid || '', sponsorCode: '',
      status: 'active', password: '', address: '', dob: '',
    }
  })

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

  const handleRecruit = async (data) => {
    setRecruiting(true)
    try {
      // Auto-generate a unique Agent Code (Agent ID) starting from AG000001
      let maxId = 0
      if (allUsers.data && allUsers.data.length > 0) {
        allUsers.data.forEach(member => {
          if (member.sponsorCode) {
            const numStr = member.sponsorCode.replace(/^[A-Z]+/i, '')
            const num = parseInt(numStr, 10)
            if (!isNaN(num) && num > maxId) {
              maxId = num
            }
          }
        })
      }
      const nextId = maxId + 1
      data.sponsorCode = `AG${String(nextId).padStart(6, '0')}`
      data.referredBy = uid || ''
      data.branchId = profile?.branchId || ''
      data.rank = 1 // joins as rank AO (rank 1)
      data.status = 'active'

      const tempPassword = data.password || `Apex@${Math.floor(1000 + Math.random() * 9000)}`
      await createMember(data, tempPassword)
      
      if (data.password) {
        toast.success('Agent recruited successfully!')
      } else {
        toast.success(`Agent recruited! Temp password: ${tempPassword}`, { duration: 10000 })
      }
      reset()
      setShowRecruit(false)
    } catch (e) {
      toast.error(e.code === 'auth/email-already-in-use' ? 'Email already in use' : e.message || 'Could not recruit agent')
    } finally {
      setRecruiting(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="card flex items-center gap-3 p-4 flex-1">
          <span className="flex h-10 w-10 items-center justify-center rounded-card border border-gold-1/20 bg-gold-1/10 text-gold">
            <INetwork size={20} />
          </span>
          <div>
            <p className="text-sm text-ink-2">Downline members (Ranks below you)</p>
            <p className="text-xl font-bold text-ink-1">{downline.length}</p>
          </div>
        </div>
        {can(CAP.RECRUIT) && (
          <button
            type="button"
            onClick={() => setShowRecruit(true)}
            className="btn-gold py-3 text-sm px-4 flex items-center gap-2"
          >
            <IPlus size={16} /> Recruit Agent
          </button>
        )}
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

      {showRecruit && (
        <ConfirmDialog 
          open 
          title="Recruit New Agent" 
          confirmLabel="Recruit" 
          loading={recruiting} 
          onConfirm={handleSubmit(handleRecruit)} 
          onClose={() => { reset(); setShowRecruit(false) }}
        >
          <form className="mt-3 space-y-3" onSubmit={handleSubmit(handleRecruit)}>
            <div>
              <label className="label">Full name</label>
              <input className="field" {...register('name')} />
              {errors.name && <p className="err">{errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Email</label>
                <input className="field" type="email" {...register('email')} />
                {errors.email && <p className="err">{errors.email.message}</p>}
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="field" maxLength={10} {...register('phone')} />
                {errors.phone && <p className="err">{errors.phone.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Date of Birth</label>
                <input className="field" type="date" {...register('dob')} />
                {errors.dob && <p className="err">{errors.dob.message}</p>}
              </div>
              <div>
                <label className="label">Temporary Password (optional)</label>
                <input className="field" type="password" placeholder="Auto if blank" {...register('password')} />
                {errors.password && <p className="err">{errors.password.message}</p>}
              </div>
            </div>
            <div>
              <label className="label">Address</label>
              <textarea className="field h-16 resize-none" {...register('address')} />
              {errors.address && <p className="err">{errors.address.message}</p>}
            </div>
            <p className="text-[11px] text-ink-2 italic bg-navy-2/30 p-2.5 rounded border border-navy-4">
              Note: The recruited agent will join with the rank of <strong>AO (Administrative Officer)</strong> in your downline network.
            </p>
          </form>
        </ConfirmDialog>
      )}
    </div>
  )
}
