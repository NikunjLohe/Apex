import { useMemo, useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import toast from 'react-hot-toast'
import { getDoc, getDocs, doc, collection, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useCollection, useDoc } from '../../hooks/useFirestore'
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
import { INetwork, IPlus, ITrophy, IDashboard, IUsers, IDownload } from '../../components/ui/icons'
import GenealogyTree from '../../components/ui/GenealogyTree'
import * as xlsx from 'xlsx'
import { useSearchParams } from 'react-router-dom'

export default function MyDownline() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { profile } = useAuth()
  const uid = profile?.uid
  const { can } = usePermission()
  const { config: ranksConfig, getRank, nextRank } = useRanks()
  const { data: settings } = useDoc('config/settings')
  const { data: branches } = useCollection('branches')

  const directChildren = useCollection(
    'users',
    uid ? [where('referredBy', '==', uid)] : [],
    `downline-${uid}`
  )

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
          console.error(err)
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

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [filterRank, setFilterRank] = useState('')
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || '')
  const [filterBranch, setFilterBranch] = useState('')
  const [filterSponsor, setFilterSponsor] = useState('')
  
  // Export
  const [exporting, setExporting] = useState(false)
  const [exportOption, setExportOption] = useState('Entire Downline')

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(memberSchema),
    defaultValues: {
      name: '', email: '', phone: '', rank: 1,
      branchId: profile?.branchId || '', referredBy: uid || '', sponsorCode: '',
      status: 'active', password: '', address: '', dob: '',
    }
  })

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'config', 'promotions'))
        if (snap.exists() && snap.data().rules) {
          setPromoRules(snap.data().rules)
        }
      } catch (err) {
        console.warn('Promotion rules fetch skipped:', err)
      }
    })()
  }, [])

  const directTeam = directChildren.data || []

  const teamStats = useMemo(() => {
    const totalVolume = directTeam.reduce((sum, u) => sum + (u.businessVolume || 0), 0)

    const rankCounts = {}
    downline.forEach(u => {
      const rankNum = u.rank || 1
      rankCounts[rankNum] = (rankCounts[rankNum] || 0) + 1
    })

    const rankDist = Object.entries(rankCounts).map(([rk, count]) => {
      const rInfo = getRank(rk)
      return { rank: Number(rk), code: rInfo.code, name: rInfo.name, count }
    }).sort((a, b) => b.rank - a.rank)

    let nextPromoProgress = null
    const nextRankObj = nextRank(profile?.rank)
    if (nextRankObj && promoRules) {
      const rules = promoRules[nextRankObj.code] || { businessTarget: 0, requiredPromotedCount: 0, requiredPromotedRank: '' }
      
      const reqRankNum = ranksConfig?.RANKS?.find(r => r.code === rules.requiredPromotedRank)?.rank || 0
      const qualifiedDownlineCount = directTeam.filter(u => (Number(u.rank) || 0) >= reqRankNum).length

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

    return { totalVolume, rankDist, nextPromoProgress }
  }, [downline, profile, getRank, nextRank, promoRules, ranksConfig, directTeam])

  const sponsorName = (m) => {
    if (!m.referredBy) return '—'
    if (m.referredBy === uid) return 'You'
    const found = downline.find((u) => u.id === m.referredBy)
    return found?.name || '—'
  }

  const handleRecruit = async (data) => {
    setRecruiting(true)
    try {
      if (data.panNumber) data.panNumber = data.panNumber.toUpperCase()

      const allSnaps = await getDocs(collection(db, 'users'))
      const allUsers = allSnaps.docs.map(d => d.data())
      
      const existingPanUser = allUsers.find(u => u.panNumber === data.panNumber)
      if (existingPanUser) {
        toast.error('PAN number is already registered')
        setRecruiting(false)
        return
      }

      let maxId = 0
      allUsers.forEach(member => {
        if (member.sponsorCode) {
          const numStr = member.sponsorCode.replace(/^[A-Z]+/i, '')
          const num = parseInt(numStr, 10)
          if (!isNaN(num) && num > maxId) maxId = num
        }
      })
      const nextId = maxId + 1
      const prefix = settings?.agentPrefix || 'KB'
      data.sponsorCode = `${prefix}${String(nextId).padStart(6, '0')}`
      data.referredBy = uid || ''
      data.branchId = profile?.branchId || ''
      data.rank = 1
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

  // Filter Data
  const filteredDownline = useMemo(() => {
    return downline.filter(u => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (!u.name?.toLowerCase().includes(q) && !u.sponsorCode?.toLowerCase().includes(q)) return false
      }
      if (filterRank && String(u.rank) !== filterRank) return false
      if (filterStatus && u.status !== filterStatus) return false
      if (filterBranch && u.branchId !== filterBranch) return false
      if (filterSponsor && u.referredBy !== filterSponsor) return false
      return true
    })
  }, [downline, searchQuery, filterRank, filterStatus, filterBranch, filterSponsor])

  const ranksInDownline = [...new Set(filteredDownline.map(u => u.rank))].sort((a, b) => b - a)

  // Export Data Builder
  const handleExportDownline = async () => {
    if (filteredDownline.length === 0) return toast.error('No members to export')
    setExporting(true)
    try {
      let exportList = []
      if (exportOption === 'Entire Downline') {
        exportList = [...downline]
      } else if (exportOption === 'Direct Members Only') {
        exportList = downline.filter(u => u.referredBy === uid)
      } else if (exportOption === 'Current Rank Only') {
        const myRank = profile?.rank || 1
        exportList = downline.filter(u => u.rank === myRank)
      }

      if (exportList.length === 0) {
        setExporting(false)
        return toast.error('No members match the selected export option')
      }

      // Fetch Plans for Business Volume & Policy Count
      // Since 'in' allows up to 30, we must chunk the ids
      const agentIds = exportList.map(a => a.id)
      
      const buildDownlineMap = () => {
        const map = {}
        const getDL = (agentId) => {
          if (map[agentId]) return map[agentId]
          let dl = new Set()
          downline.filter(x => x.referredBy === agentId).forEach(child => {
            dl.add(child.id)
            const nested = getDL(child.id)
            nested.forEach(n => dl.add(n))
          })
          map[agentId] = dl
          return dl
        }
        agentIds.forEach(id => getDL(id))
        return map
      }
      
      const agentDownlines = buildDownlineMap()

      // Fetch all plans for all members in exportList and their downlines
      const allRequiredIds = new Set(agentIds)
      agentIds.forEach(id => agentDownlines[id].forEach(childId => allRequiredIds.add(childId)))
      
      const allReqArray = Array.from(allRequiredIds)
      const allPlans = []
      
      for (let i = 0; i < allReqArray.length; i += 30) {
        const chunk = allReqArray.slice(i, i + 30)
        const snap = await getDocs(query(collection(db, 'plans'), where('agentId', 'in', chunk)))
        snap.forEach(d => allPlans.push({ ...d.data(), id: d.id }))
      }
      
      // Calculate direct and team business
      const directBusinessMap = {}
      const policyCountMap = {}
      allRequiredIds.forEach(id => {
        directBusinessMap[id] = 0
        policyCountMap[id] = 0
      })
      
      allPlans.forEach(p => {
        const amt = (p.planType || p.type || '').toLowerCase().startsWith('rd') ? (p.monthlyAmount * 12) : (p.fdAmount || 0)
        if (directBusinessMap[p.agentId] !== undefined) {
          directBusinessMap[p.agentId] += amt
          policyCountMap[p.agentId] += 1
        }
      })
      
      // Calculate customer counts
      let customerCounts = {}
      for (let i = 0; i < agentIds.length; i += 30) {
        const chunk = agentIds.slice(i, i + 30)
        const snap = await getDocs(query(collection(db, 'customers'), where('enrolledBy', 'in', chunk)))
        chunk.forEach(id => customerCounts[id] = 0)
        snap.forEach(d => {
          const c = d.data()
          if(customerCounts[c.enrolledBy] !== undefined) customerCounts[c.enrolledBy]++
        })
      }

      const sheetData = exportList.map(a => {
        const myDirect = directBusinessMap[a.id] || 0
        const myDLIds = agentDownlines[a.id] || new Set()
        let myTeam = myDirect
        myDLIds.forEach(childId => {
          myTeam += (directBusinessMap[childId] || 0)
        })

        // Hierarchy Level calc (1 = Direct, 2 = level 2 etc)
        let level = 1
        let curr = a.referredBy
        while(curr && curr !== uid) {
          level++
          const parent = downline.find(x => x.id === curr)
          if (!parent) break
          curr = parent.referredBy
        }

        return {
          'Agent Code': a.sponsorCode || '—',
          'Agent Name': a.name,
          'Rank': getRank(a.rank).code,
          'Sponsor': sponsorName(a),
          'Hierarchy Level': level,
          'Direct Business': myDirect,
          'Team Business': myTeam,
          'Customer Count': customerCounts[a.id] || 0,
          'Policy Count': policyCountMap[a.id] || 0,
          'Status': a.status
        }
      })

      const ws = xlsx.utils.json_to_sheet(sheetData)
      const wb = xlsx.utils.book_new()
      xlsx.utils.book_append_sheet(wb, ws, 'Downline')
      xlsx.writeFile(wb, `Apex_Downline_${exportOption.replace(/ /g, '_')}.xlsx`)
      toast.success('Export downloaded')

    } catch (err) {
      console.error(err)
      toast.error('Failed to export data')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
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

      <div className="flex gap-2 border-b border-navy-4">
        <button 
          onClick={() => setActiveTab('members')}
          className={`pb-2.5 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${activeTab === 'members' ? 'border-gold text-gold-1' : 'border-transparent text-ink-2 hover:text-ink-1'}`}
        >
          Team List ({downline.length})
        </button>
        <button 
          onClick={() => setActiveTab('tree')}
          className={`pb-2.5 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${activeTab === 'tree' ? 'border-gold text-gold-1' : 'border-transparent text-ink-2 hover:text-ink-1'}`}
        >
          Genealogy Tree
        </button>
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={`pb-2.5 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${activeTab === 'dashboard' ? 'border-gold text-gold-1' : 'border-transparent text-ink-2 hover:text-ink-1'}`}
        >
          Team Dashboard
        </button>
      </div>

      {activeTab === 'members' && (
        <div className="space-y-4">
          <div className="card p-4 space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="label">Search Team</label>
                <input 
                  type="text" 
                  className="field text-xs" 
                  placeholder="Agent name or code..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="w-32">
                <label className="label">Rank</label>
                <select className="field text-xs" value={filterRank} onChange={e => setFilterRank(e.target.value)}>
                  <option value="">All Ranks</option>
                  {ranksConfig?.RANKS?.map(r => <option key={r.rank} value={r.rank}>{r.code}</option>)}
                </select>
              </div>
              <div className="w-32">
                <label className="label">Status</label>
                <select className="field text-xs" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="w-32">
                <label className="label">Branch</label>
                <select className="field text-xs" value={filterBranch} onChange={e => setFilterBranch(e.target.value)}>
                  <option value="">All Branches</option>
                  {branches?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="w-40">
                <label className="label">Export Options</label>
                <select className="field text-xs" value={exportOption} onChange={e => setExportOption(e.target.value)}>
                  <option value="Entire Downline">Entire Downline</option>
                  <option value="Direct Members Only">Direct Members Only</option>
                  <option value="Current Rank Only">Current Rank Only</option>
                </select>
              </div>
              <button 
                onClick={handleExportDownline}
                disabled={exporting}
                className="btn-gold px-4 py-2 text-xs flex items-center gap-1 uppercase font-bold"
              >
                <IDownload size={14} /> {exporting ? 'Exporting...' : 'Export'}
              </button>
            </div>
          </div>

          {downlineLoading ? (
            <SkeletonTable rows={6} cols={6} />
          ) : filteredDownline.length === 0 ? (
            <EmptyState 
              icon={<INetwork size={24} />} 
              title="No matching members" 
              message="No members matched your search or you haven't sponsored anyone." 
            />
          ) : (
            <div className="space-y-6">
              {ranksInDownline.map(rankLevel => {
                const rankMembers = filteredDownline.filter(u => u.rank === rankLevel)
                const rankInfo = getRank(rankLevel)
                return (
                  <div key={rankLevel} className="card overflow-hidden">
                    <div className="bg-navy-2 px-4 py-3 border-b border-navy-4 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gold tracking-wider text-sm">LEVEL {rankLevel} - {rankInfo.name} ({rankInfo.code})</span>
                      </div>
                      <span className="bg-navy-4 text-ink-2 text-[10px] font-bold px-2 py-0.5 rounded">{rankMembers.length} Agents</span>
                    </div>
                    <div className="table-wrap">
                      <table className="tbl text-xs">
                        <thead>
                          <tr>
                            <th>Agent Name</th>
                            <th>Upline Sponsor</th>
                            <th>Branch</th>
                            <th>Phone Number</th>
                            <th>Joined Date</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rankMembers.map((m) => (
                            <tr key={m.id}>
                              <td>
                                <span className="font-semibold text-ink-1 block">{m.name}</span>
                                <span className="text-[10px] text-ink-2 font-mono">{m.sponsorCode || '—'}</span>
                              </td>
                              <td className="text-ink-2 font-semibold">{sponsorName(m)}</td>
                              <td className="text-ink-2">{branches?.find(b => b.id === m.branchId)?.name || '—'}</td>
                              <td className="text-ink-2 font-mono">{m.phone || '—'}</td>
                              <td className="text-ink-2">{fmtDate(m.joinDate)}</td>
                              <td><StatusBadge status={m.status || 'active'} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'tree' && <GenealogyTree rootId={uid} />}

      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card p-4 space-y-1">
              <span className="flex h-8 w-8 items-center justify-center rounded bg-gold-1/10 text-gold border border-gold-1/25"><IUsers size={18} /></span>
              <p className="text-[10px] uppercase font-bold text-ink-2 tracking-wide">Direct Team Size</p>
              <p className="text-lg font-bold text-ink-1 font-serif">{directTeam.length} agents</p>
            </div>
            <div className="card p-4 space-y-1">
              <span className="flex h-8 w-8 items-center justify-center rounded bg-navy-4 text-gold border border-navy-4"><INetwork size={18} /></span>
              <p className="text-[10px] uppercase font-bold text-ink-2 tracking-wide">Total Downline</p>
              <p className="text-lg font-bold text-ink-1 font-serif">{downline.length} agents</p>
            </div>
            <div className="card p-4 space-y-1">
              <span className="flex h-8 w-8 items-center justify-center rounded bg-ok/10 text-ok border border-ok/25"><ITrophy size={18} /></span>
              <p className="text-[10px] uppercase font-bold text-ink-2 tracking-wide">Team Business Volume</p>
              <p className="text-lg font-bold text-ink-1 font-serif">{formatINR(teamStats.totalVolume)}</p>
            </div>
            <div className="card p-4 space-y-1">
              <span className="flex h-8 w-8 items-center justify-center rounded bg-[#8FA382]/10 text-[#7A8E6E] border border-[#8FA382]/25"><IDashboard size={18} /></span>
              <p className="text-[10px] uppercase font-bold text-ink-2 tracking-wide">Your Personal BV</p>
              <p className="text-lg font-bold text-ink-1 font-serif">{formatINR(profile?.businessVolume || 0)}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="card p-5 space-y-4 md:col-span-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">Team Rank Distribution</h3>
              {teamStats.rankDist.length > 0 ? (
                <div className="space-y-3">
                  {teamStats.rankDist.map(dist => (
                    <div key={dist.rank} className="flex justify-between items-center text-xs">
                      <RankBadge rank={dist.rank} size="sm" showName />
                      <span className="font-mono font-bold text-ink-1 bg-navy-2 px-2 py-0.5 rounded border border-navy-4">{dist.count} {dist.count === 1 ? 'agent' : 'agents'}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-ink-2 italic text-center py-4">No downline team data registered.</p>}
            </div>
            <div className="card p-5 space-y-4 md:col-span-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">Rank Promotion Qualifications</h3>
              {teamStats.nextPromoProgress ? (
                <div className="space-y-4 text-xs">
                  <div>
                    <span className="block text-ink-2 text-[10px] uppercase tracking-wider mb-2">Advancement Target Rank: <strong className="text-gold-1">{teamStats.nextPromoProgress.targetRankName} ({teamStats.nextPromoProgress.targetRankCode})</strong></span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between font-semibold">
                      <span className="text-ink-2">1. Lifetime Business Volume (Personal)</span>
                      <span className="text-ink-1">{formatINR(teamStats.nextPromoProgress.businessAchieved)} / {formatINR(teamStats.nextPromoProgress.businessTarget)}</span>
                    </div>
                    <div className="w-full bg-navy-2 rounded-full h-2 overflow-hidden border border-navy-4">
                      <div className={`h-2 rounded-full transition-all duration-300 ${teamStats.nextPromoProgress.businessQualified ? 'bg-ok' : 'bg-gold'}`} style={{ width: `${Math.min(100, (teamStats.nextPromoProgress.businessAchieved / teamStats.nextPromoProgress.businessTarget) * 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-ink-2">Progress: {Math.round(Math.min(100, (teamStats.nextPromoProgress.businessAchieved / teamStats.nextPromoProgress.businessTarget) * 100))}%</span>
                      <span className={teamStats.nextPromoProgress.businessQualified ? 'text-ok font-bold' : 'text-gold font-bold'}>{teamStats.nextPromoProgress.businessQualified ? 'Achieved' : 'Pending'}</span>
                    </div>
                  </div>
                  {teamStats.nextPromoProgress.requiredRankCode ? (
                    <div className="space-y-1.5 pt-2 border-t border-navy-4/50">
                      <div className="flex justify-between font-semibold">
                        <span className="text-ink-2">2. Promoted Downline Members (Rank &ge; {teamStats.nextPromoProgress.requiredRankCode})</span>
                        <span className="text-ink-1">{teamStats.nextPromoProgress.actualCount} / {teamStats.nextPromoProgress.requiredCount} Members</span>
                      </div>
                      <div className="w-full bg-navy-2 rounded-full h-2 overflow-hidden border border-navy-4">
                        <div className={`h-2 rounded-full transition-all duration-300 ${teamStats.nextPromoProgress.downlineQualified ? 'bg-ok' : 'bg-gold'}`} style={{ width: `${Math.min(100, (teamStats.nextPromoProgress.actualCount / teamStats.nextPromoProgress.requiredCount) * 100)}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-ink-2">Progress: {Math.round(Math.min(100, (teamStats.nextPromoProgress.actualCount / teamStats.nextPromoProgress.requiredCount) * 100))}%</span>
                        <span className={teamStats.nextPromoProgress.downlineQualified ? 'text-ok font-bold' : 'text-gold font-bold'}>{teamStats.nextPromoProgress.downlineQualified ? 'Qualified' : 'Pending'}</span>
                      </div>
                    </div>
                  ) : <div className="text-[10px] text-ink-2 italic pt-2 border-t border-navy-4/50">No downline team promotion conditions required.</div>}
                  <div className="pt-3 border-t border-navy-4 flex justify-between items-center">
                    <span className="text-ink-2 font-medium">Evaluation Summary:</span>
                    <span className={`px-2.5 py-0.5 rounded text-[10px] uppercase font-extrabold tracking-wider border ${(teamStats.nextPromoProgress.businessQualified && teamStats.nextPromoProgress.downlineQualified) ? 'bg-ok/10 text-ok border-ok/25' : 'bg-gold-1/10 text-gold border-gold-1/25'}`}>
                      {(teamStats.nextPromoProgress.businessQualified && teamStats.nextPromoProgress.downlineQualified) ? 'Eligible for Promotion Cycle' : 'Qualification Pending'}
                    </span>
                  </div>
                </div>
              ) : <p className="text-xs text-ink-2 italic text-center py-6">You have reached the maximum system rank or promotion rules are not configured.</p>}
            </div>
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
                <label className="label">PAN Number</label>
                <input className="field font-mono uppercase" maxLength={10} placeholder="ABCDE1234F" {...register('panNumber')} />
                {errors.panNumber && <p className="err">{errors.panNumber.message}</p>}
              </div>
            </div>
            <div>
              <label className="label">Temporary Password (optional)</label>
              <input className="field" type="password" placeholder="Auto if blank" {...register('password')} />
              {errors.password && <p className="err">{errors.password.message}</p>}
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
