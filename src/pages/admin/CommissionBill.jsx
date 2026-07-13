import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { formatINR, fmtDate } from '../../utils/format'
import { useDoc } from '../../hooks/useFirestore'
import { IPrint, IUsers, IDashboard, IPlus } from '../../components/ui/icons'
import Logo from '../../components/ui/Logo'
import { useRanks } from '../../contexts/RanksContext'
import React from 'react'

export default function CommissionBill() {
  const { id } = useParams()
  const { data: settings } = useDoc('config/settings')
  const { getRank } = useRanks()
  
  const [loading, setLoading] = useState(true)
  const [bill, setBill] = useState(null)
  const [commissions, setCommissions] = useState([])
  
  const [agentProfile, setAgentProfile] = useState(null)
  const [sponsorProfile, setSponsorProfile] = useState(null)
  const [branchDetails, setBranchDetails] = useState(null)
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
    async function loadData() {
      try {
        const docRef = doc(db, 'payouts', id)
        const snap = await getDoc(docRef)
        if (snap.exists()) {
          const payoutData = snap.data()
          setBill({ id: snap.id, ...payoutData })

          let agentProf = null
          if (payoutData.agentId) {
            const agentSnap = await getDoc(doc(db, 'users', payoutData.agentId))
            if (agentSnap.exists()) {
              agentProf = agentSnap.data()
              setAgentProfile(agentProf)
            }
          }

          if (agentProf?.referredBy && agentProf.referredBy !== 'none') {
            const sponsorSnap = await getDoc(doc(db, 'users', agentProf.referredBy))
            if (sponsorSnap.exists()) {
              setSponsorProfile(sponsorSnap.data())
            }
          }

          if (agentProf?.branchId) {
            const branchSnap = await getDoc(doc(db, 'branches', agentProf.branchId))
            if (branchSnap.exists()) {
              setBranchDetails(branchSnap.data())
            }
          }

          const allUsersSnap = await getDocs(collection(db, 'users'))
          const uMap = {}
          allUsersSnap.forEach(d => {
            uMap[d.id] = d.data()
          })
          setUsersMap(uMap)

          const commQuery = query(
            collection(db, 'commission_ledger'),
            where('agentId', '==', payoutData.agentId),
            where('month', '==', payoutData.month),
            where('year', '==', payoutData.year)
          )
          const commSnap = await getDocs(commQuery)
          const commList = []
          commSnap.forEach(d => commList.push({ id: d.id, ...d.data() }))
          setCommissions(commList)

          const policyNumbers = [...new Set(commList.map(c => c.policyNumber).filter(Boolean))]
          const histComms = []
          for (let i = 0; i < policyNumbers.length; i += 30) {
            const chunk = policyNumbers.slice(i, i + 30)
            const q = query(
              collection(db, 'commission_ledger'),
              where('policyNumber', 'in', chunk),
              where('month', '==', payoutData.month),
              where('year', '==', payoutData.year)
            )
            const snap = await getDocs(q)
            snap.forEach(doc => histComms.push({ id: doc.id, ...doc.data() }))
          }

          const policyMap = {}
          histComms.forEach(c => {
            if (!policyMap[c.policyNumber]) {
              policyMap[c.policyNumber] = []
            }
            policyMap[c.policyNumber].push(c)
          })
          setPolicyCommissionsMap(policyMap)

          // ── Agent Business Summary ──────────────────────────────────────
          // Uses the same data sources as the Dashboard to guarantee identical
          // totals: agentProfile.businessVolume is incremented at import time
          // by the same calculatedAmount that feeds system_summaries/dashboard.
          //
          // We intentionally avoid getAggregateFromServer here because it
          // requires the Blaze billing plan and throws on Spark – silently
          // zeroing every stat when caught by the outer try/catch.
          // ──────────────────────────────────────────────────────────────────
          if (payoutData.agentId && agentProf) {
            try {
              // 1. Lifetime business & counts – read from agent profile
              //    (same field incremented by ImportData.jsx → matches Dashboard)
              const lifetimeBusiness = Number(agentProf.businessVolume || 0)
              const policyCount      = Number(agentProf.activePolicies  || 0)
              const customerCount    = Number(agentProf.totalCustomers  || 0)

              // 2. Current-month business – query plans and filter in JS
              //    Amount formula matches import: RD → monthlyAmount (not ×12), FD → fdAmount
              let currentMonthBusiness = 0
              const plansQ = query(
                collection(db, 'plans'),
                where('agentId', '==', payoutData.agentId)
              )
              const pSnap = await getDocs(plansQ)
              pSnap.forEach(d => {
                const p = d.data()
                const pDate = p.startDate
                  ? new Date(p.startDate.toDate ? p.startDate.toDate() : p.startDate)
                  : null
                if (
                  pDate &&
                  pDate.getMonth() + 1 === payoutData.month &&
                  pDate.getFullYear()  === payoutData.year
                ) {
                  const isRDPlan = (p.planType || p.type || '').toLowerCase().startsWith('rd')
                  currentMonthBusiness += isRDPlan
                    ? Number(p.monthlyAmount || 0)
                    : Number(p.fdAmount || 0)
                }
              })

              // 3. Lifetime commission – getDocs + reduce (no Blaze required)
              const ledgQ = query(
                collection(db, 'commission_ledger'),
                where('agentId', '==', payoutData.agentId)
              )
              const lSnap = await getDocs(ledgQ)
              let commissionEarned = 0
              lSnap.forEach(d => { commissionEarned += Number(d.data().amount || 0) })

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
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [id])

  // Fetch Next Rank Team Aggregates once usersMap and agentProfile are ready
  useEffect(() => {
    if (!agentProfile || !usersMap || !bill) return
    const currentRank = Number(agentProfile.rank || 1)
    if (currentRank <= 1) {
      setNextRankTeam([])
      return
    }

    const targetRank = currentRank - 1
    const queue = []
    Object.values(usersMap).forEach(u => {
      if (u.referredBy === bill.agentId) queue.push(u.id)
    })

    const visited = new Set()
    const targetAgents = []

    while(queue.length > 0) {
      const cid = queue.shift()
      if (visited.has(cid)) continue
      visited.add(cid)

      const child = usersMap[cid]
      if (!child) continue

      if (Number(child.rank) === targetRank) {
        targetAgents.push(child)
      }

      Object.values(usersMap).forEach(u => {
        if (u.referredBy === cid) queue.push(u.id)
      })
    }

    if (targetAgents.length === 0) {
      setNextRankTeam([])
      return
    }

    async function loadTeamStats() {
      setNextRankLoading(true)
      try {
        const agentIds = targetAgents.map(a => a.id)
        
        // 1. Fetch Plans for Total/Monthly BV and Active Policies
        const allPlans = []
        for (let i = 0; i < agentIds.length; i += 30) {
          const chunk = agentIds.slice(i, i + 30)
          const q = query(collection(db, 'plans'), where('agentId', 'in', chunk))
          const snap = await getDocs(q)
          snap.forEach(d => allPlans.push(d.data()))
        }

        const planStats = {}
        targetAgents.forEach(a => planStats[a.id] = { totalBV: 0, monthlyBV: 0, policyCount: 0 })
        
        allPlans.forEach(p => {
          if (planStats[p.agentId]) {
            const planTypeStr = (p.planType || p.type || '').toLowerCase()
            const amt = planTypeStr.startsWith('rd') ? (p.monthlyAmount * 12) : (p.fdAmount || 0)
            planStats[p.agentId].totalBV += amt
            planStats[p.agentId].policyCount += 1
            
            const pDate = p.startDate ? new Date(p.startDate.toDate ? p.startDate.toDate() : p.startDate) : (p.date ? new Date(p.date) : null)
            if (pDate) {
              if (pDate.getMonth() + 1 === bill.month && pDate.getFullYear() === bill.year) {
                planStats[p.agentId].monthlyBV += amt
              }
            }
          }
        })

        // 2. Fetch Customer Count
        const custCounts = {}
        for (let i = 0; i < agentIds.length; i += 30) {
          const chunk = agentIds.slice(i, i + 30)
          const q = query(collection(db, 'customers'), where('enrolledBy', 'in', chunk))
          const snap = await getDocs(q)
          chunk.forEach(id => custCounts[id] = 0)
          snap.forEach(d => {
            const c = d.data()
            if (custCounts[c.enrolledBy] !== undefined) custCounts[c.enrolledBy]++
          })
        }

        // 3. Fetch Lifetime Commission (Using client summation due to 'in' clause limitation with aggregations)
        const commStats = {}
        targetAgents.forEach(a => commStats[a.id] = 0)
        for (let i = 0; i < agentIds.length; i += 30) {
          const chunk = agentIds.slice(i, i + 30)
          const q = query(collection(db, 'commission_ledger'), where('agentId', 'in', chunk))
          const snap = await getDocs(q)
          snap.forEach(d => {
            const c = d.data()
            if (commStats[c.agentId] !== undefined) commStats[c.agentId] += (c.amount || 0)
          })
        }

        const enriched = targetAgents.map(a => ({
          ...a,
          totalBV: planStats[a.id].totalBV,
          monthlyBV: planStats[a.id].monthlyBV,
          policyCount: planStats[a.id].policyCount,
          customerCount: custCounts[a.id],
          totalCommission: commStats[a.id]
        }))

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

  const getHierarchyForPolicy = (policyNo, originalAgentId) => {
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
        sponsorCode: u.sponsorCode || ''
      })
      currId = u.referredBy
    }

    const historicalComms = policyCommissionsMap[policyNo] || []
    
    const levels = []
    for (let r = 1; r <= 18; r++) {
      const hist = historicalComms.find(x => Number(x.receivingRank) === r)
      if (hist) {
        levels.push({
          rank: r,
          agentId: hist.agentId,
          agentName: hist.agentName,
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

  const companyName = settings?.companyName || 'Krantibhumi'
  const headOffice = settings?.headOffice || ''

  const displayBankName = agentProfile?.bankDetails?.bankName || '—'
  const displayAccountNumber = agentProfile?.bankDetails?.accountNumber
    ? '•••• •••• ' + agentProfile.bankDetails.accountNumber.slice(-4)
    : '—'
  const displayIfscCode = agentProfile?.bankDetails?.ifscCode || '—'
  const displayPanNumber = agentProfile?.panNumber || '—'
  const displayRankName = agentProfile?.rank ? getRank(agentProfile.rank).name : '—'
  const displayRankCode = agentProfile?.rank ? getRank(agentProfile.rank).code : '—'
  const displayBranchName = branchDetails?.name || '—'
  const displaySponsorName = sponsorProfile?.name 
    ? `${sponsorProfile.name} (${sponsorProfile.sponsorCode || '—'})`
    : '—'

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-20 px-4 sm:px-0">
      
      <style>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
            font-size: 11px !important;
          }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:border-none { border: none !important; }
          .print\\:p-0 { padding: 0 !important; }
          .print\\:m-0 { margin: 0 !important; }
          .hierarchy-container { display: block !important; page-break-inside: avoid; }
          tr { page-break-inside: avoid; }
          @page { size: A4; margin: 1.5cm; }
        }
      `}</style>

      <div className="flex justify-between items-center print:hidden">
        <Link to="/admin/payouts" className="text-gold flex items-center gap-1 text-sm font-semibold hover:underline">
          &larr; Back to Payouts
        </Link>
        <button onClick={() => window.print()} className="btn-dark px-4 py-2 flex items-center gap-2 text-xs uppercase font-bold">
          <IPrint size={14} /> Print Statement
        </button>
      </div>

      <div className="card p-8 bg-white text-black border border-gray-200 print:shadow-none print:border-none print:m-0 print:p-0">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start border-b-2 border-gray-200 pb-6 mb-6 gap-4">
          <div className="flex items-center gap-4">
            <Logo size={46} showText={false} />
            <div>
              <h1 className="text-2xl font-serif font-black tracking-tight">{companyName}</h1>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Krantibhumi Branch Operations Portal</p>
              {headOffice && <p className="text-xs text-gray-500 mt-1 max-w-xs">{headOffice}</p>}
            </div>
          </div>
          <div className="sm:text-right">
            <h2 className="text-xl font-black text-gray-800 uppercase tracking-widest">Payout Statement</h2>
            <p className="text-xs text-gray-500 mt-1">Payout ID: <span className="font-mono">{bill.id.toUpperCase()}</span></p>
            <p className="text-xs text-gray-500 mt-0.5">Cycle: <span className="font-semibold">{new Date(bill.year, bill.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}</span></p>
            <p className="text-xs text-gray-500 mt-0.5">Generated: {bill.createdAt ? fmtDate(bill.createdAt) : '—'}</p>
            <p className="text-xs text-gray-500 mt-0.5">Paid: {bill.paidDate ? fmtDate(bill.paidDate) : '—'}</p>
          </div>
        </div>

        {/* Agent Details */}
        <div className="bg-gray-50/50 border border-gray-100 rounded-lg p-6 mb-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 border-b border-gray-100 pb-1">Agent Profile Snapshot</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-3 gap-x-6 text-xs">
            <div><span className="text-gray-500 block">Agent Name</span><span className="font-bold text-gray-800 text-sm">{bill.agentName}</span></div>
            <div><span className="text-gray-500 block">Agent Code</span><span className="font-bold text-gray-800 font-mono">{bill.agentCode || '—'}</span></div>
            <div><span className="text-gray-500 block">Rank</span><span className="font-bold text-gray-800">{displayRankCode} - {displayRankName}</span></div>
            <div><span className="text-gray-500 block">Branch Office</span><span className="font-bold text-gray-800">{displayBranchName}</span></div>
            <div><span className="text-gray-500 block">Sponsor</span><span className="font-bold text-gray-800">{displaySponsorName}</span></div>
            <div><span className="text-gray-500 block">PAN Number</span><span className="font-bold text-gray-800 font-mono">{displayPanNumber}</span></div>
            <div><span className="text-gray-500 block">Bank Name</span><span className="font-bold text-gray-800">{displayBankName}</span></div>
            <div><span className="text-gray-500 block">Account Number</span><span className="font-bold text-gray-800 font-mono">{displayAccountNumber}</span></div>
            <div><span className="text-gray-500 block">IFSC Code</span><span className="font-bold text-gray-800 font-mono">{displayIfscCode}</span></div>
          </div>
        </div>

        {/* Agent Summary Dashboard */}
        <div className="mb-6 border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-100 px-4 py-2 border-b border-gray-200">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600">Business Summary (Aggregated Source of Truth)</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-gray-100 bg-white">
            <div className="p-4 text-center">
              <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Lifetime Business</span>
              <span className="text-sm font-extrabold text-gray-800">{formatINR(agentStats.lifetimeBusiness)}</span>
            </div>
            <div className="p-4 text-center">
              <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Current Month Business</span>
              <span className="text-sm font-extrabold text-blue-700">{formatINR(agentStats.currentMonthBusiness)}</span>
            </div>
            <div className="p-4 text-center">
              <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Total Policies</span>
              <span className="text-sm font-extrabold text-gray-800">{agentStats.policyCount}</span>
            </div>
            <div className="p-4 text-center">
              <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Total Customers</span>
              <span className="text-sm font-extrabold text-gray-800">{agentStats.customerCount}</span>
            </div>
            <div className="p-4 text-center bg-gray-50">
              <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Lifetime Commission Earned</span>
              <span className="text-sm font-black text-green-700">{formatINR(agentStats.commissionEarned)}</span>
            </div>
          </div>
        </div>

        {/* Visual payment flow */}
        <div className="mb-8">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Payment Calculation Flow</h3>
          <div className="grid grid-cols-1 md:grid-cols-7 items-center gap-2">
            <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg text-center shadow-sm">
              <span className="text-[10px] uppercase font-bold text-blue-600 block">Gross Commission</span>
              <span className="text-sm font-extrabold text-blue-900 block mt-1">{formatINR(bill.grossCommission || bill.totalAmount || 0)}</span>
            </div>
            <div className="text-center text-gray-400 font-bold text-lg hidden md:block">➔</div>
            <div className="text-center text-gray-400 font-bold text-lg block md:hidden">▼</div>
            <div className="bg-red-50 border border-red-100 p-3 rounded-lg text-center shadow-sm">
              <span className="text-[10px] uppercase font-bold text-red-600 block">TDS (5%)</span>
              <span className="text-sm font-extrabold text-red-900 block mt-1">-{formatINR(bill.tds || 0)}</span>
            </div>
            <div className="text-center text-gray-400 font-bold text-lg hidden md:block">➔</div>
            <div className="text-center text-gray-400 font-bold text-lg block md:hidden">▼</div>
            <div className="bg-red-50 border border-red-100 p-3 rounded-lg text-center shadow-sm">
              <span className="text-[10px] uppercase font-bold text-red-600 block">Admin Charges (5%)</span>
              <span className="text-sm font-extrabold text-red-900 block mt-1">-{formatINR(bill.adminCharge || 0)}</span>
            </div>
            <div className="text-center text-gray-400 font-bold text-lg hidden md:block">➔</div>
            <div className="text-center text-gray-400 font-bold text-lg block md:hidden">▼</div>
            <div className="bg-green-50 border border-green-200 p-3 rounded-lg text-center shadow-sm ring-2 ring-green-500/20">
              <span className="text-[10px] uppercase font-bold text-green-600 block">Net Payable</span>
              <span className="text-base font-black text-green-900 block mt-1">{formatINR(bill.netPayable || bill.totalAmount || 0)}</span>
            </div>
          </div>
        </div>

        {/* Commission Breakdown Table */}
        <div className="mb-10">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Commission Ledger Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b-2 border-gray-200 text-gray-600">
                  <th className="py-2 px-3 font-semibold">Policy No.</th>
                  <th className="py-2 px-3 font-semibold">Customer</th>
                  <th className="py-2 px-3 font-semibold">Selling Agent</th>
                  <th className="py-2 px-3 font-semibold text-center">Comm %</th>
                  <th className="py-2 px-3 font-semibold text-right">Commission</th>
                  <th className="py-2 px-3 font-semibold text-center">Type</th>
                  <th className="py-2 px-3 font-semibold text-center print:hidden">Hierarchy & Allocation</th>
                </tr>
              </thead>
              <tbody>
                {commissions.length === 0 ? (
                  <tr><td colSpan={7} className="py-4 text-center text-gray-400 italic">No commission entries found in ledger for this cycle.</td></tr>
                ) : commissions.map((c, idx) => {
                  const hasHierarchyExpanded = expandedPolicies.has(c.policyNumber)
                  const levels = getHierarchyForPolicy(c.policyNumber, c.originalAgentId)
                  return (
                    <React.Fragment key={(c.id || idx)}>
                      <tr className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="py-3 px-3 font-mono font-bold text-gray-700">{c.policyNumber}</td>
                        <td className="py-3 px-3 font-medium">{c.customerName}</td>
                        <td className="py-3 px-3">
                          <span className="block font-medium">{c.originalAgentId ? (usersMap[c.originalAgentId]?.name || '—') : c.agentName}</span>
                          <span className="text-[10px] text-gray-400 font-mono block mt-0.5">{c.sponsorCode || '—'}</span>
                        </td>
                        <td className="py-3 px-3 text-center font-mono">{Number(c.percentage || 0).toFixed(2)}%</td>
                        <td className="py-3 px-3 text-right font-bold text-gray-800">{formatINR(c.amount)}</td>
                        <td className="py-3 px-3 text-center uppercase">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                            {c.commissionType === 'Direct' || c.commissionType === 'direct' || c.commissionType === 'direct_own' || (!c.commissionType && !c.compression) ? 'Direct' : 'Upline Commission'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center print:hidden flex items-center justify-center gap-2">
                          <button type="button" onClick={() => toggleExpandPolicy(c.policyNumber)} className="text-gold font-semibold hover:underline text-[10px] uppercase tracking-wide">
                            {hasHierarchyExpanded ? '▼ Hide Hierarchy' : '▶ View Hierarchy'}
                          </button>
                          <span className="text-gray-300">|</span>
                          <button type="button" onClick={() => setAllocationPolicy(c)} className="text-gold font-semibold hover:underline text-[10px] uppercase tracking-wide">
                            View Allocation
                          </button>
                        </td>
                      </tr>
                      <tr className={`bg-gray-50/30 ${hasHierarchyExpanded ? '' : 'hidden print:table-row'}`}>
                        <td colSpan={7} className="p-0 border-b border-gray-100">
                          <div className="px-6 pb-4 pt-2">
                            <div className="text-[10px] font-bold text-gray-500 uppercase mb-2">Genealogy Sponsor Path & Differential Split</div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-3 text-[10px]">
                              <span className="font-bold text-gray-600">Customer:</span><span className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-medium">{c.customerName || '—'}</span>
                              <span className="text-gray-400 font-bold">➔</span>
                              <span className="font-bold text-gray-600">Policy:</span><span className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-mono font-bold">{c.policyNumber || '—'}</span>
                              <span className="text-gray-400 font-bold">➔</span>
                              <span className="font-bold text-gray-600">Product:</span><span className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-medium uppercase">{c.planCode || c.planType || '—'}</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                              {levels.map((lvl) => {
                                const rInfo = getRank(lvl.rank)
                                return (
                                  <div key={lvl.rank} className={`flex items-center justify-between p-2 rounded border text-[10px] ${lvl.isReceiver ? 'bg-gold-50 border-gold-300 font-bold ring-1 ring-gold-400/20 shadow-sm' : lvl.isOccupied ? 'bg-white border-gray-200 text-gray-800' : 'bg-gray-50/50 border-gray-100 text-gray-300 italic'}`}>
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${lvl.isReceiver ? 'bg-gold-600 text-white' : lvl.isOccupied ? 'bg-navy-100 text-navy-800' : 'bg-gray-200 text-gray-400'}`}>R{lvl.rank}</span>
                                      <span className="truncate max-w-[80px] font-medium" title={rInfo.name}>{rInfo.code}</span>
                                    </div>
                                    <div className="truncate text-right pl-2 min-w-0 flex-1">
                                      {lvl.isOccupied ? (
                                        <div className="truncate">
                                          <span className={lvl.isReceiver ? 'text-gold-900 font-black' : 'text-gray-900'}>{lvl.agentName}</span>
                                          {lvl.amount > 0 && <span className="text-[9px] text-green-600 font-bold block mt-0.5">+{formatINR(lvl.amount)} ({Number(lvl.percentage || 0).toFixed(2)}%)</span>}
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
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Next Rank Team Summary Section */}
        <div className="mb-8">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 border-b border-gray-200 pb-1">
            Next Rank Team Summary (Rank {Number(agentProfile?.rank || 1) - 1})
          </h3>
          {Number(agentProfile?.rank || 1) === 1 ? (
            <div className="p-4 bg-gray-50 text-center text-xs text-gray-500 italic border border-gray-100 rounded-lg">
              No lower-rank team exists for this agent.
            </div>
          ) : nextRankLoading ? (
            <div className="p-4 bg-gray-50 text-center text-xs text-gray-500 border border-gray-100 rounded-lg">
              Aggregating team performance...
            </div>
          ) : nextRankTeam.length === 0 ? (
            <div className="p-4 bg-gray-50 text-center text-xs text-gray-500 italic border border-gray-100 rounded-lg">
              No Rank {Number(agentProfile?.rank || 1) - 1} agents found in the downline.
            </div>
          ) : (
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-left text-xs border-collapse bg-white">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 border-b border-gray-200">
                    <th className="py-2.5 px-3 font-semibold">Agent Code</th>
                    <th className="py-2.5 px-3 font-semibold">Agent Name</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Rank</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Lifetime Business</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Current Month Business</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Active Policies</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Active Customers</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Lifetime Comm. Earned</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {nextRankTeam.map((m, idx) => (
                    <tr key={m.id || idx} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="py-2.5 px-3 font-mono text-gray-600">{m.sponsorCode || '—'}</td>
                      <td className="py-2.5 px-3 font-bold text-gray-800">{m.name}</td>
                      <td className="py-2.5 px-3 text-center"><span className="px-1.5 py-0.5 rounded bg-gray-100 font-bold text-gray-700">R{m.rank}</span></td>
                      <td className="py-2.5 px-3 text-right font-semibold text-gray-700">{formatINR(m.totalBV)}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-blue-700">{formatINR(m.monthlyBV)}</td>
                      <td className="py-2.5 px-3 text-center font-mono">{m.policyCount}</td>
                      <td className="py-2.5 px-3 text-center font-mono">{m.customerCount}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-green-700">{formatINR(m.totalCommission)}</td>
                      <td className="py-2.5 px-3 text-center uppercase text-[9px] font-bold">
                        <span className={`px-1.5 py-0.5 rounded ${m.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{m.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200 text-gray-800 font-bold">
                    <td colSpan={3} className="py-3 px-3 text-right uppercase tracking-wider text-[10px]">Team Total</td>
                    <td className="py-3 px-3 text-right">{formatINR(nextRankTeam.reduce((sum, m) => sum + m.totalBV, 0))}</td>
                    <td className="py-3 px-3 text-right text-blue-800">{formatINR(nextRankTeam.reduce((sum, m) => sum + m.monthlyBV, 0))}</td>
                    <td className="py-3 px-3 text-center">{nextRankTeam.reduce((sum, m) => sum + m.policyCount, 0)}</td>
                    <td className="py-3 px-3 text-center">{nextRankTeam.reduce((sum, m) => sum + m.customerCount, 0)}</td>
                    <td className="py-3 px-3 text-right text-green-800">{formatINR(nextRankTeam.reduce((sum, m) => sum + m.totalCommission, 0))}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Audit footer panel */}
        <div className="text-xs text-gray-400 mt-12 pt-6 border-t border-gray-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6">
            <div><span className="text-gray-500 block">Generated By:</span><span className="font-semibold text-gray-700">{bill.generatedBy || 'Super Admin'}</span></div>
            <div><span className="text-gray-500 block">Generated On:</span><span className="font-semibold text-gray-700 font-mono">{bill.createdAt ? fmtDate(bill.createdAt) : '—'}</span></div>
            <div><span className="text-gray-500 block">Approved By:</span><span className="font-semibold text-gray-700">{bill.approvedBy || 'Super Admin'}</span></div>
            <div><span className="text-gray-500 block">Approved On:</span><span className="font-semibold text-gray-700 font-mono">{bill.paidDate ? fmtDate(bill.paidDate) : '—'}</span></div>
            <div><span className="text-gray-500 block">Payout Status:</span><span className="font-bold text-gold uppercase">{bill.status}</span></div>
            <div><span className="text-gray-500 block">System Generated ID:</span><span className="font-mono text-[10px] text-gray-600">{bill.id}</span></div>
          </div>
          <div className="mt-8 pt-4 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4 text-center sm:text-left">
            <p className="text-[10px]">This is an official computer-generated statement and does not require physical signature under auditing rules.</p>
            <div className="w-40 border-t border-gray-300 mt-4 text-center text-[10px] font-bold text-gray-500 uppercase tracking-widest pt-1">
              Authorised Signature
            </div>
          </div>
        </div>

      </div>

      {allocationPolicy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 backdrop-blur-sm p-4 print:hidden">
          <div className="bg-white text-black rounded-xl shadow-2xl border border-gray-100 max-w-3xl w-full max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-serif font-black text-gray-900">Commission Allocation Audit</h3>
                <p className="text-xs text-gray-500">Policy No: <span className="font-mono font-bold text-gray-700">{allocationPolicy.policyNumber}</span></p>
              </div>
              <button onClick={() => setAllocationPolicy(null)} className="text-gray-400 hover:text-gray-600 font-bold text-lg p-1">✕</button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
                <div><span className="text-gray-500 block">Policy Number</span><span className="font-bold text-gray-800 text-sm font-mono">{allocationPolicy.policyNumber}</span></div>
                <div><span className="text-gray-500 block">Customer</span><span className="font-bold text-gray-800 text-sm">{allocationPolicy.customerName}</span></div>
                <div><span className="text-gray-500 block">Business Volume</span><span className="font-bold text-gray-800 text-sm">{formatINR(allocationPolicy.businessAmount || 0)}</span></div>
                <div><span className="text-gray-500 block">Plan Code</span><span className="font-bold text-gray-800 uppercase text-sm font-mono">{allocationPolicy.planCode || allocationPolicy.planType || '—'}</span></div>
                <div><span className="text-gray-500 block">Total Commission</span><span className="font-bold text-gold text-sm">{formatINR((policyCommissionsMap[allocationPolicy.policyNumber] || []).reduce((sum, x) => sum + (x.amount || 0), 0))}</span></div>
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
                      {(policyCommissionsMap[allocationPolicy.policyNumber] || [])
                        .slice()
                        .sort((a, b) => Number(a.receivingRank || 1) - Number(b.receivingRank || 1))
                        .map((lvl, idx) => {
                          const rInfo = getRank(lvl.receivingRank || 1)
                          const isReceiver = lvl.agentId === bill.agentId
                          return (
                            <tr key={lvl.id || idx} className={`border-b border-gray-100 last:border-0 hover:bg-gray-50/50 ${isReceiver ? 'bg-gold-50 font-bold' : ''}`}>
                              <td className="py-2.5 px-3 font-mono">R{lvl.receivingRank || 1}</td>
                              <td className="py-2.5 px-3 font-medium">{rInfo.code} - {rInfo.name}</td>
                              <td className="py-2.5 px-3">{lvl.agentName}</td>
                              <td className="py-2.5 px-3 font-mono">{lvl.sponsorCode || lvl.agentCode || '—'}</td>
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
              <span className="text-sm font-black text-gold">{formatINR((policyCommissionsMap[allocationPolicy.policyNumber] || []).reduce((sum, x) => sum + (x.amount || 0), 0))}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
