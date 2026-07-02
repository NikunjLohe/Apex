import { useState, useMemo } from 'react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../../firebase'
import { useCollection } from '../../hooks/useFirestore'
import { useRanks } from '../../contexts/RanksContext'
import { formatINR, fmtDate } from '../../utils/format'
import StatusBadge from '../../components/ui/StatusBadge'
import RankBadge from '../../components/ui/RankBadge'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import toast from 'react-hot-toast'
import * as xlsx from 'xlsx'
import { jsPDF } from 'jspdf'
import { IReport, IUsers, IDoc, ICash, IClock, ITrophy, IDownload } from '../../components/ui/icons'

export default function AllReports() {
  const { config: ranksConfig, getRank } = useRanks()

  // Load Firestore Collections
  const allUsers = useCollection('users')
  const allBranches = useCollection('branches')
  const allPlans = useCollection('plans')
  const allCommissions = useCollection('commissions')
  const allPayouts = useCollection('payouts')
  const allPromotions = useCollection('promotion_recommendations')

  // Tab State
  const [activeTab, setActiveTab] = useState('agents')

  // Global Filters State
  const [filterBranch, setFilterBranch] = useState('')
  const [filterRank, setFilterRank] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPlan, setFilterPlan] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const loading = allUsers.loading || allBranches.loading || allPlans.loading || allCommissions.loading || allPayouts.loading || allPromotions.loading

  const branchName = (branchId) => {
    if (!branchId) return '—'
    return allBranches.data.find(b => b.id === branchId)?.name || '—'
  }

  // 1. Filtered Agents list
  const agentsData = useMemo(() => {
    if (loading) return []
    return allUsers.data.filter(u => {
      if (filterBranch && u.branchId !== filterBranch) return false
      if (filterRank && String(u.rank) !== String(filterRank)) return false
      if (filterStatus && u.status !== filterStatus) return false
      
      const joinDateVal = u.joinDate?.seconds ? new Date(u.joinDate.seconds * 1000) : new Date(u.joinDate)
      if (!isNaN(joinDateVal.getTime())) {
        if (dateFrom && joinDateVal < new Date(dateFrom)) return false
        if (dateTo && joinDateVal > new Date(dateTo)) return false
      }
      return true
    })
  }, [allUsers.data, filterBranch, filterRank, filterStatus, dateFrom, dateTo, loading])

  // 2. Filtered Policies list
  const policiesData = useMemo(() => {
    if (loading) return []
    return allPlans.data.filter(p => {
      if (filterBranch && p.branchId !== filterBranch) return false
      if (filterPlan && p.type !== filterPlan) return false
      if (filterStatus && p.status !== filterStatus) return false
      
      const startVal = p.startDate?.seconds ? new Date(p.startDate.seconds * 1000) : new Date(p.startDate)
      if (!isNaN(startVal.getTime())) {
        if (dateFrom && startVal < new Date(dateFrom)) return false
        if (dateTo && startVal > new Date(dateTo)) return false
      }
      return true
    })
  }, [allPlans.data, filterBranch, filterPlan, filterStatus, dateFrom, dateTo, loading])

  // 3. Filtered Commissions list
  const commissionsData = useMemo(() => {
    if (loading) return []
    return allCommissions.data.filter(c => {
      if (filterStatus && c.status !== filterStatus) return false
      if (filterPlan && c.planCode !== filterPlan) return false
      
      const calcDate = c.calculationDate?.seconds ? new Date(c.calculationDate.seconds * 1000) : new Date(c.calculationDate)
      if (!isNaN(calcDate.getTime())) {
        if (dateFrom && calcDate < new Date(dateFrom)) return false
        if (dateTo && calcDate > new Date(dateTo)) return false
      }
      return true
    })
  }, [allCommissions.data, filterStatus, filterPlan, dateFrom, dateTo, loading])

  // 4. Filtered Payouts list
  const payoutsData = useMemo(() => {
    if (loading) return []
    return allPayouts.data.filter(p => {
      if (filterStatus && p.status !== filterStatus) return false
      return true
    })
  }, [allPayouts.data, filterStatus, loading])

  // 5. Filtered Promotions list
  const promotionsData = useMemo(() => {
    if (loading) return []
    return allPromotions.data.filter(p => {
      if (filterStatus && p.status !== filterStatus) return false
      if (filterRank && String(p.targetRank) !== String(filterRank)) return false
      return true
    })
  }, [allPromotions.data, filterStatus, filterRank, loading])

  // 6. Business Reports aggregations
  const businessStats = useMemo(() => {
    if (loading) return {}
    
    // Branch aggregations
    const branchSales = {}
    allBranches.data.forEach(b => {
      branchSales[b.id] = { name: b.name, total: 0 }
    })
    // Rank aggregations
    const rankSales = {}
    ranksConfig?.RANKS?.forEach(r => {
      rankSales[r.rank] = { name: r.name, code: r.code, total: 0 }
    })
    // Agent aggregations
    const agentSales = {}

    allPlans.data.forEach(p => {
      const isRD = p.type?.toLowerCase().startsWith('rd')
      const amount = isRD ? (p.monthlyAmount * 12) : (p.fdAmount || 0)

      if (p.branchId && branchSales[p.branchId]) {
        branchSales[p.branchId].total += amount
      }
      
      const agent = allUsers.data.find(u => u.id === p.agentId)
      if (agent) {
        const r = agent.rank || 1
        if (rankSales[r]) rankSales[r].total += amount
        
        const code = agent.sponsorCode || '—'
        if (!agentSales[code]) {
          agentSales[code] = { name: agent.name, code, total: 0 }
        }
        agentSales[code].total += amount
      }
    })

    return {
      branches: Object.values(branchSales).sort((a, b) => b.total - a.total),
      ranks: Object.values(rankSales).sort((a, b) => b.total - a.total),
      agents: Object.values(agentSales).sort((a, b) => b.total - a.total).slice(0, 10),
    }
  }, [allPlans.data, allBranches.data, allUsers.data, ranksConfig, loading])

  // Export to Excel trigger
  const handleExportExcel = () => {
    let sheetData = []
    let fileName = `apex-${activeTab}-report`

    if (activeTab === 'agents') {
      sheetData = agentsData.map(a => ({
        'Agent Name': a.name,
        'Agent ID': a.sponsorCode || '—',
        'Branch Office': branchName(a.branchId),
        'Rank Code': getRank(a.rank).code,
        'Personal Business': a.businessVolume || 0,
        'Status': a.status,
      }))
    } else if (activeTab === 'policies') {
      sheetData = policiesData.map(p => ({
        'Policy No.': p.policyNumber,
        'Client Name': p.customerName,
        'Agent Name': p.agentName,
        'Plan Product': p.type,
        'Maturity (Years)': p.duration,
        'Monthly Deposit': p.monthlyAmount || 0,
        'Lump-sum Deposit': p.fdAmount || 0,
        'Status': p.status,
      }))
    } else if (activeTab === 'commissions') {
      sheetData = commissionsData.map(c => ({
        'Agent Name': c.agentName,
        'Sponsor Code': c.sponsorCode,
        'Policy No.': c.policyNumber,
        'Product': c.planCode,
        'Cycle Month/Year': `${c.month}/${c.year}`,
        'Percentage (%)': c.percentage || 0,
        'Amount Earned': c.amount || 0,
        'Payout Status': c.status,
      }))
    } else if (activeTab === 'payouts') {
      sheetData = payoutsData.map(p => ({
        'Agent Name': p.agentName,
        'Sponsor Code': p.sponsorCode,
        'Payout Period': `${p.month}/${p.year}`,
        'MDA Commission': p.totalCommission || 0,
        'Field Allowance': p.mfa || 0,
        'Travel Allowance': p.ta || 0,
        'Net Payable': p.totalPayable || 0,
        'Payout Status': p.status,
      }))
    } else if (activeTab === 'promotions') {
      sheetData = promotionsData.map(p => ({
        'Agent Name': p.agentName,
        'Agent Code': p.sponsorCode,
        'Target Rank': p.targetRankCode,
        'Achieved BV': p.businessAchieved || 0,
        'Required BV': p.businessTarget || 0,
        'Recommendation Status': p.status,
      }))
    } else {
      toast.error('No tabular sheet data to export for this view')
      return
    }

    const ws = xlsx.utils.json_to_sheet(sheetData)
    const wb = xlsx.utils.book_new()
    xlsx.utils.book_append_sheet(wb, ws, 'Report')
    xlsx.writeFile(wb, `${fileName}.xlsx`)
    toast.success('Excel spreadsheet exported successfully!')
  }

  // Export to PDF trigger
  const handleExportPDF = () => {
    const doc = new jsPDF()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text(`Apex Operations Report - ${activeTab.toUpperCase()}`, 14, 18)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(`Generated Date: ${new Date().toLocaleDateString()} - Target: Production`, 14, 25)

    let y = 35
    if (activeTab === 'agents') {
      doc.text('Name / Code', 14, y)
      doc.text('Branch', 70, y)
      doc.text('Rank', 120, y)
      doc.text('Business Volume', 160, y)
      doc.line(14, y + 2, 195, y + 2)
      y += 8
      agentsData.forEach(a => {
        if (y > 280) { doc.addPage(); y = 20 }
        doc.text(`${a.name} (${a.sponsorCode || '—'})`, 14, y)
        doc.text(branchName(a.branchId), 70, y)
        doc.text(getRank(a.rank).code, 120, y)
        doc.text(formatINR(a.businessVolume || 0), 160, y)
        y += 7
      })
    } else if (activeTab === 'policies') {
      doc.text('Policy No / Client', 14, y)
      doc.text('Product', 80, y)
      doc.text('Deposit Value', 130, y)
      doc.text('Status', 170, y)
      doc.line(14, y + 2, 195, y + 2)
      y += 8
      policiesData.forEach(p => {
        if (y > 280) { doc.addPage(); y = 20 }
        const isRD = p.type?.toLowerCase().startsWith('rd')
        const val = isRD ? `${formatINR(p.monthlyAmount)} /mo` : formatINR(p.fdAmount)
        doc.text(`${p.policyNumber} - ${p.customerName}`, 14, y)
        doc.text(p.type || '—', 80, y)
        doc.text(val, 130, y)
        doc.text(p.status || 'active', 170, y)
        y += 7
      })
    } else {
      // General Fallback
      doc.text('This segment is exported in structured CSV/Excel format. Choose Export to Excel.', 14, y)
    }

    doc.save(`apex-${activeTab}-report.pdf`)
    toast.success('PDF Document downloaded!')
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Title */}
      <div className="flex justify-between items-center border-b border-navy-4/50 pb-4">
        <div>
          <h2 className="font-serif text-2xl font-bold text-ink-1 tracking-tight">Reporting Workspace</h2>
          <p className="text-xs text-ink-2">Verify agent registries, business aggregations, payouts sheets, and promotions history.</p>
        </div>
      </div>

      {/* Filter panel */}
      <div className="card p-5 bg-navy-3 border border-navy-4 grid grid-cols-2 md:grid-cols-6 gap-4">
        <div>
          <label className="label">Branch Office</label>
          <select className="field text-xs" value={filterBranch} onChange={e => setFilterBranch(e.target.value)}>
            <option value="">— All Branches —</option>
            {allBranches.data.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Rank Tier</label>
          <select className="field text-xs" value={filterRank} onChange={e => setFilterRank(e.target.value)}>
            <option value="">— All Ranks —</option>
            {ranksConfig?.RANKS?.map(r => <option key={r.rank} value={r.rank}>{r.code}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="field text-xs" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">— All Statuses —</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="paid">Paid / Onboarded</option>
            <option value="unpaid">Unpaid / Pending</option>
          </select>
        </div>
        <div>
          <label className="label">Start Date (From)</label>
          <input type="date" className="field text-xs font-mono" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">End Date (To)</label>
          <input type="date" className="field text-xs font-mono" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <div className="flex gap-2 items-end">
          <button onClick={handleExportExcel} className="btn-gold flex-1 py-2 text-xs flex justify-center items-center gap-1.5 uppercase font-bold" title="Export to Excel">
            <IDownload size={14} /> Excel
          </button>
          <button onClick={handleExportPDF} className="btn-ghost py-2 px-3 text-xs flex justify-center items-center border border-navy-4 hover:border-gold-1/30 rounded" title="Export to PDF">
            PDF
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-navy-4">
        <button onClick={() => setActiveTab('agents')} className={`pb-2.5 px-4 text-xs font-bold uppercase border-b-2 transition-all ${activeTab === 'agents' ? 'border-gold text-gold-1' : 'border-transparent text-ink-2 hover:text-ink-1'}`}>
          Agents ({agentsData.length})
        </button>
        <button onClick={() => setActiveTab('business')} className={`pb-2.5 px-4 text-xs font-bold uppercase border-b-2 transition-all ${activeTab === 'business' ? 'border-gold text-gold-1' : 'border-transparent text-ink-2 hover:text-ink-1'}`}>
          Sales Business
        </button>
        <button onClick={() => setActiveTab('policies')} className={`pb-2.5 px-4 text-xs font-bold uppercase border-b-2 transition-all ${activeTab === 'policies' ? 'border-gold text-gold-1' : 'border-transparent text-ink-2 hover:text-ink-1'}`}>
          Policies ({policiesData.length})
        </button>
        <button onClick={() => setActiveTab('commissions')} className={`pb-2.5 px-4 text-xs font-bold uppercase border-b-2 transition-all ${activeTab === 'commissions' ? 'border-gold text-gold-1' : 'border-transparent text-ink-2 hover:text-ink-1'}`}>
          Commissions ({commissionsData.length})
        </button>
        <button onClick={() => setActiveTab('payouts')} className={`pb-2.5 px-4 text-xs font-bold uppercase border-b-2 transition-all ${activeTab === 'payouts' ? 'border-gold text-gold-1' : 'border-transparent text-ink-2 hover:text-ink-1'}`}>
          Payouts ({payoutsData.length})
        </button>
        <button onClick={() => setActiveTab('promotions')} className={`pb-2.5 px-4 text-xs font-bold uppercase border-b-2 transition-all ${activeTab === 'promotions' ? 'border-gold text-gold-1' : 'border-transparent text-ink-2 hover:text-ink-1'}`}>
          Promotions ({promotionsData.length})
        </button>
      </div>

      {loading ? (
        <SkeletonTable rows={8} cols={7} />
      ) : (
        <div className="card p-5">
          
          {/* 1. AGENTS TAB */}
          {activeTab === 'agents' && (
            agentsData.length === 0 ? (
              <EmptyState title="No matching agents" message="No registry rows matched the filter settings." />
            ) : (
              <div className="table-wrap">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th>Agent Name</th>
                      <th>Branch Office</th>
                      <th>Rank Tier</th>
                      <th>Status</th>
                      <th>Personal BV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentsData.map(a => (
                      <tr key={a.id}>
                        <td>
                          <span className="font-semibold text-ink-1 block">{a.name}</span>
                          <span className="text-[10px] text-ink-2 font-mono">{a.sponsorCode}</span>
                        </td>
                        <td>{branchName(a.branchId)}</td>
                        <td><RankBadge rank={a.rank} size="sm" showName /></td>
                        <td><StatusBadge status={a.status} /></td>
                        <td className="font-mono text-gold font-bold">{formatINR(a.businessVolume || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* 2. BUSINESS TAB */}
          {activeTab === 'business' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Branch Volume */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">Branch Rankings</h4>
                <div className="space-y-2.5">
                  {businessStats.branches.map(b => (
                    <div key={b.name} className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-ink-1">{b.name}</span>
                      <span className="font-mono font-bold text-gold">{formatINR(b.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Rank Tier Volume */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">Rank Volume Distributions</h4>
                <div className="space-y-2.5">
                  {businessStats.ranks.map(r => (
                    <div key={r.rank} className="flex justify-between items-center text-xs">
                      <RankBadge rank={r.rank} size="sm" showName />
                      <span className="font-mono font-bold text-gold">{formatINR(r.total)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Agent Volume */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">Top Performing Leaders</h4>
                <div className="space-y-2.5">
                  {businessStats.agents.map(a => (
                    <div key={a.code} className="flex justify-between items-center text-xs">
                      <div>
                        <span className="font-semibold text-ink-1 block">{a.name}</span>
                        <span className="text-[10px] text-ink-2 font-mono">{a.code}</span>
                      </div>
                      <span className="font-mono font-bold text-gold">{formatINR(a.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 3. POLICIES TAB */}
          {activeTab === 'policies' && (
            policiesData.length === 0 ? (
              <EmptyState title="No matching policies" message="No policies onboarded match these filters." />
            ) : (
              <div className="table-wrap">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th>Policy No.</th>
                      <th>Client Name</th>
                      <th>Agent Name</th>
                      <th>Product</th>
                      <th>Duration</th>
                      <th>Premium Value</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {policiesData.map(p => {
                      const isRD = p.type?.toLowerCase().startsWith('rd')
                      const val = isRD ? `${formatINR(p.monthlyAmount)} /mo` : formatINR(p.fdAmount)
                      return (
                        <tr key={p.id}>
                          <td className="font-mono text-gold font-semibold">{p.policyNumber}</td>
                          <td className="font-semibold text-ink-1">{p.customerName}</td>
                          <td className="text-ink-2">{p.agentName}</td>
                          <td className="text-ink-2 font-semibold uppercase">{p.type}</td>
                          <td>{p.duration} Years</td>
                          <td className="font-mono text-ink-1 font-semibold">{val}</td>
                          <td><StatusBadge status={p.status || 'active'} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* 4. COMMISSIONS TAB */}
          {activeTab === 'commissions' && (
            commissionsData.length === 0 ? (
              <EmptyState title="No matching commissions" message="No credit records mapped." />
            ) : (
              <div className="table-wrap">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th>Agent Name</th>
                      <th>Policy Number</th>
                      <th>Plan Product</th>
                      <th>Percentage</th>
                      <th>Amount Credit</th>
                      <th>Cycle</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissionsData.map(c => (
                      <tr key={c.id}>
                        <td>
                          <span className="font-semibold text-ink-1 block">{c.agentName}</span>
                          <span className="text-[10px] text-ink-2 font-mono">{c.sponsorCode}</span>
                        </td>
                        <td className="font-mono text-ink-2">{c.policyNumber}</td>
                        <td className="font-semibold text-ink-1 uppercase">{c.planCode}</td>
                        <td className="font-mono text-ink-2">{c.percentage}%</td>
                        <td className="font-mono font-bold text-gold">{formatINR(c.amount)}</td>
                        <td>{c.month}/{c.year}</td>
                        <td><StatusBadge status={c.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* 5. PAYOUTS TAB */}
          {activeTab === 'payouts' && (
            payoutsData.length === 0 ? (
              <EmptyState title="No matching payouts" message="No payouts logs." />
            ) : (
              <div className="table-wrap">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th>Agent Name</th>
                      <th>Period</th>
                      <th>Commissions</th>
                      <th>MFA Allowance</th>
                      <th>Travel (TA)</th>
                      <th>Net Payable</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payoutsData.map(p => (
                      <tr key={p.id}>
                        <td>
                          <span className="font-semibold text-ink-1 block">{p.agentName}</span>
                          <span className="text-[10px] text-ink-2 font-mono">{p.sponsorCode}</span>
                        </td>
                        <td>{p.month}/{p.year}</td>
                        <td>{formatINR(p.totalCommission)}</td>
                        <td>{p.mfa > 0 ? formatINR(p.mfa) : '—'}</td>
                        <td>{p.ta > 0 ? formatINR(p.ta) : '—'}</td>
                        <td className="font-mono font-bold text-gold">{formatINR(p.totalPayable)}</td>
                        <td><StatusBadge status={p.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* 6. PROMOTIONS TAB */}
          {activeTab === 'promotions' && (
            promotionsData.length === 0 ? (
              <EmptyState title="No promotion cycles logged" message="No yearly cycles records found." />
            ) : (
              <div className="table-wrap">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th>Agent Name</th>
                      <th>Current Code</th>
                      <th>Target Advancement</th>
                      <th>Lifetime BV Achieved</th>
                      <th>Target Criteria</th>
                      <th>Recommendation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promotionsData.map(p => (
                      <tr key={p.id}>
                        <td>
                          <span className="font-semibold text-ink-1 block">{p.agentName}</span>
                          <span className="text-[10px] text-ink-2 font-mono">{p.sponsorCode}</span>
                        </td>
                        <td>{p.currentRankCode}</td>
                        <td className="font-bold text-gold">{p.targetRankCode}</td>
                        <td className="font-mono">{formatINR(p.businessAchieved)}</td>
                        <td className="font-mono text-ink-2">{formatINR(p.businessTarget)}</td>
                        <td><StatusBadge status={p.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

        </div>
      )}
    </div>
  )
}
