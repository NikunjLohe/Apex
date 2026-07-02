import { useState, useMemo, useEffect } from 'react'
import { collection, doc, getDocs, getDoc, setDoc, writeBatch, serverTimestamp, query, where, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useRanks } from '../../contexts/RanksContext'
import { useCollection } from '../../hooks/useFirestore'
import { formatINR, fmtDate } from '../../utils/format'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import RankBadge from '../../components/ui/RankBadge'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import toast from 'react-hot-toast'
import { ITrophy, ICheck, IAlert, IClock, IUsers, IDoc, IPlus } from '../../components/ui/icons'

export default function Promotions() {
  const { profile } = useAuth()
  const { config: ranksConfig, getRank, nextRank } = useRanks()

  const [activeTab, setActiveTab] = useState('dashboard')
  const [selectedCycle, setSelectedCycle] = useState('Year ' + new Date().getFullYear())
  const [loading, setLoading] = useState(false)
  const [evaluating, setEvaluating] = useState(false)

  const [recommendations, setRecommendations] = useState([])
  const [historyList, setHistoryList] = useState([])

  // Fetch recommendations and history
  const fetchCycleData = async () => {
    setLoading(true)
    
    // 1. Fetch recommendations
    try {
      const recSnap = await getDocs(
        query(collection(db, 'promotion_recommendations'), where('cycle', '==', selectedCycle))
      )
      const recs = []
      recSnap.forEach(d => {
        recs.push({ id: d.id, ...d.data() })
      })
      setRecommendations(recs)
    } catch (err) {
      console.warn('Could not load promotion recommendations (database rules might need updating):', err)
      setRecommendations([])
    }

    // 2. Fetch history
    try {
      const histSnap = await getDocs(
        query(collection(db, 'promotions_history'), where('promotionCycle', '==', selectedCycle))
      )
      const hist = []
      histSnap.forEach(d => {
        hist.push({ id: d.id, ...d.data() })
      })
      setHistoryList(hist)
    } catch (err) {
      console.warn('Could not load promotions history (database rules might need updating):', err)
      setHistoryList([])
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchCycleData()
  }, [selectedCycle])

  // Run Yearly Evaluation Engine
  const handleRunEvaluation = async () => {
    setEvaluating(true)
    const toastId = toast.loading(`Starting promotion evaluation for ${selectedCycle}...`)
    try {
      // 1. Fetch active users
      const usersSnap = await getDocs(collection(db, 'users'))
      const usersList = []
      usersSnap.forEach(d => {
        usersList.push({ id: d.id, ...d.data() })
      })

      // 2. Fetch promotion rules configuration document
      const rulesDoc = await getDoc(doc(db, 'config', 'promotions'))
      const rulesConfig = rulesDoc.exists() ? (rulesDoc.data().rules || {}) : {}

      // Map helper to fetch all children recursively to find downline
      const getDownline = (parentId, list) => {
        const children = list.filter(u => u.referredBy === parentId)
        let subtree = [...children]
        children.forEach(c => {
          subtree = [...subtree, ...getDownline(c.id, list)]
        })
        return subtree
      }

      const batch = writeBatch(db)
      let recommendationCount = 0

      for (const agent of usersList) {
        const currentRankNum = Number(agent.rank) || 1
        const nextRankObj = nextRank(currentRankNum)

        // Max rank agent skipped
        if (!nextRankObj) continue

        const rule = rulesConfig[nextRankObj.code] || { businessTarget: 0, requiredPromotedCount: 0, requiredPromotedRank: '' }
        
        // Target 1: Business Target check
        const bizAchieved = agent.businessVolume || 0
        const bizTarget = rule.businessTarget || 0
        const isBizQualified = bizAchieved >= bizTarget

        // Target 2: Promoted Downline check
        const agentDownline = getDownline(agent.id, usersList)
        const reqRankCode = rule.requiredPromotedRank || ''
        const reqRankNum = ranksConfig?.RANKS?.find(r => r.code === reqRankCode)?.rank || 0
        
        const qualifiedDownlineCount = agentDownline.filter(u => (Number(u.rank) || 0) >= reqRankNum).length
        const isDownlineQualified = reqRankCode ? (qualifiedDownlineCount >= rule.requiredPromotedCount) : true

        const satisfiesAll = isBizQualified && isDownlineQualified

        // Only create/update recommendation if some rule targets are defined
        if (bizTarget > 0 || reqRankCode) {
          recommendationCount++
          const recRef = doc(collection(db, 'promotion_recommendations'))
          batch.set(recRef, {
            agentId: agent.id,
            agentName: agent.name,
            sponsorCode: agent.sponsorCode || '—',
            currentRank: currentRankNum,
            currentRankCode: getRank(currentRankNum).code,
            targetRank: nextRankObj.rank,
            targetRankCode: nextRankObj.code,
            cycle: selectedCycle,
            businessAchieved: bizAchieved,
            businessTarget: bizTarget,
            promotedDownlineRank: reqRankCode,
            promotedDownlineCount: qualifiedDownlineCount,
            promotedDownlineTarget: rule.requiredPromotedCount || 0,
            status: 'recommended',
            eligible: satisfiesAll,
            remarks: satisfiesAll ? 'Meets all target criteria' : 'Target requirements pending',
            createdAt: serverTimestamp(),
          })
        }
      }

      if (recommendationCount === 0) {
        toast.error('No recommendation rules defined in Promotion settings.', { id: toastId })
        setEvaluating(false)
        return
      }

      await batch.commit()
      toast.success(`Generated ${recommendationCount} recommendation evaluations successfully!`, { id: toastId })
      fetchCycleData()
    } catch (err) {
      console.error(err)
      toast.error('Failed to run promotion evaluations: ' + err.message, { id: toastId })
    } finally {
      setEvaluating(false)
    }
  }

  // Process approval, rejections, holds
  const handleProcessRecommendation = async (rec, nextStatus, remarks = '') => {
    const toastId = toast.loading(`Updating recommendation to ${nextStatus}...`)
    try {
      const recRef = doc(db, 'promotion_recommendations', rec.id)
      
      if (nextStatus === 'approved') {
        const batch = writeBatch(db)

        // 1. Update user's rank field in users collection
        batch.update(doc(db, 'users', rec.agentId), {
          rank: Number(rec.targetRank)
        })

        // 2. Save entry to promotions_history
        const historyRef = doc(collection(db, 'promotions_history'))
        batch.set(historyRef, {
          agentId: rec.agentId,
          agentName: rec.agentName,
          sponsorCode: rec.sponsorCode,
          oldRank: rec.currentRank,
          oldRankCode: rec.currentRankCode,
          newRank: rec.targetRank,
          newRankCode: rec.targetRankCode,
          businessAchieved: rec.businessAchieved,
          promotionCycle: rec.cycle,
          approvedBy: profile?.name || 'Admin',
          approvedDate: serverTimestamp(),
          status: 'approved',
          remarks: remarks || 'Criteria completed successfully',
          createdAt: serverTimestamp(),
        })

        // 3. Create Notification alert entry for agent
        const notificationRef = doc(collection(db, 'notifications'))
        batch.set(notificationRef, {
          userId: rec.agentId,
          title: 'Rank Promotion Approved! 🎉',
          message: `Congratulations! Your rank advancement to ${rec.targetRankCode} (${getRank(rec.targetRank).name}) has been approved for the ${selectedCycle} cycle.`,
          read: false,
          createdAt: serverTimestamp(),
        })

        // 4. Update recommendation status
        batch.update(recRef, { status: 'approved', remarks })

        await batch.commit()
      } else {
        // Hold or Reject
        const updates = { status: nextStatus, remarks }
        await updateDoc(recRef, updates)

        if (nextStatus === 'rejected') {
          // Push notification of rejection
          const notificationRef = doc(collection(db, 'notifications'))
          await setDoc(notificationRef, {
            userId: rec.agentId,
            title: 'Promotion Request Update',
            message: `Your advancement evaluation to ${rec.targetRankCode} for ${selectedCycle} was marked as Rejected/Pending. Please contact management.`,
            read: false,
            createdAt: serverTimestamp(),
          })
        }
      }

      toast.success(`Advancement marked as ${nextStatus}!`, { id: toastId })
      fetchCycleData()
    } catch (err) {
      console.error(err)
      toast.error('Transaction processing failed', { id: toastId })
    }
  }

  // Reports aggregations
  const reportStats = useMemo(() => {
    if (loading) return {}

    // 1. Rank distribution counts
    const rankDistribution = {}
    recommendations.forEach(r => {
      const targetCode = r.targetRankCode
      rankDistribution[targetCode] = (rankDistribution[targetCode] || 0) + 1
    })

    // 2. Promotion Success Rate
    const totalCount = recommendations.length
    const approvedCount = recommendations.filter(r => r.status === 'approved').length
    const successRate = totalCount > 0 ? (approvedCount / totalCount) * 100 : 0

    return {
      rankDistribution,
      successRate,
      totalCount,
      approvedCount
    }
  }, [recommendations, loading])

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Title */}
      <div className="flex justify-between items-center border-b border-navy-4/50 pb-4">
        <div>
          <h2 className="font-serif text-2xl font-bold text-ink-1 tracking-tight">Promotion Engine Center</h2>
          <p className="text-xs text-ink-2">Process yearly rank advancements, audit requirements, and inspect timeline logs.</p>
        </div>
      </div>

      {/* Control Configuration Bar */}
      <div className="card p-5 bg-navy-3 border border-navy-4 flex flex-wrap items-end gap-4 justify-between">
        <div className="w-56">
          <label className="label">Active Promotion Cycle Year</label>
          <select className="field text-xs font-semibold" value={selectedCycle} onChange={e => setSelectedCycle(e.target.value)}>
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(yr => (
              <option key={yr} value={`Year ${yr}`}>Year {yr}</option>
            ))}
          </select>
        </div>

        <button 
          onClick={handleRunEvaluation} 
          disabled={evaluating}
          className="btn-gold px-6 py-2.5 text-xs uppercase tracking-wider font-bold"
        >
          {evaluating ? 'Running Evaluations...' : 'Run Yearly Evaluation Process'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-navy-4">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={`pb-2.5 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
            activeTab === 'dashboard' 
              ? 'border-gold text-gold-1' 
              : 'border-transparent text-ink-2 hover:text-ink-1'
          }`}
        >
          Evaluation Queue ({recommendations.filter(r => r.status === 'recommended').length})
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`pb-2.5 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
            activeTab === 'history' 
              ? 'border-gold text-gold-1' 
              : 'border-transparent text-ink-2 hover:text-ink-1'
          }`}
        >
          Advancement History ({historyList.length})
        </button>
        <button 
          onClick={() => setActiveTab('reports')}
          className={`pb-2.5 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
            activeTab === 'reports' 
              ? 'border-gold text-gold-1' 
              : 'border-transparent text-ink-2 hover:text-ink-1'
          }`}
        >
          Performance Reports
        </button>
      </div>

      {/* Loading Skeleton */}
      {loading && <SkeletonTable rows={6} cols={7} />}

      {/* Tab 1: Queue Table */}
      {!loading && activeTab === 'dashboard' && (
        recommendations.length === 0 ? (
          <EmptyState 
            icon={<ITrophy size={24} />} 
            title="Evaluation Queue Empty" 
            message="Click the Year button above to calculate evaluations for active agents."
          />
        ) : (
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">
              Pending Promotions Queue ({recommendations.filter(r => r.status === 'recommended').length} Pending)
            </h3>
            <div className="table-wrap">
              <table className="tbl text-xs">
                <thead>
                  <tr>
                    <th>Agent Name</th>
                    <th>Current Rank</th>
                    <th>Target Rank</th>
                    <th>Business Volume</th>
                    <th>Downline Target</th>
                    <th>Criteria</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recommendations.map(rec => (
                    <tr key={rec.id} className={rec.status !== 'recommended' ? 'opacity-50' : ''}>
                      <td>
                        <span className="font-semibold text-ink-1 block">{rec.agentName}</span>
                        <span className="text-[10px] text-ink-2 font-mono">{rec.sponsorCode}</span>
                      </td>
                      <td><RankBadge rank={rec.currentRank} size="sm" showName /></td>
                      <td><span className="text-gold font-bold">{rec.targetRankCode}</span></td>
                      <td>
                        <span className="block font-semibold text-ink-1">{formatINR(rec.businessAchieved)}</span>
                        <span className="block text-[10px] text-ink-2">Target: {formatINR(rec.businessTarget)}</span>
                      </td>
                      <td>
                        {rec.promotedDownlineRank ? (
                          <>
                            <span className="block font-semibold text-ink-1">
                              {rec.promotedDownlineCount} / {rec.promotedDownlineTarget} Members
                            </span>
                            <span className="block text-[10px] text-ink-2">Rank &ge; {rec.promotedDownlineRank}</span>
                          </>
                        ) : '—'}
                      </td>
                      <td>
                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${
                          rec.eligible 
                            ? 'bg-ok/10 text-ok border-ok/25' 
                            : 'bg-gold-1/10 text-gold border-gold-1/25'
                        }`}>
                          {rec.eligible ? 'Qualified' : 'Pending'}
                        </span>
                      </td>
                      <td className="text-right space-x-2">
                        {rec.status === 'recommended' ? (
                          <>
                            <button 
                              onClick={() => handleProcessRecommendation(rec, 'approved')} 
                              className="btn-gold py-1 px-3 text-[10px] uppercase font-bold"
                            >
                              Approve
                            </button>
                            <button 
                              onClick={() => handleProcessRecommendation(rec, 'rejected')} 
                              className="btn-ghost py-1 px-3 text-[10px] uppercase font-bold text-danger hover:bg-danger/10 hover:border-danger/20 border border-transparent rounded"
                            >
                              Reject
                            </button>
                          </>
                        ) : (
                          <span className="text-[10px] text-ink-2 italic font-semibold capitalize">
                            Processed: {rec.status}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Tab 2: History Table */}
      {!loading && activeTab === 'history' && (
        historyList.length === 0 ? (
          <EmptyState 
            icon={<IClock size={24} />} 
            title="History Log Empty" 
            message="Past approved promotions for the cycle will appear in this log."
          />
        ) : (
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">
              Promotions History Logs
            </h3>
            <div className="table-wrap">
              <table className="tbl text-xs">
                <thead>
                  <tr>
                    <th>Date Approved</th>
                    <th>Agent Name</th>
                    <th>Old Rank</th>
                    <th>New Rank</th>
                    <th>Business Achieved</th>
                    <th>Approved By</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {historyList.map(h => (
                    <tr key={h.id}>
                      <td className="font-mono text-ink-2">{h.approvedDate ? fmtDate(h.approvedDate) : '—'}</td>
                      <td>
                        <span className="font-semibold text-ink-1 block">{h.agentName}</span>
                        <span className="text-[10px] text-ink-2 font-mono">{h.sponsorCode}</span>
                      </td>
                      <td>{h.oldRankCode}</td>
                      <td><span className="text-gold font-bold">{h.newRankCode}</span></td>
                      <td className="font-mono text-ink-1 font-semibold">{formatINR(h.businessAchieved)}</td>
                      <td className="text-ink-2 font-semibold">{h.approvedBy}</td>
                      <td className="text-ink-2 italic">{h.remarks || 'Criteria Met'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Tab 3: Reports */}
      {!loading && activeTab === 'reports' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card p-5 space-y-4 md:col-span-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">
              Evaluations Metrics
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-navy-2/30 p-4 rounded border border-navy-4/50 text-center">
                <span className="text-[10px] text-ink-2 uppercase block">Total Cycles Evaluated</span>
                <span className="text-lg font-bold text-ink-1 mt-1 block">{reportStats.totalCount}</span>
              </div>
              <div className="bg-navy-2/30 p-4 rounded border border-navy-4/50 text-center">
                <span className="text-[10px] text-ink-2 uppercase block">Advancements Approved</span>
                <span className="text-lg font-bold text-ok mt-1 block">{reportStats.approvedCount}</span>
              </div>
            </div>
            
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between font-semibold text-xs text-ink-2">
                <span>Cycle Advancement Success Rate</span>
                <span className="text-ink-1 font-mono">{Math.round(reportStats.successRate)}%</span>
              </div>
              <div className="w-full bg-navy-2 rounded-full h-2 overflow-hidden border border-navy-4">
                <div className="bg-gold h-2 rounded-full transition-all duration-300" style={{ width: `${reportStats.successRate}%` }} />
              </div>
            </div>
          </div>

          <div className="card p-5 space-y-4 md:col-span-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">
              Target Promotion Advancements by Rank Tier
            </h3>
            {Object.keys(reportStats.rankDistribution).length > 0 ? (
              <div className="space-y-3.5">
                {Object.entries(reportStats.rankDistribution).map(([rkCode, count]) => (
                  <div key={rkCode} className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="font-semibold text-ink-1 uppercase">Target rank: {rkCode}</span>
                      <span className="text-ink-2 font-mono">{count} recommendations</span>
                    </div>
                    <div className="w-full bg-navy-2 rounded-full h-1.5 overflow-hidden border border-navy-4">
                      <div 
                        className="bg-ok h-1.5 rounded-full" 
                        style={{ width: `${Math.min(100, (count / reportStats.totalCount) * 100)}%` }} 
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink-2 italic text-center py-6">Run evaluations to view distribution stats graphs.</p>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
