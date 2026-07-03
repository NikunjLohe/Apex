import { useMemo, useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import toast from 'react-hot-toast'
import { getDoc, getDocs, doc, collection, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useCollection } from '../../hooks/useFirestore'
import { usePermission, CAP } from '../../hooks/usePermission'
import { useRanks } from '../../contexts/RanksContext'
import { memberSchema } from '../../lib/schemas'
import { createMember } from '../../lib/admin'
import { formatINR, fmtDate } from '../../utils/format'
import RankBadge from '../../components/ui/RankBadge'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { INetwork, IPlus, ITrophy, IDashboard, IUsers } from '../../components/ui/icons'
import GenealogyTree from '../../components/ui/GenealogyTree'

export default function MyDownline() {
  const { profile } = useAuth()
  const uid = profile?.uid
  const { can } = usePermission()
  const { config: ranksConfig, getRank, nextRank } = useRanks()

  // Load only direct children from Firestore, not all users
  const directChildren = useCollection(
    'users',
    uid ? [where('referredBy', '==', uid)] : [],
    `downline-${uid}`
  )

  // Recursive full downline loader (for stats panel)
  const [downline, setDownline] = useState([])
  const [downlineLoading, setDownlineLoading] = useState(false)

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    setDownlineLoading(true)

    const fetchFullDownline = async () => {
      const all = []
      const visited = new Set()
      const queue = [uid]

      while (queue.length > 0) {
        const parentId = queue.shift()
        if (visited.has(parentId)) continue
        visited.add(parentId)

        try {
          const snaps = await getDocs(query(collection(db, 'users'), where('referredBy', '==', parentId)))
          snaps.docs.forEach(d => {
            const child = { id: d.id, ...d.data() }
            all.push(child)
            queue.push(d.id)
          })
        } catch (err) {
          console.error('Downline fetch error for', parentId, err)
        }
      }

      if (!cancelled) {
        setDownline(all.sort((a, b) => (Number(b.rank) || 0) - (Number(a.rank) || 0)))
        setDownlineLoading(false)
      }
    }

    fetchFullDownline()
    return () => { cancelled = true }
  }, [uid])

  const [activeTab, setActiveTab] = useState('members')
  const [showRecruit, setShowRecruit] = useState(false)
  const [recruiting, setRecruiting] = useState(false)
  const [promoRules, setPromoRules] = useState(null)

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(memberSchema),
    defaultValues: {
      name: '', email: '', phone: '', rank: 1, // default to AO
      branchId: profile?.branchId || '', referredBy: uid || '', sponsorCode: '',
      status: 'active', password: '', address: '', dob: '',
    }
  })

  // Load Promotion Rules Configuration
  useEffect(() => {
    ;(async () => {
      try {
        const snap = await getDoc(doc(db, 'config', 'promotions'))
        if (snap.exists() && snap.data().rules) {
          setPromoRules(snap.data().rules)
        }
      } catch (err) {
        console.warn('Promotion rules configuration fetch skipped:', err)
      }
    })()
  }, [])

  // No-op: downline is now loaded lazily by the useEffect above

  // Direct team = the targeted direct-children query results
  const directTeam = directChildren.data || []

  // Team Statistics calculations
  const teamStats = useMemo(() => {
    const totalVolume = downline.reduce((sum, u) => sum + (u.businessVolume || 0), 0)

    const rankCounts = {}
    downline.forEach(u => {
      const rankNum = u.rank || 1
      rankCounts[rankNum] = (rankCounts[rankNum] || 0) + 1
    })

    const rankDist = Object.entries(rankCounts).map(([rk, count]) => {
      const rInfo = getRank(rk)
      return { rank: Number(rk), code: rInfo.code, name: rInfo.name, count }
    }).sort((a, b) => b.rank - a.rank)

    // Promotion target criteria progress
    let nextPromoProgress = null
    const nextRankObj = nextRank(profile?.rank)
    if (nextRankObj && promoRules) {
      const rules = promoRules[nextRankObj.code] || { businessTarget: 0, requiredPromotedCount: 0, requiredPromotedRank: '' }
      
      // Calculate how many downline members have rank >= requiredPromotedRank
      const reqRankNum = ranksConfig?.RANKS?.find(r => r.code === rules.requiredPromotedRank)?.rank || 0
      const qualifiedDownlineCount = downline.filter(u => (Number(u.rank) || 0) >= reqRankNum).length

      nextPromoProgress = {
        targetRankCode: nextRankObj.code,
        targetRankName: nextRankObj.name,
        businessTarget: rules.businessTarget,
        businessAchieved: profile?.businessVolume || 0,
        requiredRankCode: rules.requiredPromotedRank,
        requiredCount: rules.requiredPromotedCount,
        actualCount: qualifiedDownlineCount,
        businessQualified: (profile?.businessVolume || 0) >= rules.businessTarget,
        downlineQualified: rules.requiredPromotedRank ? (qualifiedDownlineCount >= rules.requiredPromotedCount) : true
      }
    }

    return {
      totalVolume,
      rankDist,
      nextPromoProgress
    }
  }, [downline, profile, getRank, nextRank, promoRules, ranksConfig])

  const sponsorName = (m) => {
    if (!m.referredBy) return '—'
    if (m.referredBy === uid) return 'You'
    const found = downline.find((u) => u.id === m.referredBy)
    return found?.name || '—'
  }

  const handleRecruit = async (data) => {
    setRecruiting(true)
    try {
      // Load all users to find max sponsorCode (one-time read on recruit action only)
      let maxId = 0
      const allSnaps = await getDocs(collection(db, 'users'))
      allSnaps.forEach(d => {
        const member = d.data()
        if (member.sponsorCode) {
          const numStr = member.sponsorCode.replace(/^[A-Z]+/i, '')
          const num = parseInt(numStr, 10)
          if (!isNaN(num) && num > maxId) maxId = num
        }
      })
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
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4 pb-4 border-b border-navy-4/50">
        <div>
          <h2 className="font-serif text-2xl font-bold text-ink-1 tracking-tight">Team Downline</h2>
          <p className="text-xs text-ink-2">Manage your sponsored agents, monitor genealogy trees, and view team business summaries.</p>
        </div>
        
        {can(CAP.RECRUIT) && (
          <button
            type="button"
            onClick={() => setShowRecruit(true)}
            className="btn-gold py-2 text-xs px-4 flex items-center gap-1.5 uppercase font-bold tracking-wider"
          >
            <IPlus size={14} /> Recruit Agent
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-navy-4">
        <button 
          onClick={() => setActiveTab('members')}
          className={`pb-2.5 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
            activeTab === 'members' 
              ? 'border-gold text-gold-1' 
              : 'border-transparent text-ink-2 hover:text-ink-1'
          }`}
        >
          Team List ({downline.length})
        </button>
        <button 
          onClick={() => setActiveTab('tree')}
          className={`pb-2.5 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
            activeTab === 'tree' 
              ? 'border-gold text-gold-1' 
              : 'border-transparent text-ink-2 hover:text-ink-1'
          }`}
        >
          Genealogy Tree
        </button>
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={`pb-2.5 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
            activeTab === 'dashboard' 
              ? 'border-gold text-gold-1' 
              : 'border-transparent text-ink-2 hover:text-ink-1'
          }`}
        >
          Team Dashboard
        </button>
      </div>

      {/* Tab 1: Team List */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          {downlineLoading ? (
            <SkeletonTable rows={6} cols={6} />
          ) : downline.length === 0 ? (
            <EmptyState 
              icon={<INetwork size={24} />} 
              title="No downline members found" 
              message="Members you sponsor into your downline structure will appear in this table." 
            />
          ) : (
            <div className="card p-5 space-y-4">
              <div className="table-wrap">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th>Agent Name</th>
                      <th>Rank</th>
                      <th>Upline Sponsor</th>
                      <th>Phone Number</th>
                      <th>Joined Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {downline.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <span className="font-semibold text-ink-1 block">{m.name}</span>
                          <span className="text-[10px] text-ink-2 font-mono">{m.sponsorCode || '—'}</span>
                        </td>
                        <td><RankBadge rank={m.rank} size="sm" showName /></td>
                        <td className="text-ink-2 font-semibold">{sponsorName(m)}</td>
                        <td className="text-ink-2 font-mono">{m.phone || '—'}</td>
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
      )}

      {/* Tab 2: Genealogy Tree visualizer */}
      {activeTab === 'tree' && (
        <GenealogyTree rootId={uid} />
      )}

      {/* Tab 3: Team Dashboard */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Quick Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card p-4 space-y-1">
              <span className="flex h-8 w-8 items-center justify-center rounded bg-gold-1/10 text-gold border border-gold-1/25">
                <IUsers size={18} />
              </span>
              <p className="text-[10px] uppercase font-bold text-ink-2 tracking-wide">Direct Team Size</p>
              <p className="text-lg font-bold text-ink-1 font-serif">{directTeam.length} agents</p>
            </div>
            
            <div className="card p-4 space-y-1">
              <span className="flex h-8 w-8 items-center justify-center rounded bg-navy-4 text-gold border border-navy-4">
                <INetwork size={18} />
              </span>
              <p className="text-[10px] uppercase font-bold text-ink-2 tracking-wide">Total Downline</p>
              <p className="text-lg font-bold text-ink-1 font-serif">{downline.length} agents</p>
            </div>

            <div className="card p-4 space-y-1">
              <span className="flex h-8 w-8 items-center justify-center rounded bg-ok/10 text-ok border border-ok/25">
                <ITrophy size={18} />
              </span>
              <p className="text-[10px] uppercase font-bold text-ink-2 tracking-wide">Team Business Volume</p>
              <p className="text-lg font-bold text-ink-1 font-serif">{formatINR(teamStats.totalVolume)}</p>
            </div>

            <div className="card p-4 space-y-1">
              <span className="flex h-8 w-8 items-center justify-center rounded bg-[#8FA382]/10 text-[#7A8E6E] border border-[#8FA382]/25">
                <IDashboard size={18} />
              </span>
              <p className="text-[10px] uppercase font-bold text-ink-2 tracking-wide">Your Personal BV</p>
              <p className="text-lg font-bold text-ink-1 font-serif">{formatINR(profile?.businessVolume || 0)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Rank Distribution Breakdown */}
            <div className="card p-5 space-y-4 md:col-span-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">
                Team Rank Distribution
              </h3>
              {teamStats.rankDist.length > 0 ? (
                <div className="space-y-3">
                  {teamStats.rankDist.map(dist => (
                    <div key={dist.rank} className="flex justify-between items-center text-xs">
                      <RankBadge rank={dist.rank} size="sm" showName />
                      <span className="font-mono font-bold text-ink-1 bg-navy-2 px-2 py-0.5 rounded border border-navy-4">
                        {dist.count} {dist.count === 1 ? 'agent' : 'agents'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-2 italic text-center py-4">No downline team data registered.</p>
              )}
            </div>

            {/* Promotion Progress check */}
            <div className="card p-5 space-y-4 md:col-span-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">
                Rank Promotion Qualifications
              </h3>
              {teamStats.nextPromoProgress ? (
                <div className="space-y-4 text-xs">
                  <div>
                    <span className="block text-ink-2 text-[10px] uppercase tracking-wider mb-2">
                      Advancement Target Rank: <strong className="text-gold-1">{teamStats.nextPromoProgress.targetRankName} ({teamStats.nextPromoProgress.targetRankCode})</strong>
                    </span>
                  </div>

                  {/* Business Target Progress */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between font-semibold">
                      <span className="text-ink-2">1. Lifetime Business Volume (Personal)</span>
                      <span className="text-ink-1">
                        {formatINR(teamStats.nextPromoProgress.businessAchieved)} / {formatINR(teamStats.nextPromoProgress.businessTarget)}
                      </span>
                    </div>
                    <div className="w-full bg-navy-2 rounded-full h-2 overflow-hidden border border-navy-4">
                      <div 
                        className={`h-2 rounded-full transition-all duration-300 ${
                          teamStats.nextPromoProgress.businessQualified ? 'bg-ok' : 'bg-gold'
                        }`} 
                        style={{ width: `${Math.min(100, (teamStats.nextPromoProgress.businessAchieved / teamStats.nextPromoProgress.businessTarget) * 100)}%` }} 
                      />
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-ink-2">Progress: {Math.round(Math.min(100, (teamStats.nextPromoProgress.businessAchieved / teamStats.nextPromoProgress.businessTarget) * 100))}%</span>
                      <span className={teamStats.nextPromoProgress.businessQualified ? 'text-ok font-bold' : 'text-gold font-bold'}>
                        {teamStats.nextPromoProgress.businessQualified ? 'Achieved' : 'Pending'}
                      </span>
                    </div>
                  </div>

                  {/* Downline Members Progress */}
                  {teamStats.nextPromoProgress.requiredRankCode ? (
                    <div className="space-y-1.5 pt-2 border-t border-navy-4/50">
                      <div className="flex justify-between font-semibold">
                        <span className="text-ink-2">
                          2. Promoted Downline Members (Rank &ge; {teamStats.nextPromoProgress.requiredRankCode})
                        </span>
                        <span className="text-ink-1">
                          {teamStats.nextPromoProgress.actualCount} / {teamStats.nextPromoProgress.requiredCount} Members
                        </span>
                      </div>
                      <div className="w-full bg-navy-2 rounded-full h-2 overflow-hidden border border-navy-4">
                        <div 
                          className={`h-2 rounded-full transition-all duration-300 ${
                            teamStats.nextPromoProgress.downlineQualified ? 'bg-ok' : 'bg-gold'
                          }`} 
                          style={{ width: `${Math.min(100, (teamStats.nextPromoProgress.actualCount / teamStats.nextPromoProgress.requiredCount) * 100)}%` }} 
                        />
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-ink-2">Progress: {Math.round(Math.min(100, (teamStats.nextPromoProgress.actualCount / teamStats.nextPromoProgress.requiredCount) * 100))}%</span>
                        <span className={teamStats.nextPromoProgress.downlineQualified ? 'text-ok font-bold' : 'text-gold font-bold'}>
                          {teamStats.nextPromoProgress.downlineQualified ? 'Qualified' : 'Pending'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-ink-2 italic pt-2 border-t border-navy-4/50">
                      No downline team promotion conditions required for this transition rank.
                    </div>
                  )}

                  {/* Overall qualification message */}
                  <div className="pt-3 border-t border-navy-4 flex justify-between items-center">
                    <span className="text-ink-2 font-medium">Evaluation Summary:</span>
                    <span className={`px-2.5 py-0.5 rounded text-[10px] uppercase font-extrabold tracking-wider border ${
                      (teamStats.nextPromoProgress.businessQualified && teamStats.nextPromoProgress.downlineQualified)
                        ? 'bg-ok/10 text-ok border-ok/25'
                        : 'bg-gold-1/10 text-gold border-gold-1/25'
                    }`}>
                      {(teamStats.nextPromoProgress.businessQualified && teamStats.nextPromoProgress.downlineQualified)
                        ? 'Eligible for Promotion Cycle'
                        : 'Qualification Pending'
                      }
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-ink-2 italic text-center py-6">You have reached the maximum system rank or promotion rules are not configured.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recruitment Modal Dialog */}
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
