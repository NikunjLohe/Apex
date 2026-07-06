import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDoc, useCollection } from '../../hooks/useFirestore'
import { fmtDate, formatINR } from '../../utils/format'
import StatusBadge from '../../components/ui/StatusBadge'
import { SkeletonStats, SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { IDoc, IUsers, ICash, IBuilding, ISettings } from '../../components/ui/icons'
import { addYears } from 'date-fns'
import { useRanks } from '../../contexts/RanksContext'
import { where } from 'firebase/firestore'

export default function PolicyDetail() {
  const { id } = useParams()
  const policyDoc = useDoc(id ? `plans/${id}` : null)
  const users = useCollection('users')
  const branches = useCollection('branches')
  
  const p = policyDoc.data
  const policyNumber = p?.policyNumber || ''
  
  const ledgerDoc = useCollection(
    policyNumber ? 'commission_ledger' : null,
    useMemo(() => [where('policyNumber', '==', policyNumber)], [policyNumber]),
    policyNumber
  )
  
  const { ranksList } = useRanks()
  const [explainOpen, setExplainOpen] = useState(false)

  // Calculate maturity date if not explicitly in Firestore
  const maturityDate = useMemo(() => {
    if (!p?.startDate || !p?.duration) return null
    const start = p.startDate.seconds ? new Date(p.startDate.seconds * 1000) : new Date(p.startDate)
    return addYears(start, p.duration)
  }, [p?.startDate, p?.duration])

  // Get agent profile
  const agent = useMemo(() => {
    if (!p?.agentId || !users.data) return null
    return users.data.find(u => u.id === p.agentId)
  }, [p?.agentId, users.data])

  // Get branch name
  const branchName = useMemo(() => {
    if (!p?.branchId || !branches.data) return '—'
    return branches.data.find(b => b.id === p.branchId)?.name || '—'
  }, [p?.branchId, branches.data])

  // Calculate total business value of this policy
  const businessValue = useMemo(() => {
    if (!p) return 0
    if (p.monthlyAmount > 0) {
      // RD: monthly deposit * 12 months * term duration
      return p.monthlyAmount * 12 * (p.duration || 1)
    }
    // FD / Pension: Lump sum amount
    return p.fdAmount || 0
  }, [p])

  const usersMap = useMemo(() => {
    if (!users.data) return {}
    const idMap = {}
    users.data.forEach(u => {
      idMap[u.id] = u
    })
    return idMap
  }, [users.data])

  const traversedChain = useMemo(() => {
    if (!agent || !usersMap) return []
    const chain = []
    let cur = agent
    while (cur) {
      chain.push(cur)
      if (cur.referredBy && usersMap[cur.referredBy]) {
        cur = usersMap[cur.referredBy]
      } else {
        break
      }
    }
    return chain
  }, [agent, usersMap])

  // Map each rank (1 to 18) to the parsed record or skipped state
  const breakdownRows = useMemo(() => {
    if (!ranksList || ranksList.length === 0) return []
    const ledgerData = ledgerDoc.data || []
    
    // Sort ranks ascending
    const sortedRanks = [...ranksList].sort((a, b) => Number(a.rank) - Number(b.rank))
    
    let runningTotalPct = 0
    
    return sortedRanks.map(r => {
      const rankNum = Number(r.rank)
      // Find matching ledger entry for this rank
      const entry = ledgerData.find(c => {
        const ag = usersMap[c.agentId]
        return ag && Number(ag.rank) === rankNum
      })
      
      // Find matching agent in the traversed sponsor chain
      const agentInChain = traversedChain.find(a => Number(a.rank) === rankNum)
      
      let pct = 0
      let amt = 0
      let type = 'Differential'
      let skipped = false
      let skipReason = ''
      let agentName = '—'
      let agentCode = '—'
      let docId = null
      
      if (entry) {
        pct = Number(entry.percentage) || 0
        amt = Number(entry.amount) || 0
        type = entry.commissionType || (entry.compression ? 'Differential' : 'Direct')
        agentName = entry.agentName
        agentCode = entry.sponsorCode || usersMap[entry.agentId]?.sponsorCode || '—'
        docId = entry.id
        runningTotalPct += pct
      } else {
        skipped = true
        if (agentInChain) {
          agentName = agentInChain.name
          agentCode = agentInChain.sponsorCode || '—'
          // If the agent is in the chain but got no entry, they had 0 differential
          skipReason = 'Skipped (0 Differential)'
        } else if (agent && rankNum < Number(agent.rank)) {
          skipReason = 'Skipped (Below Seller)'
        } else {
          skipReason = 'Skipped (No Agent at Rank)'
        }
      }
      
      return {
        rank: rankNum,
        rankCode: r.code,
        rankName: r.name,
        agentName,
        agentCode,
        type,
        percentage: pct,
        amount: amt,
        runningTotalPct,
        skipped,
        skipReason,
        docId
      }
    })
  }, [ranksList, ledgerDoc.data, usersMap, traversedChain, agent])

  const timelineData = useMemo(() => {
    return traversedChain.map(agent => {
      const entry = (ledgerDoc.data || []).find(c => c.agentId === agent.id)
      const rankObj = ranksList.find(r => Number(r.rank) === Number(agent.rank))
      const rankCode = rankObj ? rankObj.code : `Rank ${agent.rank}`
      return {
        name: agent.name,
        code: agent.sponsorCode,
        rank: agent.rank,
        rankCode,
        amount: entry ? entry.amount : 0,
        percentage: entry ? entry.percentage : 0,
        type: entry ? (entry.commissionType || (entry.compression ? 'Differential' : 'Direct')) : 'Skipped',
        skipped: !entry
      }
    })
  }, [traversedChain, ledgerDoc.data, ranksList])

  // Summary card metrics
  const paidRanks = useMemo(() => breakdownRows.filter(r => !r.skipped), [breakdownRows])
  const totalDistributed = useMemo(() => paidRanks.reduce((sum, r) => sum + r.percentage, 0), [paidRanks])
  const totalPaid = useMemo(() => paidRanks.reduce((sum, r) => sum + r.amount, 0), [paidRanks])
  const highestRankObj = useMemo(() => paidRanks.length > 0 ? paidRanks[paidRanks.length - 1] : null, [paidRanks])
  const lowestRankObj = useMemo(() => paidRanks.length > 0 ? paidRanks[0] : null, [paidRanks])

  const loading = policyDoc.loading || users.loading || branches.loading || ledgerDoc.loading

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="card h-28 animate-pulse bg-navy-2" />
        <SkeletonStats count={2} />
        <SkeletonTable rows={4} cols={4} />
      </div>
    )
  }

  if (!policyDoc.exists) {
    return (
      <div className="mx-auto max-w-md py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-ink-1">Policy Certificate Not Found</h2>
        <p className="text-sm text-ink-2">This policy record does not exist in the system.</p>
        <Link to="/admin/policies" className="btn-gold py-2 px-4 text-xs font-semibold inline-block">Back to Policies</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header Info */}
      <div className="card relative overflow-hidden p-6 border-l-4 border-gold-1 bg-navy-3">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold-1/5 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-card border border-gold-1/25 bg-gold-1/10 text-gold-1">
              <IDoc size={28} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-2xl font-bold text-ink-1 tracking-tight">Policy #{p.policyNumber || '—'}</h1>
                <StatusBadge status={p.status || 'active'} />
              </div>
              <p className="text-xs text-ink-2 mt-0.5 font-mono">Product: {p.type || '—'}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Link to="/admin/policies" className="btn-ghost py-2 px-4 text-xs font-bold uppercase tracking-wider">
              Back to List
            </Link>
          </div>
        </div>
      </div>

      {/* Grid panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Columns - Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Policy Information */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IDoc size={16} /> Policy Credentials & Deposit Stats
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-3.5">
                <div>
                  <span className="block text-[10px] text-ink-2">Plan Product</span>
                  <span className="font-semibold text-ink-1 uppercase">{p.type || '—'}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-ink-2">Plan Term (Duration)</span>
                  <span className="font-semibold text-ink-1">{p.duration || 1} {p.duration === 1 ? 'Year' : 'Years'}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-ink-2">Deposit Value</span>
                  {p.monthlyAmount > 0 ? (
                    <span className="font-semibold text-ink-1">{formatINR(p.monthlyAmount)} /month (RD)</span>
                  ) : (
                    <span className="font-semibold text-ink-1">{formatINR(p.fdAmount)} Lump Sum (FD)</span>
                  )}
                </div>
              </div>

              <div className="space-y-3.5">
                <div>
                  <span className="block text-[10px] text-ink-2">Policy Start Date</span>
                  <span className="font-semibold text-ink-1 font-mono">{p.startDate ? fmtDate(p.startDate) : '—'}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-ink-2">Plan Maturity Date</span>
                  <span className="font-semibold text-ink-1 font-mono">{maturityDate ? fmtDate(maturityDate) : '—'}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-ink-2">Branch Allocated</span>
                  <span className="font-semibold text-ink-1">{branchName}</span>
                </div>
              </div>
            </div>

            {/* Business value summary banner */}
            <div className="bg-navy-2/30 border border-navy-4 rounded p-4 flex justify-between items-center text-xs mt-2">
              <div>
                <span className="block text-[10px] text-ink-2 uppercase tracking-wide">Total Cumulative Business Value</span>
                <span className="text-xl font-bold font-serif text-ink-1 mt-0.5 block">{formatINR(businessValue)}</span>
              </div>
              <ICash size={24} className="text-gold-1/60" />
            </div>
          </div>

          {/* Phase 4 Commission Engine Warning Alert Card */}
          <div className="card p-5 space-y-4 border border-dashed border-gold-1/30 bg-gold-1/5">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-gold-1/20 flex items-center gap-2">
              <ISettings size={16} /> Commission Allocation Diagnostics (Phase 4)
            </h3>
            <div className="space-y-3 text-xs text-ink-2">
              <p>
                This policy has been successfully imported and verified from the bank approvals sheet. Payouts and commission percentages mapped under the commission master settings are currently in the queue.
              </p>
              <div className="flex flex-wrap gap-4 text-[10px] border-t border-gold-1/10 pt-3">
                <div className="flex gap-1.5 items-center">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-gold-1" />
                  <span className="text-ink-1 font-semibold">Commissions Status:</span>
                  <span className="font-mono bg-navy-2 px-1.5 py-0.5 rounded text-gold-1 font-bold">LOCKED_IN_QUEUE</span>
                </div>
                <div className="flex gap-1.5 items-center">
                  <span className="text-ink-1 font-semibold">Calculation Model:</span>
                  <span className="font-mono bg-navy-2 px-1.5 py-0.5 rounded text-ink-2">Yearly-Tiered Breakdown</span>
                </div>
              </div>
            </div>
          </div>

          {/* Commission Allocation Breakdown */}
          <div className="card p-5 space-y-6">
            <div className="border-b border-navy-4/50 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan flex items-center gap-2">
                  <ISettings size={16} /> Commission Allocation Breakdown
                </h3>
                <p className="text-[11px] text-ink-2 mt-0.5">Real-time sponsor hierarchy calculations from the live ledger database.</p>
              </div>
            </div>

            {/* Visual Commission Timeline */}
            {timelineData.length > 0 && (
              <div className="bg-navy-2/30 border border-navy-4 rounded-card p-5 space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gold-tan">Commission Payout Flow Timeline</h4>
                <div className="flex flex-col space-y-3.5 relative pl-4 border-l-2 border-navy-4">
                  {timelineData.map((node, index) => (
                    <div key={index} className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      {/* Timeline Dot Indicator */}
                      <span className={`absolute -left-[21px] top-1.5 h-2 w-2 rounded-full border ${node.skipped ? 'bg-navy-3 border-ink-2' : 'bg-gold-1 border-gold-1'} ring-4 ring-navy-1`} />
                      
                      <div className="flex items-center gap-2">
                        <span className="font-mono bg-navy-2 px-1.5 py-0.5 rounded text-[10px] text-gold-1 font-bold">{node.rankCode}</span>
                        <span className="font-semibold text-ink-1">{node.name}</span>
                        <span className="text-[10px] text-ink-2 font-mono">({node.code})</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {node.skipped ? (
                          <span className="text-[9.5px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-navy-2 text-ink-2 border border-navy-4">
                            Skipped (0 Differential)
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-[9.5px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-gold-1/10 text-gold-1 border border-gold-1/25">
                              {node.type}
                            </span>
                            <span className="font-mono text-gold font-bold">+{Number(node.percentage).toFixed(2)}%</span>
                            <span className="font-mono font-bold text-ink-1">({formatINR(node.amount)})</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Breakdown Table */}
            <div className="overflow-x-auto rounded border border-navy-4 bg-navy-2/20">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-navy-4 bg-navy-2/65 text-[10px] uppercase font-bold tracking-wider text-ink-2">
                    <th className="py-2.5 px-3">Rank</th>
                    <th className="py-2.5 px-3">Rank Name</th>
                    <th className="py-2.5 px-3">Agent Name</th>
                    <th className="py-2.5 px-3">Agent Code</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3 text-right">Commission %</th>
                    <th className="py-2.5 px-3 text-right">Commission Amount</th>
                    <th className="py-2.5 px-3 text-right">Running Total %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-4">
                  {breakdownRows.map((row) => (
                    <tr key={row.rank} className={`hover:bg-navy-2/30 transition-colors ${row.skipped ? 'text-ink-2/60 bg-navy-2/5' : 'text-ink-1 font-medium'}`}>
                      <td className="py-3 px-3 font-mono">{row.rank}</td>
                      <td className="py-3 px-3 uppercase text-[10.5px] font-semibold text-gold-tan">{row.rankCode} - {row.rankName}</td>
                      <td className="py-3 px-3">{row.agentName}</td>
                      <td className="py-3 px-3 font-mono">{row.agentCode}</td>
                      <td className="py-3 px-3">
                        {row.skipped ? (
                          <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-navy-2 text-ink-2/70 border border-navy-4">
                            {row.skipReason}
                          </span>
                        ) : (
                          <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${row.type === 'Direct' ? 'bg-gold-1/10 text-gold-1 border border-gold-1/25' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                            {row.type}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono">{Number(row.percentage).toFixed(2)}%</td>
                      <td className="py-3 px-3 text-right font-mono font-semibold text-gold">{row.amount > 0 ? formatINR(row.amount) : '₹0'}</td>
                      <td className="py-3 px-3 text-right font-mono">{Number(row.runningTotalPct).toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary Card */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 bg-navy-2/25 border border-navy-4 rounded-card p-5">
              <div className="col-span-full border-b border-navy-4/50 pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gold-tan">Commission Summary</h4>
              </div>
              <div className="space-y-1.5">
                <span className="block text-[10px] text-ink-2 uppercase tracking-wide">Total Records</span>
                <span className="text-xl font-bold font-serif text-ink-1 block">{paidRanks.length}</span>
              </div>
              <div className="space-y-1.5">
                <span className="block text-[10px] text-ink-2 uppercase tracking-wide">Total Distributed</span>
                <span className="text-xl font-bold font-serif text-gold block">{Number(totalDistributed).toFixed(2)}%</span>
              </div>
              <div className="space-y-1.5">
                <span className="block text-[10px] text-ink-2 uppercase tracking-wide">Total Commission Paid</span>
                <span className="text-xl font-bold font-serif text-ink-1 block">{formatINR(totalPaid)}</span>
              </div>
              <div className="space-y-1.5 border-t border-navy-4/50 pt-2 sm:border-0 sm:pt-0">
                <span className="block text-[10px] text-ink-2 uppercase tracking-wide">Highest Rank Paid</span>
                <span className="text-xs font-semibold text-ink-1 uppercase block">
                  {highestRankObj ? `${highestRankObj.rank} (${highestRankObj.rankCode})` : '—'}
                </span>
              </div>
              <div className="space-y-1.5 border-t border-navy-4/50 pt-2 sm:border-0 sm:pt-0">
                <span className="block text-[10px] text-ink-2 uppercase tracking-wide">Lowest Rank Paid</span>
                <span className="text-xs font-semibold text-ink-1 uppercase block">
                  {lowestRankObj ? `${lowestRankObj.rank} (${lowestRankObj.rankCode})` : '—'}
                </span>
              </div>
            </div>

            {/* Explanation Collapsible Panel */}
            <div className="border border-navy-4 rounded-card overflow-hidden">
              <button
                type="button"
                onClick={() => setExplainOpen(!explainOpen)}
                className="w-full flex items-center justify-between bg-navy-2/30 p-4 hover:bg-navy-2/50 transition-colors text-left"
              >
                <span className="text-xs font-bold uppercase tracking-wider text-ink-1">How was this commission calculated?</span>
                <span className="text-xs text-gold-1 font-bold">{explainOpen ? 'Hide' : 'Show Details'}</span>
              </button>
              {explainOpen && (
                <div className="p-4 bg-navy-3 border-t border-navy-4 space-y-3.5 text-xs text-ink-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="block text-[10px] uppercase text-ink-2">Business Volume</span>
                      <span className="font-semibold text-ink-1 font-mono">{formatINR(businessValue)}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase text-ink-2">Plan Product</span>
                      <span className="font-semibold text-ink-1 uppercase font-mono">{p.type}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase text-ink-2">Calculation Method</span>
                      <span className="font-semibold text-ink-1">Differential Commission</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase text-ink-2">Maximum Configured Commission</span>
                      <span className="font-semibold text-ink-1 font-mono">{highestRankObj ? `${Number(highestRankObj.percentage).toFixed(2)}%` : '—'}</span>
                    </div>
                    <div className="col-span-2 border-t border-navy-4/50 pt-2.5">
                      <span className="block text-[10px] uppercase text-ink-2">Formula Explanation</span>
                      <p className="mt-1 leading-relaxed text-[11px]">
                        The commission engine traverses the upline hierarchy starting from the seller. For each level, it determines the commission rate from the Commission Master and subtracts the maximum rate encountered so far: <code>diffRate = Math.max(0, currentRate - maxRateEncountered)</code>. If two rates are equal (such as SVP and EVP), the differential evaluates to 0% and the level is skipped, assuring full transparency and keeping payouts matching the client's official structures.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Columns - Customer & Agent click cards */}
        <div className="space-y-6">
          {/* Linked Customer Profile */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IUsers size={16} /> Customer (CIF Owner)
            </h3>
            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-gold-1/10 border border-gold-1/35 flex items-center justify-center font-bold text-gold-1">
                  {p.customerName ? p.customerName.charAt(0) : 'C'}
                </div>
                <div>
                  <Link to={`/admin/customers/${p.customerId}`} className="font-semibold text-ink-1 hover:underline">
                    {p.customerName}
                  </Link>
                  <div className="text-[10px] text-ink-2 font-mono">CIF: {p.customerAccount || '—'}</div>
                </div>
              </div>
              <div className="pt-2 text-center">
                <Link to={`/admin/customers/${p.customerId}`} className="text-xs text-gold hover:underline font-bold">
                  View Customer Folder &rarr;
                </Link>
              </div>
            </div>
          </div>

          {/* Linked Agent Card */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50 flex items-center gap-2">
              <IUsers size={16} /> Submitting Agent
            </h3>
            {agent ? (
              <div className="space-y-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-navy-4 flex items-center justify-center font-bold text-gold-1">
                    {agent.name.charAt(0)}
                  </div>
                  <div>
                    <Link to={`/admin/members/${agent.id}`} className="font-semibold text-ink-1 hover:underline">
                      {agent.name}
                    </Link>
                    <div className="text-[10px] text-ink-2 font-mono">{agent.sponsorCode}</div>
                  </div>
                </div>
                <div className="border-t border-navy-4/50 pt-2 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-ink-2">Level Rank</span>
                    <span className="font-semibold text-ink-1 uppercase font-mono">{agent.rank}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-2">Phone</span>
                    <span className="font-mono text-ink-1">{agent.phone || '—'}</span>
                  </div>
                </div>
                <div className="pt-1 text-center">
                  <Link to={`/admin/members/${agent.id}`} className="text-xs text-gold hover:underline font-bold">
                    View Agent Dashboard &rarr;
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                <p className="text-ink-1 font-semibold">{p.agentName || '—'}</p>
                <p className="text-xs text-ink-2 italic py-1">Missing detailed database mapping record.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
