import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { payoutsAPI, profilesAPI, commissionsAPI, policiesAPI, customersAPI, masterDataAPI } from '../../lib/supabase'
import { formatINR, fmtDate } from '../../utils/format'
import { getPayoutGross, getPayoutTds, getPayoutAdminCharge, getPayoutNet } from '../../utils/payoutHelpers'
import { IPrint, IUsers, IDashboard, IPlus } from '../../components/ui/icons'
import Logo from '../../components/ui/Logo'
import { useRanks } from '../../contexts/RanksContext'
import React from 'react'

export default function CommissionBill() {
  const { id } = useParams()
  const [settings, setSettings] = useState({ companyName: 'Apex Multisolutions', headOffice: '' })
  const { getRank } = useRanks()
  
  const [loading, setLoading] = useState(true)
  const [bill, setBill] = useState(null)
  const [commissions, setCommissions] = useState([])
  
  const [agentProfile, setAgentProfile] = useState(null)
  const [sponsorProfile, setSponsorProfile] = useState(null)
  const [usersMap, setUsersMap] = useState({})
  const [policyCommissionsMap, setPolicyCommissionsMap] = useState({})
  const [expandedPolicies, setExpandedPolicies] = useState(new Set())
  const [allocationPolicy, setAllocationPolicy] = useState(null)

  // New states for real-time aggregates
  const [agentStats, setAgentStats] = useState({
    lifetimeBusiness: 0,
    currentMonthBusiness: 0,
    customerCount: 0,
    policyCount: 0,
    commissionEarned: 0
  })

  const [nextRankTeam, setNextRankTeam] = useState([])
  const [nextRankLoading, setNextRankLoading] = useState(false)

  useEffect(() => {
    masterDataAPI.getCommissionMaster().then(cfg => {
      if (cfg) setSettings(prev => ({ ...prev, ...cfg }))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    async function loadData() {
      try {
        const payout = await payoutsAPI.getPayout(id)
        if (payout) {
          setBill(payout)

          const [agentProf, allProfiles, commList] = await Promise.all([
            payout.agentId ? profilesAPI.getProfile(payout.agentId) : null,
            profilesAPI.listProfiles().catch(() => []),
            commissionsAPI.listCommissions({ month: payout.month, year: payout.year }).catch(() => [])
          ])

          setAgentProfile(agentProf)

          const sponsorId = agentProf?.sponsorId || agentProf?.sponsor_id || agentProf?.referredBy
          let sponsorProf = null
          if (sponsorId && sponsorId !== 'none') {
            sponsorProf = (allProfiles || []).find(p => p.id === sponsorId || p.sponsorCode === sponsorId) || null
          }
          setSponsorProfile(sponsorProf)

          const uMap = {}
          ;(allProfiles || []).forEach(d => {
            uMap[d.id] = d
          })
          setUsersMap(uMap)

          const agentComms = (commList || []).filter(c => c.agentId === payout.agentId)
          setCommissions(agentComms)

          const policyMap = {}
          ;(commList || []).forEach(c => {
            const pNo = c.policyNumber || c.policyId
            if (pNo) {
              if (!policyMap[pNo]) policyMap[pNo] = []
              policyMap[pNo].push(c)
            }
          })
          setPolicyCommissionsMap(policyMap)

          if (payout.agentId && agentProf) {
            try {
              const allPolicies = await policiesAPI.listPolicies().catch(() => [])
              const allCustomers = await customersAPI.listCustomers().catch(() => [])
              
              const agentPolicies = (allPolicies || []).filter(p => p.agentId === payout.agentId)
              const agentCustomers = (allCustomers || []).filter(c => c.enrolledBy === payout.agentId)

              const lifetimeBusiness = Number(agentProf.businessVolume || agentProf.accumulatedVolume || 0) ||
                agentPolicies.reduce((sum, p) => sum + (Number(p.monthlyAmount) || Number(p.totalPaid) || 0), 0)
              const policyCount = agentPolicies.length
              const customerCount = agentCustomers.length

              let currentMonthBusiness = 0
              agentPolicies.forEach(p => {
                const pDate = p.startDate ? new Date(p.startDate) : null
                if (pDate && pDate.getMonth() + 1 === payout.month && pDate.getFullYear() === payout.year) {
                  const isRDPlan = (p.planType || p.planCode || '').toLowerCase().startsWith('rd')
                  currentMonthBusiness += isRDPlan ? Number(p.monthlyAmount || 0) : Number(p.fdAmount || 0)
                }
              })

              const commissionEarned = agentComms.reduce((sum, c) => sum + Number(c.amount || 0), 0)

              setAgentStats({
                lifetimeBusiness,
                currentMonthBusiness,
                policyCount,
                customerCount,
                commissionEarned,
              })
            } catch (statsErr) {
              console.error('Agent stats fetch failed (non-critical):', statsErr)
            }
          }
        }
      } catch (err) {
        console.error('Error loading payout bill:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [id])

  // Fetch Downline Team Aggregates (up to 2 ranks below current agent; hidden for Rank 1)
  useEffect(() => {
    if (!agentProfile || !usersMap || !bill) return
    const currentRank = Number(agentProfile.rank || 1)
    if (currentRank <= 1) {
      setNextRankTeam([])
      return
    }

    const allowedRanks = new Set(
      [currentRank - 1, currentRank - 2].filter(r => r >= 1)
    )
    const queue = []
    Object.values(usersMap).forEach(u => {
      const spId = u.sponsor_id || u.sponsorId || u.referredBy
      if (spId === bill.agentId) queue.push(u.id)
    })

    const visited = new Set()
    const targetAgents = []

    while(queue.length > 0) {
      const cid = queue.shift()
      if (visited.has(cid)) continue
      visited.add(cid)

      const child = usersMap[cid]
      if (!child) continue

      if (allowedRanks.has(Number(child.rank))) {
        targetAgents.push(child)
      }

      Object.values(usersMap).forEach(u => {
        const spId = u.sponsor_id || u.sponsorId || u.referredBy
        if (spId === cid) queue.push(u.id)
      })
    }

    if (targetAgents.length === 0) {
      setNextRankTeam([])
      return
    }

    async function loadTeamStats() {
      setNextRankLoading(true)
      try {
        const agentIds = new Set(targetAgents.map(a => a.id))
        
        const [allPolicies, allCustomers, allComms] = await Promise.all([
          policiesAPI.listPolicies().catch(() => []),
          customersAPI.listCustomers().catch(() => []),
          commissionsAPI.listCommissions().catch(() => [])
        ])

        const planStats = {}
        targetAgents.forEach(a => { planStats[a.id] = { totalBV: 0, monthlyBV: 0, policyCount: 0 } })
        
        ;(allPolicies || []).forEach(p => {
          if (agentIds.has(p.agentId) && planStats[p.agentId]) {
            const planTypeStr = (p.planType || p.planCode || '').toLowerCase()
            const amt = planTypeStr.startsWith('rd') ? ((Number(p.monthlyAmount) || 0) * 12) : (Number(p.fdAmount) || 0)
            planStats[p.agentId].totalBV += amt
            planStats[p.agentId].policyCount += 1
            
            const pDate = p.startDate ? new Date(p.startDate) : null
            if (pDate && pDate.getMonth() + 1 === bill.month && pDate.getFullYear() === bill.year) {
              planStats[p.agentId].monthlyBV += amt
            }
          }
        })

        const custCounts = {}
        targetAgents.forEach(a => { custCounts[a.id] = 0 })
        ;(allCustomers || []).forEach(c => {
          if (agentIds.has(c.enrolledBy)) {
            custCounts[c.enrolledBy] = (custCounts[c.enrolledBy] || 0) + 1
          }
        })

        const commStats = {}
        targetAgents.forEach(a => { commStats[a.id] = 0 })
        ;(allComms || []).forEach(c => {
          if (agentIds.has(c.agentId)) {
            commStats[c.agentId] = (commStats[c.agentId] || 0) + (Number(c.amount) || 0)
          }
        })

        const enriched = targetAgents
          .map(a => ({
            ...a,
            totalBV: planStats[a.id]?.totalBV || 0,
            monthlyBV: planStats[a.id]?.monthlyBV || 0,
            policyCount: planStats[a.id]?.policyCount || 0,
            customerCount: custCounts[a.id] || 0,
            totalCommission: commStats[a.id] || 0
          }))
          .sort((a, b) => Number(b.rank) - Number(a.rank) || String(a.name || '').localeCompare(String(b.name || '')))

        setNextRankTeam(enriched)
      } catch (err) {
        console.error('Next rank stats fetch error', err)
      } finally {
        setNextRankLoading(false)
      }
    }

    loadTeamStats()
  }, [usersMap, agentProfile, bill])

  const toggleExpandPolicy = (policyNo) => {
    setExpandedPolicies(prev => {
      const next = new Set(prev)
      if (next.has(policyNo)) next.delete(policyNo)
      else next.add(policyNo)
      return next
    })
  }

  const getHierarchyForPolicy = (policyNo, originalAgentId, billAgentRank = 1) => {
    const rankNum = Number(billAgentRank || 1)
    if (rankNum <= 1) return []

    const path = []
    let currId = originalAgentId
    const visited = new Set()
    while (currId && currId !== 'none' && !visited.has(currId)) {
      visited.add(currId)
      const u = usersMap[currId]
      if (!u) break
      path.push({
        id: currId,
        name: u.name,
        rank: u.rank,
        sponsorCode: u.sponsorCode || u.sponsor_code || ''
      })
      currId = u.sponsor_id || u.sponsorId || u.referredBy
    }

    const historicalComms = policyCommissionsMap[policyNo] || []
    const minRank = Math.max(1, rankNum - 2)
    const maxRank = rankNum - 1

    const levels = []
    for (let r = minRank; r <= maxRank; r++) {
      const hist = historicalComms.find(x => Number(x.receivingRank) === r)
      if (hist) {
        levels.push({
          rank: r,
          agentId: hist.agentId,
          agentName: hist.agentName || usersMap[hist.agentId]?.name || '—',
          amount: hist.amount || 0,
          percentage: hist.percentage || 0,
          commissionType: hist.commissionType,
          isReceiver: hist.agentId === bill.agentId,
          isOccupied: true,
        })
      } else {
        const liveAgent = path.find(x => Number(x.rank) === r)
        if (liveAgent) {
          levels.push({
            rank: r,
            agentId: liveAgent.id,
            agentName: liveAgent.name,
            amount: 0,
            percentage: 0,
            isReceiver: liveAgent.id === bill.agentId,
            isOccupied: true,
          })
        } else {
          levels.push({
            rank: r,
            agentId: null,
            agentName: null,
            isReceiver: false,
            isOccupied: false,
          })
        }
      }
    }
    return levels
  }

  if (loading) {
    return <div className="p-10 text-center text-ink-2">Loading Bill Details...</div>
  }

  if (!bill) {
    return <div className="p-10 text-center text-red-500">Bill not found.</div>
  }

  const companyName = settings?.companyName || 'Apex Multisolutions'
  const headOffice = settings?.headOffice || ''

  const currentAgentRank = Number(agentProfile?.rank || 1)
  const belowRanks = [currentAgentRank - 1, currentAgentRank - 2].filter(r => r >= 1)
  const displayBankName = agentProfile?.bankDetails?.bankName || '—'
  const displayAccountNumber = agentProfile?.bankDetails?.accountNumber
    ? '•••• •••• ' + agentProfile.bankDetails.accountNumber.slice(-4)
    : '—'
  const displayIfscCode = agentProfile?.bankDetails?.ifscCode || '—'
  const displayPanNumber = agentProfile?.panNumber || '—'
  const displayRankName = agentProfile?.rank ? getRank(agentProfile.rank).name : '—'
  const displayRankCode = agentProfile?.rank ? getRank(agentProfile.rank).code : '—'
  const displaySponsorName = sponsorProfile?.name
    ? `${sponsorProfile.name} (${sponsorProfile.sponsorCode || '—'})`
    : '—'

  const cycleLabel = new Date(bill.year, bill.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
  const generatedOnLabel = bill.generatedDate || bill.createdAt ? fmtDate(bill.generatedDate || bill.createdAt) : '—'
  const paidOnLabel = bill.paidDate ? fmtDate(bill.paidDate) : '—'
  const isUnapproved = bill.status === 'generated'
  const approvedByLabel = isUnapproved
    ? 'Pending Approval'
    : ((bill.approvedBy && usersMap[bill.approvedBy]?.name) || bill.approvedBy || 'Super Admin')
  const approvedOnLabel = bill.approvedDate
    ? fmtDate(bill.approvedDate)
    : (bill.paidDate ? fmtDate(bill.paidDate) : (isUnapproved ? 'Pending' : '—'))

  const statusTone =
    bill.status === 'paid'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
      : bill.status === 'approved'
        ? 'bg-amber-50 text-amber-800 border-amber-300'
        : 'bg-slate-100 text-slate-700 border-slate-300'

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-20 px-4 sm:px-0 print:max-w-none print:space-y-0 print:pb-0 print:px-0">

      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 14mm;
          }
          html, body, #root {
            height: auto !important;
            width: 100% !important;
            overflow: visible !important;
            background: #ffffff !important;
            color: #111827 !important;
            font-size: 10.5px !important;
            line-height: 1.4 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          aside, header, nav, footer, .print\\:hidden {
            display: none !important;
          }
          .print-avoid-break {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          thead { display: table-header-group; }
          tr { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="flex justify-between items-center print:hidden">
        <Link to="/admin/payouts" className="text-gold flex items-center gap-1 text-sm font-semibold hover:underline">
          &larr; Back to Payouts
        </Link>
        <button onClick={() => window.print()} className="btn-gold px-4 py-2 flex items-center gap-2 text-xs uppercase font-bold">
          <IPrint size={14} /> Print Statement
        </button>
      </div>

      <div className="card p-6 sm:p-8 bg-white text-gray-900 border border-gray-200 print:shadow-none print:border-none print:rounded-none print:m-0 print:p-0">

        {/* Header */}
        <div className="flex flex-col sm:flex-row print:flex-row justify-between items-start border-b-2 border-slate-800 pb-5 mb-5 print:pb-3 print:mb-4 gap-4 print-avoid-break">
          <div className="flex items-center gap-3.5">
            <Logo size={46} showText={false} />
            <div>
              <h1 className="text-2xl print:text-xl font-serif font-black tracking-tight text-slate-900">{companyName}</h1>
              <p className="text-[10px] text-amber-800 uppercase tracking-[0.12em] font-bold whitespace-nowrap">Apex Multisolutions Performance Portal</p>
              {headOffice && <p className="text-xs text-slate-500 mt-1 max-w-xs">{headOffice}</p>}
            </div>
          </div>
          <div className="sm:text-right print:text-right shrink-0">
            <div className="flex sm:justify-end print:justify-end items-center gap-2.5">
              <h2 className="text-xl print:text-lg font-black text-slate-900 uppercase tracking-[0.14em]">Payout Statement</h2>
              <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${statusTone}`}>
                {bill.status}
              </span>
            </div>
            <div className="mt-2 space-y-0.5 text-[11px] text-slate-600">
              <p>Payout ID: <span className="font-mono font-semibold text-slate-800 whitespace-nowrap">{bill.id.toUpperCase()}</span></p>
              <p>Cycle: <span className="font-semibold text-slate-800">{cycleLabel}</span> &nbsp;|&nbsp; Generated: <span className="font-semibold text-slate-800">{generatedOnLabel}</span></p>
              <p>Paid Date: <span className="font-semibold text-slate-800">{paidOnLabel}</span></p>
            </div>
          </div>
        </div>

        {/* Agent Details */}
        <div className="border border-slate-200 rounded-lg overflow-hidden mb-5 print:mb-4 print-avoid-break">
          <div className="bg-slate-100/80 px-4 py-2 border-b border-slate-200">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">Agent Profile Snapshot</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 print:grid-cols-4 gap-y-3 gap-x-5 p-4 print:p-3 bg-white text-xs">
            <div><span className="text-[10px] uppercase tracking-wide text-slate-500 block">Agent Name</span><span className="font-bold text-slate-900 text-xs sm:text-sm print:text-xs">{agentProfile?.name || bill.agentName || '—'}</span></div>
            <div><span className="text-[10px] uppercase tracking-wide text-slate-500 block">Agent Code</span><span className="font-bold text-slate-900 font-mono">{agentProfile?.sponsorCode || bill.agentCode || '—'}</span></div>
            <div><span className="text-[10px] uppercase tracking-wide text-slate-500 block">Rank</span><span className="font-bold text-slate-900">{displayRankCode} - {displayRankName}</span></div>
            <div><span className="text-[10px] uppercase tracking-wide text-slate-500 block">Sponsor</span><span className="font-bold text-slate-900">{displaySponsorName}</span></div>
            <div><span className="text-[10px] uppercase tracking-wide text-slate-500 block">PAN Number</span><span className="font-bold text-slate-900 font-mono">{displayPanNumber}</span></div>
            <div><span className="text-[10px] uppercase tracking-wide text-slate-500 block">Bank Name</span><span className="font-bold text-slate-900">{displayBankName}</span></div>
            <div><span className="text-[10px] uppercase tracking-wide text-slate-500 block">Account Number</span><span className="font-bold text-slate-900 font-mono">{displayAccountNumber}</span></div>
            <div><span className="text-[10px] uppercase tracking-wide text-slate-500 block">IFSC Code</span><span className="font-bold text-slate-900 font-mono">{displayIfscCode}</span></div>
          </div>
        </div>

        {/* Agent Summary Dashboard */}
        <div className="mb-5 print:mb-4 border border-slate-200 rounded-lg overflow-hidden print-avoid-break">
          <div className="bg-slate-100/80 px-4 py-2 border-b border-slate-200">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">Business Summary (Aggregated Source of Truth)</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 print:grid-cols-5 divide-x divide-y sm:divide-y-0 print:divide-y-0 divide-slate-200 bg-white">
            <div className="px-2.5 py-3 print:py-2.5 text-center flex flex-col justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Lifetime Business</span>
              <span className="text-sm print:text-[13px] font-extrabold text-slate-900 tabular-nums whitespace-nowrap">{formatINR(agentStats.lifetimeBusiness)}</span>
            </div>
            <div className="px-2.5 py-3 print:py-2.5 text-center flex flex-col justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Current Month Business</span>
              <span className="text-sm print:text-[13px] font-extrabold text-blue-800 tabular-nums whitespace-nowrap">{formatINR(agentStats.currentMonthBusiness)}</span>
            </div>
            <div className="px-2.5 py-3 print:py-2.5 text-center flex flex-col justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Total Policies</span>
              <span className="text-sm print:text-[13px] font-extrabold text-slate-900 tabular-nums">{agentStats.policyCount}</span>
            </div>
            <div className="px-2.5 py-3 print:py-2.5 text-center flex flex-col justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Total Customers</span>
              <span className="text-sm print:text-[13px] font-extrabold text-slate-900 tabular-nums">{agentStats.customerCount}</span>
            </div>
            <div className="px-2.5 py-3 print:py-2.5 text-center bg-emerald-50/50 col-span-2 sm:col-span-1 print:col-span-1 flex flex-col justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Lifetime Commission Earned</span>
              <span className="text-sm print:text-[13px] font-black text-emerald-800 tabular-nums whitespace-nowrap">{formatINR(agentStats.commissionEarned)}</span>
            </div>
          </div>
        </div>

        {/* Visual payment flow */}
        <div className="mb-6 print:mb-4 print-avoid-break">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2.5">Payment Calculation Flow</h3>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] print:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-stretch gap-2 print:gap-1.5">
            <div className="bg-blue-50/70 border border-blue-200 px-3 py-2.5 rounded-lg text-center flex flex-col justify-center">
              <span className="text-[10px] uppercase font-bold text-blue-700 block">Gross Commission</span>
              <span className="text-sm print:text-[13px] font-extrabold text-blue-950 block mt-1 tabular-nums whitespace-nowrap">{formatINR(getPayoutGross(bill))}</span>
            </div>
            <div className="hidden md:flex print:flex items-center justify-center text-slate-400 font-bold text-base px-0.5">&rarr;</div>
            <div className="flex md:hidden print:hidden items-center justify-center text-slate-400 font-bold text-sm">&darr;</div>
            <div className="bg-rose-50/70 border border-rose-200 px-3 py-2.5 rounded-lg text-center flex flex-col justify-center">
              <span className="text-[10px] uppercase font-bold text-rose-700 block">TDS (5%)</span>
              <span className="text-sm print:text-[13px] font-extrabold text-rose-950 block mt-1 tabular-nums whitespace-nowrap">&minus;{formatINR(getPayoutTds(bill))}</span>
            </div>
            <div className="hidden md:flex print:flex items-center justify-center text-slate-400 font-bold text-base px-0.5">&rarr;</div>
            <div className="flex md:hidden print:hidden items-center justify-center text-slate-400 font-bold text-sm">&darr;</div>
            <div className="bg-rose-50/70 border border-rose-200 px-3 py-2.5 rounded-lg text-center flex flex-col justify-center">
              <span className="text-[10px] uppercase font-bold text-rose-700 block">Admin Charges (5%)</span>
              <span className="text-sm print:text-[13px] font-extrabold text-rose-950 block mt-1 tabular-nums whitespace-nowrap">&minus;{formatINR(getPayoutAdminCharge(bill))}</span>
            </div>
            <div className="hidden md:flex print:flex items-center justify-center text-slate-400 font-bold text-base px-0.5">&rarr;</div>
            <div className="flex md:hidden print:hidden items-center justify-center text-slate-400 font-bold text-sm">&darr;</div>
            <div className="bg-emerald-50 border-2 border-emerald-400 px-3 py-2.5 rounded-lg text-center flex flex-col justify-center">
              <span className="text-[10px] uppercase font-bold text-emerald-700 block">Net Payable</span>
              <span className="text-base print:text-sm font-black text-emerald-950 block mt-1 tabular-nums whitespace-nowrap">{formatINR(getPayoutNet(bill))}</span>
            </div>
          </div>
        </div>

        {/* Commission Breakdown Table */}
        <div className="mb-6 print:mb-4">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2.5">Commission Ledger Breakdown</h3>
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                  <th className="py-2.5 px-3 font-semibold">Policy No.</th>
                  <th className="py-2.5 px-3 font-semibold">Customer</th>
                  <th className="py-2.5 px-3 font-semibold">Selling Agent</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Comm %</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Commission</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Type</th>
                  <th className="py-2.5 px-3 font-semibold text-center print:hidden">Hierarchy &amp; Allocation</th>
                </tr>
              </thead>
              <tbody>
                {commissions.length === 0 ? (
                  <tr><td colSpan={7} className="py-4 text-center text-slate-400 italic">No commission entries found in ledger for this cycle.</td></tr>
                ) : commissions.map((c, idx) => {
                  const policyKey = c.policyNumber || c.policyId
                  const hasHierarchyExpanded = expandedPolicies.has(policyKey)
                  const levels = getHierarchyForPolicy(policyKey, c.originalAgentId, currentAgentRank)
                  const hasBelowRanks = levels.length > 0
                  const sellingAgentName = c.originalAgentId
                    ? (usersMap[c.originalAgentId]?.name || c.originalAgentName || c.agentName || '—')
                    : (c.agentName || '—')
                  const sellingAgentCode = c.originalAgentId
                    ? (usersMap[c.originalAgentId]?.sponsorCode || c.originalSponsorCode || c.sponsorCode || '—')
                    : (c.agentCode || c.sponsorCode || '—')

                  return (
                    <React.Fragment key={(c.id || idx)}>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-800 whitespace-nowrap">{c.policyNumber || '—'}</td>
                        <td className="py-2.5 px-3">
                          <span className="block font-semibold text-slate-900">{c.customerName || '—'}</span>
                          {c.customerAccount && <span className="text-[10px] text-slate-500 font-mono block">{c.customerAccount}</span>}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="block font-medium text-slate-900">{sellingAgentName}</span>
                          <span className="text-[10px] text-slate-500 font-mono block">{sellingAgentCode}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono tabular-nums whitespace-nowrap">{Number(c.percentage || 0).toFixed(2)}%</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">{formatINR(c.amount)}</td>
                        <td className="py-2.5 px-3 text-center uppercase whitespace-nowrap">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            {c.commissionType === 'Direct' || c.commissionType === 'direct' || c.commissionType === 'direct_own' || (!c.commissionType && !c.compression) ? 'Direct' : 'Upline Commission'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center print:hidden">
                          <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                            {hasBelowRanks && (
                              <>
                                <button type="button" onClick={() => toggleExpandPolicy(policyKey)} className="text-gold font-semibold hover:underline text-[10px] uppercase tracking-wide">
                                  {hasHierarchyExpanded ? '▼ Hide Hierarchy' : '▶ View Hierarchy'}
                                </button>
                                <span className="text-slate-300">|</span>
                              </>
                            )}
                            <button type="button" onClick={() => setAllocationPolicy(c)} className="text-gold font-semibold hover:underline text-[10px] uppercase tracking-wide">
                              View Allocation
                            </button>
                          </div>
                        </td>
                      </tr>
                      {hasBelowRanks && (
                        <tr className={`bg-slate-50/50 ${hasHierarchyExpanded ? '' : 'hidden print:table-row'}`}>
                          <td colSpan={7} className="p-0 border-b border-slate-200">
                            <div className="px-4 py-3 print:px-3 print:py-2.5 print-avoid-break">
                              <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2">
                                Downline Sponsor Path (Below {belowRanks.length === 1 ? 'Rank' : `${belowRanks.length} Ranks`})
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2.5 text-[10px]">
                                <span className="font-bold text-slate-600">Customer:</span>
                                <span className="bg-white border border-slate-200 text-slate-800 px-2 py-0.5 rounded font-medium">{c.customerName || '—'}</span>
                                <span className="text-slate-400 font-bold">&rarr;</span>
                                <span className="font-bold text-slate-600">Policy:</span>
                                <span className="bg-white border border-slate-200 text-slate-800 px-2 py-0.5 rounded font-mono font-bold">{c.policyNumber || '—'}</span>
                                <span className="text-slate-400 font-bold">&rarr;</span>
                                <span className="font-bold text-slate-600">Product:</span>
                                <span className="bg-white border border-slate-200 text-slate-800 px-2 py-0.5 rounded font-medium uppercase">{c.planCode || c.planType || '—'}</span>
                              </div>
                              <div className={`grid grid-cols-1 ${levels.length > 1 ? 'md:grid-cols-2 print:grid-cols-2' : ''} gap-1.5`}>
                                {levels.map((lvl) => {
                                  const rInfo = getRank(lvl.rank)
                                  return (
                                    <div
                                      key={lvl.rank}
                                      className={`flex items-center justify-between px-2.5 py-1.5 print:py-1 rounded border text-[10px] print:text-[9.5px] ${
                                        lvl.isReceiver
                                          ? 'bg-amber-50 border-amber-400 font-bold'
                                          : lvl.isOccupied
                                            ? 'bg-white border-slate-200 text-slate-800'
                                            : 'bg-slate-50 border-slate-200/70 text-slate-400'
                                      }`}
                                    >
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span
                                          className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase shrink-0 ${
                                            lvl.isReceiver
                                              ? 'bg-amber-600 text-white'
                                              : lvl.isOccupied
                                                ? 'bg-slate-800 text-white'
                                                : 'bg-slate-200 text-slate-500'
                                          }`}
                                        >
                                          R{lvl.rank}
                                        </span>
                                        <span className="truncate font-semibold" title={rInfo.name}>{rInfo.code} &mdash; {rInfo.name}</span>
                                      </div>
                                      <div className="truncate text-right pl-2 min-w-0 flex-1">
                                        {lvl.isOccupied ? (
                                          <div className="truncate">
                                            <span className={lvl.isReceiver ? 'text-amber-950 font-black' : 'text-slate-900 font-medium'}>{lvl.agentName}</span>
                                            {lvl.amount > 0 && (
                                              <span className="text-[9px] text-emerald-700 font-bold block leading-tight tabular-nums">
                                                +{formatINR(lvl.amount)} ({Number(lvl.percentage || 0).toFixed(2)}%)
                                              </span>
                                            )}
                                          </div>
                                        ) : <span>—</span>}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Downline Team Summary Section (up to 2 ranks below; nothing shown for Rank 1) */}
        {currentAgentRank > 1 && (
          <div className="mb-6 print:mb-4 print-avoid-break">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2.5 border-b border-slate-200 pb-1">
              Downline Team Summary ({belowRanks.length > 1 ? `Ranks ${belowRanks.join(' & ')}` : `Rank ${belowRanks[0]}`} &mdash; {belowRanks.map(r => getRank(r).code).join(', ')})
            </h3>
            {nextRankLoading ? (
              <div className="p-4 bg-slate-50 text-center text-xs text-slate-500 border border-slate-200 rounded-lg">
                Aggregating team performance...
              </div>
            ) : nextRankTeam.length === 0 ? (
              <div className="p-3 bg-slate-50 text-center text-xs text-slate-500 italic border border-slate-200 rounded-lg">
                No {belowRanks.map(r => `Rank ${r} (${getRank(r).code})`).join(' or ')} agents found in the downline.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs print:text-[10px] border-collapse bg-white">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <th className="py-2 px-3 print:px-2 font-semibold">Agent Code</th>
                      <th className="py-2 px-3 print:px-2 font-semibold">Agent Name</th>
                      <th className="py-2 px-3 print:px-2 font-semibold text-center">Rank</th>
                      <th className="py-2 px-3 print:px-2 font-semibold text-right">Lifetime Business</th>
                      <th className="py-2 px-3 print:px-2 font-semibold text-right">Current Month Business</th>
                      <th className="py-2 px-3 print:px-2 font-semibold text-center">Active Policies</th>
                      <th className="py-2 px-3 print:px-2 font-semibold text-center">Active Customers</th>
                      <th className="py-2 px-3 print:px-2 font-semibold text-right">Lifetime Comm. Earned</th>
                      <th className="py-2 px-3 print:px-2 font-semibold text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nextRankTeam.map((m, idx) => (
                      <tr key={m.id || idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="py-2 px-3 print:px-2 font-mono text-slate-600 whitespace-nowrap">{m.sponsorCode || '—'}</td>
                        <td className="py-2 px-3 print:px-2 font-bold text-slate-800">{m.name}</td>
                        <td className="py-2 px-3 print:px-2 text-center whitespace-nowrap"><span className="px-1.5 py-0.5 rounded bg-slate-100 font-bold text-slate-700">R{m.rank}</span></td>
                        <td className="py-2 px-3 print:px-2 text-right font-semibold text-slate-700 tabular-nums whitespace-nowrap">{formatINR(m.totalBV)}</td>
                        <td className="py-2 px-3 print:px-2 text-right font-bold text-blue-700 tabular-nums whitespace-nowrap">{formatINR(m.monthlyBV)}</td>
                        <td className="py-2 px-3 print:px-2 text-center font-mono">{m.policyCount}</td>
                        <td className="py-2 px-3 print:px-2 text-center font-mono">{m.customerCount}</td>
                        <td className="py-2 px-3 print:px-2 text-right font-bold text-emerald-700 tabular-nums whitespace-nowrap">{formatINR(m.totalCommission)}</td>
                        <td className="py-2 px-3 print:px-2 text-center uppercase text-[9px] font-bold whitespace-nowrap">
                          <span className={`px-1.5 py-0.5 rounded ${m.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{m.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-200 text-slate-800 font-bold">
                      <td colSpan={3} className="py-2.5 px-3 print:px-2 text-right uppercase tracking-wider text-[10px]">Team Total</td>
                      <td className="py-2.5 px-3 print:px-2 text-right tabular-nums whitespace-nowrap">{formatINR(nextRankTeam.reduce((sum, m) => sum + m.totalBV, 0))}</td>
                      <td className="py-2.5 px-3 print:px-2 text-right text-blue-800 tabular-nums whitespace-nowrap">{formatINR(nextRankTeam.reduce((sum, m) => sum + m.monthlyBV, 0))}</td>
                      <td className="py-2.5 px-3 print:px-2 text-center">{nextRankTeam.reduce((sum, m) => sum + m.policyCount, 0)}</td>
                      <td className="py-2.5 px-3 print:px-2 text-center">{nextRankTeam.reduce((sum, m) => sum + m.customerCount, 0)}</td>
                      <td className="py-2.5 px-3 print:px-2 text-right text-emerald-800 tabular-nums whitespace-nowrap">{formatINR(nextRankTeam.reduce((sum, m) => sum + m.totalCommission, 0))}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Audit footer panel */}
        <div className="text-xs text-slate-500 mt-6 pt-4 border-t-2 border-slate-200 print:mt-4 print:pt-3 print-avoid-break">
          <div className="grid grid-cols-2 sm:grid-cols-3 print:grid-cols-3 gap-y-2.5 gap-x-6">
            <div><span className="text-[10px] uppercase tracking-wide text-slate-500 block">Generated By:</span><span className="font-semibold text-slate-800">{bill.generatedBy || 'Super Admin'}</span></div>
            <div><span className="text-[10px] uppercase tracking-wide text-slate-500 block">Generated On:</span><span className="font-semibold text-slate-800 font-mono">{generatedOnLabel}</span></div>
            <div><span className="text-[10px] uppercase tracking-wide text-slate-500 block">Payout Status:</span><span className="font-bold text-amber-800 uppercase">{bill.status}</span></div>
            <div><span className="text-[10px] uppercase tracking-wide text-slate-500 block">Approved By:</span><span className="font-semibold text-slate-800">{approvedByLabel}</span></div>
            <div><span className="text-[10px] uppercase tracking-wide text-slate-500 block">Approved On:</span><span className="font-semibold text-slate-800 font-mono">{approvedOnLabel}</span></div>
            <div><span className="text-[10px] uppercase tracking-wide text-slate-500 block">System Generated ID:</span><span className="font-mono text-[9.5px] text-slate-700 whitespace-nowrap">{bill.id}</span></div>
          </div>
          <div className="mt-6 pt-3 border-t border-slate-100 flex flex-col sm:flex-row print:flex-row justify-between items-center gap-4 text-center sm:text-left print:text-left print:mt-4">
            <p className="text-[10px] text-slate-500">This is an official computer-generated statement and does not require physical signature under auditing rules.</p>
            <div className="w-44 border-t border-slate-400 mt-4 sm:mt-2 text-center text-[10px] font-bold text-slate-600 uppercase tracking-widest pt-1 shrink-0">
              Authorised Signature
            </div>
          </div>
        </div>

      </div>

      {allocationPolicy && (() => {
        const modalPolicyKey = allocationPolicy.policyNumber || allocationPolicy.policyId
        const modalComms = policyCommissionsMap[modalPolicyKey] || []
        const totalModalComm = modalComms.reduce((sum, x) => sum + (x.amount || 0), 0)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 print:hidden">
            <div className="bg-white text-black rounded-xl shadow-2xl border border-gray-100 max-w-3xl w-full max-h-[85vh] flex flex-col">
              <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
                <div>
                  <h3 className="text-lg font-serif font-black text-gray-900">Commission Allocation Audit</h3>
                  <p className="text-xs text-gray-500">Policy No: <span className="font-mono font-bold text-gray-700">{allocationPolicy.policyNumber || '—'}</span></p>
                </div>
                <button aria-label="Close Modal" onClick={() => setAllocationPolicy(null)} className="text-gray-400 hover:text-gray-600 font-bold text-lg p-1">✕</button>
              </div>
              <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
                  <div><span className="text-gray-500 block">Policy Number</span><span className="font-bold text-gray-800 text-sm font-mono">{allocationPolicy.policyNumber || '—'}</span></div>
                  <div><span className="text-gray-500 block">Customer</span><span className="font-bold text-gray-800 text-sm">{allocationPolicy.customerName || '—'}</span></div>
                  <div><span className="text-gray-500 block">Business Volume</span><span className="font-bold text-gray-800 text-sm">{formatINR(allocationPolicy.businessAmount || 0)}</span></div>
                  <div><span className="text-gray-500 block">Plan Code</span><span className="font-bold text-gray-800 uppercase text-sm font-mono">{allocationPolicy.planCode || allocationPolicy.planType || '—'}</span></div>
                  <div><span className="text-gray-500 block">Total Commission</span><span className="font-bold text-gold text-sm">{formatINR(totalModalComm)}</span></div>
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">All Commission Recipients</h4>
                  <div className="overflow-x-auto border border-gray-100 rounded-lg">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-gray-100 border-b border-gray-200 text-gray-600 font-semibold">
                          <th className="py-2.5 px-3">Rank</th>
                          <th className="py-2.5 px-3">Rank Name</th>
                          <th className="py-2.5 px-3">Agent Name</th>
                          <th className="py-2.5 px-3">Agent Code</th>
                          <th className="py-2.5 px-3 text-center">Comm %</th>
                          <th className="py-2.5 px-3 text-right">Commission</th>
                          <th className="py-2.5 px-3 text-center">Commission Type</th>
                          <th className="py-2.5 px-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {modalComms
                          .slice()
                          .sort((a, b) => Number(a.receivingRank || 1) - Number(b.receivingRank || 1))
                          .map((lvl, idx) => {
                            const rInfo = getRank(lvl.receivingRank || 1)
                            const isReceiver = lvl.agentId === bill.agentId
                            return (
                              <tr key={lvl.id || idx} className={`border-b border-gray-100 last:border-0 hover:bg-gray-50/50 ${isReceiver ? 'bg-amber-50 font-bold' : ''}`}>
                                <td className="py-2.5 px-3 font-mono">R{lvl.receivingRank || 1}</td>
                                <td className="py-2.5 px-3 font-medium">{rInfo.code} - {rInfo.name}</td>
                                <td className="py-2.5 px-3">{lvl.agentName || usersMap[lvl.agentId]?.name || '—'}</td>
                                <td className="py-2.5 px-3 font-mono">{lvl.agentCode || lvl.sponsorCode || usersMap[lvl.agentId]?.sponsorCode || '—'}</td>
                                <td className="py-2.5 px-3 text-center font-mono">{Number(lvl.percentage || 0).toFixed(2)}%</td>
                                <td className="py-2.5 px-3 text-right font-bold text-gray-800">{formatINR(lvl.amount)}</td>
                                <td className="py-2.5 px-3 text-center uppercase"><span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{lvl.commissionType === 'Direct' || lvl.commissionType === 'direct' || lvl.commissionType === 'direct_own' ? 'Direct' : 'Upline Commission'}</span></td>
                                <td className="py-2.5 px-3 text-center uppercase"><span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${lvl.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{lvl.status}</span></td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div className="flex justify-between items-center px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl text-xs font-bold text-gray-700">
                <span>Total Commission Distributed:</span>
                <span className="text-sm font-black text-gold">{formatINR(totalModalComm)}</span>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
