import { useEffect, useMemo, useState } from 'react'
import { where, getDocs, query, collection } from 'firebase/firestore'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useCollection, useDoc } from '../../hooks/useFirestore'
import { useRanks } from '../../contexts/RanksContext'
import { formatINR, fmtDate, toDate } from '../../utils/format'
import RankBadge from '../../components/ui/RankBadge'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonStats, SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { ITrophy, ICash, IShield, IClock, IDoc, IUsers, ICheck, IPrint } from '../../components/ui/icons'
import Logo from '../../components/ui/Logo'
import { db } from '../../firebase'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

export default function MyEarnings() {
  const { profile } = useAuth()
  const uid = profile?.uid
  const sponsorCode = profile?.sponsorCode || ''

  // Load Firestore collections dynamically
  const ownPlans = useCollection('plans', uid ? [where('agentId', '==', uid)] : null)
  const commissions = useCollection('commission_ledger', uid ? [where('agentId', '==', uid)] : null)
  const payouts = useCollection('payouts', uid ? [where('agentId', '==', uid)] : null)
  const ledger = useCollection('commission_ledger', sponsorCode ? [where('sponsorCode', '==', sponsorCode)] : null)
  const allUsers = useCollection('users')
  const enrolledCustomers = useCollection('customers', uid ? [where('enrolledBy', '==', uid)] : null)
  const { data: settings } = useDoc('config/settings')

  const { getRank, nextRank, config } = useRanks()

  // Selected payout detail view state
  const [selectedPayout, setSelectedPayout] = useState(null)

  // Commission View Details Modal States
  const [selectedComm, setSelectedComm] = useState(null)
  const [allocationComms, setAllocationComms] = useState([])
  const [allocationPayout, setAllocationPayout] = useState(null)
  const [loadingAllocation, setLoadingAllocation] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  const loading = ownPlans.loading || commissions.loading || payouts.loading || ledger.loading || allUsers.loading || enrolledCustomers.loading

  // Calculations
  const stats = useMemo(() => {
    if (loading) return {}

    const unpaidComms = commissions.data.filter(c => c.status === 'unpaid')
    const paidComms = commissions.data.filter(c => c.status === 'paid')

    const pendingAmount = unpaidComms.reduce((sum, c) => sum + (c.amount || 0), 0)
    const paidAmount = paidComms.reduce((sum, c) => sum + (c.amount || 0), 0)

    // Calculate current month volume sold
    const currMonth = new Date().getMonth() + 1
    const currYear = new Date().getFullYear()

    const monthPlans = ownPlans.data.filter(p => {
      const start = p.startDate?.seconds ? new Date(p.startDate.seconds * 1000) : new Date(p.startDate)
      if (isNaN(start.getTime())) return false
      return (start.getMonth() + 1 === currMonth) && (start.getFullYear() === currYear)
    })

    const monthlyBusinessVolume = monthPlans.reduce((sum, p) => {
      const isRD = p.type?.toLowerCase().startsWith('rd')
      return sum + (isRD ? (p.monthlyAmount * 12) : p.fdAmount)
    }, 0)

    // Current Month Commissions Income
    const currentMonthIncome = commissions.data
      .filter(c => c.month === currMonth && c.year === currYear)
      .reduce((sum, c) => sum + (c.amount || 0), 0)

    // Sort payouts by date descending
    const sortedPayouts = [...payouts.data].sort((a, b) => {
      const timeA = a.generatedDate?.seconds ? a.generatedDate.seconds * 1000 : 0
      const timeB = b.generatedDate?.seconds ? b.generatedDate.seconds * 1000 : 0
      return timeB - timeA
    })

    const lastPayout = sortedPayouts.find(p => p.status === 'paid')

    // Sum of all-time business volume
    const lifetimeBusinessVolume = ownPlans.data.reduce((sum, p) => {
      const isRD = p.type?.toLowerCase().startsWith('rd')
      return sum + (isRD ? (p.monthlyAmount * 12) : p.fdAmount)
    }, 0)

    // Calculate MLM Team business volume (direct downline only as per requirements)
    const getDirectDownlineVolume = (parentId) => {
      let vol = 0
      allUsers.data.forEach(u => {
        if (u.referredBy === parentId) {
          vol += (u.businessVolume || 0)
        }
      })
      return vol
    }
    const teamBusiness = getDirectDownlineVolume(uid)

    // Recent Policies sold
    const recentPolicies = [...ownPlans.data]
      .sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0))
      .slice(0, 5)

    // Recent Enrolled Customers
    const recentCustomers = [...enrolledCustomers.data]
      .sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0))
      .slice(0, 5)

    // 4 Summary cards calculations
    const lifetimeCommission = commissions.data.reduce((sum, c) => sum + (c.amount || 0), 0)
    const thisMonthCommission = commissions.data
      .filter(c => c.month === currMonth && c.year === currYear)
      .reduce((sum, c) => sum + (c.amount || 0), 0)
    const pendingCommission = pendingAmount
    const paidCommission = paidAmount

    return {
      pendingAmount,
      paidAmount,
      monthlyBusinessVolume,
      currentMonthIncome,
      lifetimeBusinessVolume,
      teamBusiness,
      lastPayout,
      sortedPayouts,
      recentPolicies,
      recentCustomers,
      lifetimeCommission,
      thisMonthCommission,
      pendingCommission,
      paidCommission,
    }
  }, [commissions.data, payouts.data, ownPlans.data, allUsers.data, enrolledCustomers.data, loading, profile?.rank, config, uid])

  const handleViewDetails = async (c) => {
    setSelectedComm(c)
    setLoadingAllocation(true)
    try {
      // 1. Fetch all commissions for this policy in the same month/year
      const q = query(
        collection(db, 'commission_ledger'),
        where('policyNumber', '==', c.policyNumber),
        where('month', '==', c.month),
        where('year', '==', c.year)
      )
      const snap = await getDocs(q)
      const list = []
      snap.forEach(d => list.push({ id: d.id, ...d.data() }))
      setAllocationComms(list)

      // 2. Fetch payout matching this month/year for the current agent
      const pq = query(
        collection(db, 'payouts'),
        where('agentId', '==', uid),
        where('month', '==', c.month),
        where('year', '==', c.year)
      )
      const pSnap = await getDocs(pq)
      if (!pSnap.empty) {
        setAllocationPayout({ id: pSnap.docs[0].id, ...pSnap.docs[0].data() })
      } else {
        setAllocationPayout(null)
      }
    } catch (err) {
      console.error('Failed to load allocation data:', err)
    } finally {
      setLoadingAllocation(false)
    }
  }

  const getHierarchyForModal = () => {
    if (!selectedComm) return []
    // 1. Reconstruct live path
    const path = []
    let currId = selectedComm.originalAgentId || selectedComm.agentId
    const visited = new Set()
    const usersMap = {}
    allUsers.data.forEach(d => { usersMap[d.id] = d })

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

    // Build levels from 1 to 18
    const levels = []
    for (let r = 1; r <= 18; r++) {
      // Check if there is an override in historical commissions
      const hist = allocationComms.find(x => Number(x.receivingRank) === r)
      if (hist) {
        levels.push({
          rank: r,
          agentId: hist.agentId,
          agentName: hist.agentName,
          amount: hist.amount || 0,
          percentage: hist.percentage || 0,
          isReceiver: hist.agentId === uid, // Highlight if matches logged-in agent
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
            isReceiver: liveAgent.id === uid,
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

  const downloadStatementPdf = async () => {
    if (!selectedComm) return
    const element = document.getElementById('commission-statement-pdf')
    if (!element) return

    setDownloadingPdf(true)
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      
      const imgWidth = 210
      const pageHeight = 295
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      let heightLeft = imgHeight
      let position = 0

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }
      
      pdf.save(`Commission_Statement_${selectedComm.policyNumber}.pdf`)
    } catch (err) {
      console.error('Failed to generate PDF:', err)
    } finally {
      setDownloadingPdf(false)
    }
  }

  const rank = getRank(profile?.rank)
  const next = nextRank(profile?.rank)

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="card h-28 animate-pulse bg-navy-2" />
        <SkeletonStats count={4} />
        <SkeletonTable rows={4} cols={4} />
      </div>
    )
  }

  const hierarchyLevels = getHierarchyForModal()
  const totalCommissionDistributed = allocationComms.reduce((sum, x) => sum + (x.amount || 0), 0)

  // Payment details calculations for selected details modal
  const allocationPayoutDetails = allocationPayout || (selectedComm ? {
    grossCommission: selectedComm.amount,
    tds: selectedComm.amount * 0.05,
    adminCharge: selectedComm.amount * 0.05,
    netPayable: selectedComm.amount * 0.9,
    paidDate: null
  } : null)

  const companyName = settings?.companyName || 'APEX Savings'
  const headOffice = settings?.headOffice || ''

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      
      {/* CSS print-mode directives */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .modal-print-container, .modal-print-container * {
            visibility: visible !important;
          }
          .modal-print-container {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            color: black !important;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>

      {/* Rank overview and summary */}
      <div className="card relative overflow-hidden p-6 border-l-4 border-gold-1 bg-navy-3">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold-1/5 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-ink-1 font-serif">{profile?.name}</h2>
              <RankBadge rank={profile?.rank} />
            </div>
            <p className="mt-0.5 text-xs text-ink-2 font-mono">Rank Level: {rank.name} ({rank.code})</p>
          </div>
          <div className="text-right">
            <span className="block text-[10px] text-ink-2 uppercase tracking-wide">Personal Business Volume</span>
            <span className="text-2xl font-extrabold text-gold font-serif mt-0.5 block">
              {formatINR(stats.lifetimeBusinessVolume)}
            </span>
          </div>
        </div>

        {next && (
          <div className="relative mt-5 pt-4 border-t border-navy-4/50">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold">
              <span className="text-ink-2">Next Promotion Target: {next.code}</span>
              <span className="text-ink-1 font-mono">
                {formatINR(stats.lifetimeBusinessVolume)} / {formatINR(next.promoTarget || 50000)}
              </span>
            </div>
            <div className="w-full bg-navy-2 rounded-full h-2 overflow-hidden border border-navy-4">
              <div 
                className="bg-gold h-2 rounded-full transition-all duration-300" 
                style={{ width: `${Math.min(100, (stats.lifetimeBusinessVolume / (next.promoTarget || 50000)) * 100)}%` }} 
              />
            </div>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card p-4 space-y-1">
          <span className="flex h-8 w-8 items-center justify-center rounded bg-gold-1/10 text-gold-1 border border-gold-1/25">
            <ICash size={18} />
          </span>
          <p className="text-[10px] uppercase font-bold text-ink-2 tracking-wide">Pending commissions</p>
          <p className="text-lg font-bold text-ink-1 font-serif">{formatINR(stats.pendingAmount)}</p>
        </div>

        <div className="card p-4 space-y-1">
          <span className="flex h-8 w-8 items-center justify-center rounded bg-ok/10 text-ok border border-ok/25">
            <ICheck size={18} />
          </span>
          <p className="text-[10px] uppercase font-bold text-ink-2 tracking-wide">Current Month Income</p>
          <p className="text-lg font-bold text-ink-1 font-serif">{formatINR(stats.currentMonthIncome)}</p>
        </div>

        <div className="card p-4 space-y-1">
          <span className="flex h-8 w-8 items-center justify-center rounded bg-navy-4 text-gold-1 border border-navy-4">
            <ITrophy size={18} />
          </span>
          <p className="text-[10px] uppercase font-bold text-ink-2 tracking-wide">Team Business Volume</p>
          <p className="text-lg font-bold text-ink-1 font-serif">
            {formatINR(stats.teamBusiness)}
          </p>
        </div>

        <div className="card p-4 space-y-1">
          <span className="flex h-8 w-8 items-center justify-center rounded bg-[#8FA382]/10 text-[#7A8E6E] border border-[#8FA382]/25">
            <IShield size={18} />
          </span>
          <p className="text-[10px] uppercase font-bold text-ink-2 tracking-wide">Monthly BV (Current)</p>
          <p className="text-lg font-bold text-ink-1 font-serif">{formatINR(stats.monthlyBusinessVolume)}</p>
        </div>
      </div>

      {/* Recent Policies and Customers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent Policies list */}
        <div className="card p-5 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">
            Recent Policies Sold
          </h3>
          {stats.recentPolicies.length ? (
            <div className="table-wrap">
              <table className="tbl text-xs">
                <thead>
                  <tr>
                    <th>Policy No.</th>
                    <th>Client Name</th>
                    <th>Product</th>
                    <th>Deposit</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentPolicies.map(p => {
                    const isRD = p.type?.toLowerCase().startsWith('rd')
                    return (
                      <tr key={p.id}>
                        <td className="font-mono text-gold font-semibold">{p.policyNumber}</td>
                        <td className="font-semibold text-ink-1">{p.customerName}</td>
                        <td className="uppercase font-semibold text-ink-2">{p.type}</td>
                        <td className="font-mono font-bold text-ink-1">
                          {isRD ? `${formatINR(p.monthlyAmount)}/mo` : formatINR(p.fdAmount)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-ink-2 italic py-4 text-center">No recent policies logged.</p>
          )}
        </div>

        {/* Recent Onboarded Customers */}
        <div className="card p-5 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">
            Recently Onboarded Customers
          </h3>
          {stats.recentCustomers.length ? (
            <div className="table-wrap">
              <table className="tbl text-xs">
                <thead>
                  <tr>
                    <th>Customer ID</th>
                    <th>Client Name</th>
                    <th>Phone</th>
                    <th>Plans Count</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentCustomers.map(c => (
                    <tr key={c.id}>
                      <td className="font-mono font-semibold text-gold">{c.customerId}</td>
                      <td className="font-semibold text-ink-1">{c.name}</td>
                      <td className="font-mono text-ink-2">{c.phone || '—'}</td>
                      <td className="font-bold text-ink-1">{c.plansCount || 1}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-ink-2 italic py-4 text-center">No customer profiles onboarded yet.</p>
          )}
        </div>
      </div>

      {/* Payout statement and income history */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Payout Statements List */}
        <div className="card p-5 space-y-4 md:col-span-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">
            Monthly Payout History
          </h3>
          {stats.sortedPayouts.length ? (
            <div className="space-y-3">
              {stats.sortedPayouts.map(p => (
                <div 
                  key={p.id} 
                  onClick={() => setSelectedPayout(p)}
                  className={`p-3 rounded-card border cursor-pointer transition-all ${
                    selectedPayout?.id === p.id 
                      ? 'border-gold-1 bg-gold-1/5' 
                      : 'border-navy-4 bg-navy-2/30 hover:bg-navy-2/60'
                  }`}
                >
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-ink-1">
                      {p.month}/{p.year}
                    </span>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-ink-2 mt-1">
                    <span>Policies: {p.policiesCount}</span>
                    <span className="font-bold text-ink-1 font-mono">{formatINR(p.totalPayable)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-2 italic py-4 text-center">No payouts generated yet.</p>
          )}
        </div>

        {/* Income Breakdown detail view */}
        <div className="card p-5 space-y-4 md:col-span-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">
            {selectedPayout 
              ? `Statement Detail: ${selectedPayout.month}/${selectedPayout.year}` 
              : 'Statement Detail Preview'
            }
          </h3>
          {selectedPayout ? (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4 bg-navy-2/30 p-4 rounded-card border border-navy-4/50">
                <div className="space-y-2">
                  <div>
                    <span className="text-[10px] text-ink-2 uppercase block">Total Commission (MDA)</span>
                    <span className="text-sm font-bold text-ink-1">{formatINR(selectedPayout.totalCommission)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-ink-2 uppercase block">Field Allowance (MFA)</span>
                    <span className="text-sm font-bold text-ink-1">{selectedPayout.mfa > 0 ? formatINR(selectedPayout.mfa) : '₹0'}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div>
                    <span className="text-[10px] text-ink-2 uppercase block">Performance Bonus (PB)</span>
                    <span className="text-sm font-bold text-ink-1">{selectedPayout.pb > 0 ? formatINR(selectedPayout.pb) : '₹0'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-ink-2 uppercase block">Travel Allowance (TA)</span>
                    <span className="text-sm font-bold text-ink-1">{selectedPayout.ta > 0 ? formatINR(selectedPayout.ta) : '₹0'}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center border-t border-navy-4 pt-3">
                <span className="text-sm font-bold text-ink-1 font-serif">Total Net Payable</span>
                <span className="text-lg font-bold text-gold font-serif">{formatINR(selectedPayout.totalPayable)}</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-xs text-ink-2">
              <ICash size={24} className="mx-auto text-ink-2 mb-2" />
              Select a payout month from the history panel to audit your full breakdown statement.
            </div>
          )}
        </div>
      </div>

      {/* Income ledger audits */}
      <div className="card p-5 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan pb-1.5 border-b border-navy-4/50">
          Personal Income Ledger
        </h3>

        {/* Commissions Summary Cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 pb-2">
          <div className="p-3 bg-navy-2/30 rounded-card border border-navy-4/50">
            <span className="text-[9px] text-ink-2 uppercase block font-bold">Lifetime Commission</span>
            <span className="text-base font-extrabold text-gold mt-0.5 block font-serif">{formatINR(stats.lifetimeCommission)}</span>
          </div>
          <div className="p-3 bg-navy-2/30 rounded-card border border-navy-4/50">
            <span className="text-[9px] text-ink-2 uppercase block font-bold">This Month</span>
            <span className="text-base font-extrabold text-gold mt-0.5 block font-serif">{formatINR(stats.thisMonthCommission)}</span>
          </div>
          <div className="p-3 bg-navy-2/30 rounded-card border border-navy-4/50">
            <span className="text-[9px] text-ink-2 uppercase block font-bold">Pending Commission</span>
            <span className="text-base font-extrabold text-gold mt-0.5 block font-serif">{formatINR(stats.pendingCommission)}</span>
          </div>
          <div className="p-3 bg-navy-2/30 rounded-card border border-navy-4/50">
            <span className="text-[9px] text-ink-2 uppercase block font-bold">Paid Commission</span>
            <span className="text-base font-extrabold text-gold mt-0.5 block font-serif">{formatINR(stats.paidCommission)}</span>
          </div>
        </div>

        {ledger.data.length ? (
          <div className="table-wrap">
            <table className="tbl text-xs">
              <thead>
                <tr>
                  <th>Credit Date</th>
                  <th>Policy No.</th>
                  <th>Customer</th>
                  <th>Plan Product</th>
                  <th>Payout Type</th>
                  <th>Percentage</th>
                  <th className="text-right">Credit Amount</th>
                  <th className="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {ledger.data.map(log => (
                  <tr key={log.id}>
                    <td className="font-mono text-ink-2">{log.createdAt ? fmtDate(log.createdAt) : '—'}</td>
                    <td className="font-mono text-ink-1 font-semibold">{log.policyNumber || '—'}</td>
                    <td className="font-semibold text-ink-1">{log.customerName || '—'}</td>
                    <td className="text-ink-2 font-semibold uppercase">{log.planCode || '—'}</td>
                    <td>
                      <span className="font-semibold text-ink-2 uppercase text-[10px] bg-navy-2 px-2 py-0.5 rounded border border-navy-4 whitespace-nowrap block text-center">
                        {log.commissionType === 'Direct' || log.commissionType === 'direct' || log.commissionType === 'direct_own' || (!log.commissionType && !log.compression) ? 'Direct' : 'Upline Commission'}
                      </span>
                    </td>
                    <td className="text-ink-2 font-mono">{log.percentage ? `${(Number(log.percentage) * 100).toFixed(1)}%` : '—'}</td>
                    <td className="text-right font-bold text-gold">{formatINR(log.amount)}</td>
                    <td className="text-center">
                      <button
                        type="button"
                        onClick={() => handleViewDetails(log)}
                        className="text-gold font-bold hover:underline text-[10px] uppercase tracking-wide"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-ink-2 italic py-4 text-center">No ledger logs recorded under this sponsor account yet.</p>
        )}
      </div>

      {/* Commission View Details Modal */}
      {selectedComm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/70 backdrop-blur-sm p-4 print:hidden">
          <div className="bg-white text-black rounded-xl shadow-2xl border border-gray-100 max-w-3xl w-full max-h-[90vh] flex flex-col modal-print-container">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 print:hidden">
              <div>
                <h3 className="text-lg font-serif font-black text-gray-900">Commission Detail Statement</h3>
                <p className="text-xs text-gray-500">Audit Trail: <span className="font-mono font-bold text-gray-700">{selectedComm.policyNumber}</span></p>
              </div>
              <button 
                onClick={() => { setSelectedComm(null); setAllocationComms([]); setAllocationPayout(null) }}
                className="text-gray-400 hover:text-gray-600 font-bold text-lg p-1"
              >
                ✕
              </button>
            </div>

            {/* Modal Scrollable Content */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
              
              {loadingAllocation ? (
                <div className="py-12 text-center text-gray-500 italic">Fetching complete allocation details...</div>
              ) : (
                <>
                  {/* Printable/Canvas Container */}
                  <div id="commission-statement-pdf" className="bg-white text-black p-8 font-sans space-y-6">
                    
                    {/* Header */}
                    <div className="flex justify-between items-start border-b-2 border-gray-200 pb-6 gap-4">
                      <div className="flex items-center gap-4">
                        <Logo size={46} showText={false} />
                        <div>
                          <h1 className="text-2xl font-serif font-black tracking-tight">{companyName}</h1>
                          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">APEX Branch Operations Portal</p>
                          {headOffice && <p className="text-xs text-gray-500 mt-1 max-w-xs">{headOffice}</p>}
                        </div>
                      </div>
                      <div className="text-right">
                        <h2 className="text-xl font-black text-gray-800 uppercase tracking-widest">Commission Statement</h2>
                        <p className="text-xs text-gray-500 mt-1">Policy No: <span className="font-mono font-bold">{selectedComm.policyNumber}</span></p>
                        <p className="text-xs text-gray-500 mt-0.5">Cycle: <span className="font-semibold">{selectedComm.month}/{selectedComm.year}</span></p>
                        <p className="text-xs text-gray-500 mt-0.5">Generated: {new Date().toLocaleDateString()}</p>
                      </div>
                    </div>

                    {/* Agent Details */}
                    <div className="bg-gray-50 border border-gray-100 rounded-lg p-4">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 border-b border-gray-100 pb-1">Agent Details</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-4 text-xs">
                        <div>
                          <span className="text-gray-500 block">Agent Name</span>
                          <span className="font-bold text-gray-800">{profile?.name}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block">Agent Code</span>
                          <span className="font-bold text-gray-800 font-mono">{sponsorCode || '—'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block">Rank</span>
                          <span className="font-bold text-gray-800">{rank.code} - {rank.name}</span>
                        </div>
                      </div>
                    </div>

                    {/* Policy Details */}
                    <div className="bg-gray-50 border border-gray-100 rounded-lg p-4">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 border-b border-gray-100 pb-1">Policy & Product Details</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-y-2 gap-x-4 text-xs">
                        <div>
                          <span className="text-gray-500 block">Policy Number</span>
                          <span className="font-bold text-gray-800 font-mono">{selectedComm.policyNumber}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block">Customer</span>
                          <span className="font-bold text-gray-800">{selectedComm.customerName}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block">Business Volume</span>
                          <span className="font-bold text-gray-800">{formatINR(selectedComm.businessAmount || 0)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block">Plan Code</span>
                          <span className="font-bold text-gray-800 uppercase font-mono">{selectedComm.planCode || selectedComm.planType || '—'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block">Commission Earned</span>
                          <span className="font-bold text-gold">{formatINR(selectedComm.amount)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Explanation section */}
                    <div className="bg-gold-50/50 border border-gold-200 rounded-lg p-4">
                      <h4 className="text-xs font-bold text-gold-900 uppercase tracking-wide mb-1">Why did I receive this commission?</h4>
                      <p className="text-gray-700 leading-relaxed mb-3">You are part of the sponsor hierarchy for this policy. Commissions are distributed based on differential upline ranks and direct sales roles.</p>
                      <div className="grid grid-cols-3 gap-2 text-center text-[10px] bg-white p-2 rounded border border-gold-100">
                        <div>
                          <span className="text-gray-500 block uppercase">Your Rank</span>
                          <span className="font-bold text-gray-800 text-xs block mt-0.5">{rank.code} - {rank.name}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block uppercase">Configured %</span>
                          <span className="font-bold text-gray-800 text-xs block mt-0.5">{(Number(selectedComm.percentage || 0) * 100).toFixed(1)}%</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block uppercase">Commission Earned</span>
                          <span className="font-bold text-gold text-xs block mt-0.5">{formatINR(selectedComm.amount)}</span>
                        </div>
                      </div>
                    </div>

                    {/* COMPLETE Sponsor Hierarchy */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">COMPLETE Sponsor Hierarchy Path (Rank 1 - 18)</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {hierarchyLevels.map((lvl) => {
                          const rInfo = getRank(lvl.rank)
                          const isReceiver = lvl.agentId === uid
                          return (
                            <div 
                              key={lvl.rank}
                              className={`flex items-center justify-between p-2 rounded border text-[10px] ${
                                isReceiver 
                                  ? 'bg-gold-50 border-gold-300 font-bold ring-1 ring-gold-400/20 shadow-sm' 
                                  : lvl.isOccupied 
                                    ? 'bg-white border-gray-200 text-gray-800' 
                                    : 'bg-gray-50/50 border-gray-100 text-gray-300 italic'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                                  isReceiver
                                    ? 'bg-gold-600 text-white'
                                    : lvl.isOccupied
                                      ? 'bg-navy-100 text-navy-800'
                                      : 'bg-gray-200 text-gray-400'
                                }`}>
                                  R{lvl.rank}
                                </span>
                                <span className="truncate max-w-[80px] font-medium" title={rInfo.name}>{rInfo.code}</span>
                              </div>

                              <div className="truncate text-right pl-2 min-w-0 flex-1">
                                {lvl.isOccupied ? (
                                  <div className="truncate">
                                    <span className={isReceiver ? 'text-gold-900 font-black' : 'text-gray-900'}>
                                      {lvl.agentName}
                                    </span>
                                    {isReceiver && <span className="text-[8px] text-gold-600 font-bold block mt-0.5">(You)</span>}
                                  </div>
                                ) : (
                                  <span>—</span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* COMPLETE Commission Allocation Table */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">COMPLETE Commission Allocation Ledger</h4>
                      <div className="overflow-x-auto border border-gray-100 rounded-lg">
                        <table className="w-full text-left border-collapse text-[10px]">
                          <thead>
                            <tr className="bg-gray-100 border-b border-gray-200 text-gray-600 font-semibold">
                              <th className="py-2 px-3">Rank</th>
                              <th className="py-2 px-3">Agent</th>
                              <th className="py-2 px-3 text-center">Comm %</th>
                              <th className="py-2 px-3 text-right">Commission Amount</th>
                              <th className="py-2 px-3 text-center">Type</th>
                              <th className="py-2 px-3 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {allocationComms
                              .slice()
                              .sort((a, b) => Number(a.receivingRank || 1) - Number(b.receivingRank || 1))
                              .map((c, idx) => {
                                const isReceiver = c.agentId === uid
                                return (
                                  <tr 
                                    key={c.id || idx}
                                    className={`border-b border-gray-100 last:border-0 hover:bg-gray-50/50 ${
                                      isReceiver ? 'bg-gold-50 font-bold' : ''
                                    }`}
                                  >
                                    <td className="py-2 px-3 font-mono">R{c.receivingRank || 1}</td>
                                    <td className="py-2 px-3">
                                      <span className={isReceiver ? 'text-gold-900 font-black' : 'text-gray-900'}>{c.agentName}</span>
                                      <span className="text-[9px] text-gray-400 font-mono block">{c.sponsorCode || '—'}</span>
                                    </td>
                                    <td className="py-2 px-3 text-center font-mono">{(Number(c.percentage || 0) * 100).toFixed(1)}%</td>
                                    <td className="py-2 px-3 text-right font-bold text-gray-800">{formatINR(c.amount)}</td>
                                    <td className="py-2 px-3 text-center uppercase">
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                                        {c.commissionType === 'Direct' || c.commissionType === 'direct' || c.commissionType === 'direct_own' ? 'Direct' : 'Differential'}
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 text-center uppercase">
                                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                        c.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                      }`}>
                                        {c.status}
                                      </span>
                                    </td>
                                  </tr>
                                )
                              })}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex justify-between items-center text-xs font-bold text-gray-700 mt-2 px-1">
                        <span>Total Commission Distributed:</span>
                        <span className="text-gold font-black">{formatINR(totalCommissionDistributed)}</span>
                      </div>
                    </div>

                    {/* Payment Details */}
                    <div className="border-t border-gray-100 pt-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Cycle Payout Details</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-gray-50 p-3 rounded-lg border border-gray-100 text-[10px]">
                        <div>
                          <span className="text-gray-500 block">Gross Commission</span>
                          <span className="font-bold text-gray-800 text-xs">{formatINR(allocationPayoutDetails.grossCommission || allocationPayoutDetails.totalPayable || selectedComm.amount)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block">TDS Deduction (5%)</span>
                          <span className="font-bold text-red-600 text-xs">-{formatINR(allocationPayoutDetails.tds || (selectedComm.amount * 0.05))}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block">Admin Charge (5%)</span>
                          <span className="font-bold text-red-600 text-xs">-{formatINR(allocationPayoutDetails.adminCharge || (selectedComm.amount * 0.05))}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block">Net Commission</span>
                          <span className="font-bold text-green-600 text-xs">{formatINR(allocationPayoutDetails.netPayable || (selectedComm.amount * 0.9))}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block">Payment Date</span>
                          <span className="font-bold text-gray-800 text-xs font-mono">
                            {allocationPayoutDetails.paidDate ? fmtDate(allocationPayoutDetails.paidDate) : 'Pending Payout Cycle'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="text-[10px] text-gray-400 border-t border-gray-100 pt-4 flex flex-col sm:flex-row justify-between items-center gap-4 text-center sm:text-left">
                      <p>This is an official computer-generated statement and does not require physical signature under auditing rules.</p>
                      <div className="w-40 border-t border-gray-300 mt-4 text-center text-[9px] font-bold text-gray-500 uppercase tracking-widest pt-1">
                        Authorised Signature
                      </div>
                    </div>

                  </div>
                </>
              )}

            </div>

            {/* Modal Action Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl print:hidden">
              <button 
                type="button"
                onClick={downloadStatementPdf}
                disabled={loadingAllocation || downloadingPdf}
                className="btn-gold px-4 py-2 text-xs uppercase font-bold tracking-wide disabled:opacity-50"
              >
                {downloadingPdf ? 'Generating PDF...' : 'Download Statement'}
              </button>
              <button 
                type="button"
                onClick={() => window.print()}
                disabled={loadingAllocation || downloadingPdf}
                className="btn-dark px-4 py-2 text-xs uppercase font-bold tracking-wide flex items-center gap-1.5 disabled:opacity-50"
              >
                <IPrint size={14} /> Print Statement
              </button>
              <button 
                type="button" 
                onClick={() => { setSelectedComm(null); setAllocationComms([]); setAllocationPayout(null) }}
                className="border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 px-4 py-2 text-xs uppercase font-bold tracking-wide rounded-card"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
