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

  // Selected Month & Year for Monthly Agent Performance Summary
  const [perfMonth, setPerfMonth] = useState(new Date().getMonth() + 1)
  const [perfYear, setPerfYear] = useState(new Date().getFullYear())

  // Load Firestore collections dynamically - strictly scoped to authenticated agent's UID
  const ownPlans = useCollection('plans', uid ? [where('agentId', '==', uid)] : null)
  const commissions = useCollection('commission_ledger', uid ? [where('agentId', '==', uid)] : null)
  const payouts = useCollection('payouts', uid ? [where('agentId', '==', uid)] : null)
  const payments = useCollection('payments', uid ? [where('agentId', '==', uid)] : null)
  const enrolledCustomers = useCollection('customers', uid ? [where('enrolledBy', '==', uid)] : null)
  const { data: settings } = useDoc('config/settings')

  const { getRank, nextRank, config } = useRanks()

  // Selected payout detail view state
  const [selectedPayout, setSelectedPayout] = useState(null)

  // Commission View Details Modal States
  const [selectedComm, setSelectedComm] = useState(null)
  const [exportingExcel, setExportingExcel] = useState(false)

  const loading = ownPlans.loading || commissions.loading || payouts.loading || payments.loading || enrolledCustomers.loading

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
      const fallbackDate = p.startDate || p.date || p.createdAt
      const start = fallbackDate?.seconds ? new Date(fallbackDate.seconds * 1000) : new Date(fallbackDate)
      if (isNaN(start.getTime())) return false
      return (start.getMonth() + 1 === currMonth) && (start.getFullYear() === currYear)
    })

    const monthlyBusinessVolume = monthPlans.reduce((sum, p) => {
      const isRD = (p.planType || p.type || '').toLowerCase().startsWith('rd')
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

    // Lifetime Business Volume
    const lifetimeBusinessVolume = ownPlans.data.reduce((sum, p) => {
      const isRD = (p.planType || p.type || '').toLowerCase().startsWith('rd')
      return sum + (isRD ? (p.monthlyAmount || 0) * 12 : (p.fdAmount || 0))
    }, 0)

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
      lastPayout,
      sortedPayouts,
      recentPolicies,
      recentCustomers,
      lifetimeCommission,
      thisMonthCommission,
      pendingCommission,
      paidCommission,
    }
  }, [commissions.data, payouts.data, ownPlans.data, enrolledCustomers.data, loading, profile?.rank, config, uid])

  // ── MONTHLY PERFORMANCE COMPUTATION ──────────────────────────────────────────
  const monthlyPerformance = useMemo(() => {
    if (loading) return null

    // Helper date comparison for target month & year
    const matchMonthYear = (rawDate) => {
      const d = toDate(rawDate)
      if (!d || isNaN(d.getTime())) return false
      return d.getMonth() + 1 === perfMonth && d.getFullYear() === perfYear
    }

    // 1. Policies created in selected month
    const monthPlans = ownPlans.data.filter(p => {
      const fallbackDate = p.startDate || p.date || p.createdAt
      return matchMonthYear(fallbackDate)
    })

    let rdCount = 0, fdCount = 0, pensionCount = 0
    let rdBusiness = 0, fdBusiness = 0, pensionBusiness = 0

    monthPlans.forEach(p => {
      const typeStr = (p.planType || p.type || '').toUpperCase()
      if (typeStr.startsWith('RD')) {
        rdCount++
        rdBusiness += Number(p.monthlyAmount || p.amount || 0)
      } else if (typeStr.startsWith('PENS')) {
        pensionCount++
        pensionBusiness += Number(p.fdAmount || p.monthlyAmount || p.amount || 0)
      } else {
        fdCount++
        fdBusiness += Number(p.fdAmount || p.amount || 0)
      }
    })

    const totalPolicies = monthPlans.length
    const totalBusiness = rdBusiness + fdBusiness + pensionBusiness

    // 2. Commission Summary reading ALREADY-CALCULATED ledger docs (no recalculation)
    const monthComms = commissions.data.filter(c => c.month === perfMonth && c.year === perfYear)

    let directComm = 0, gapComm = 0, uplineComm = 0, grossComm = 0

    monthComms.forEach(c => {
      const amt = Number(c.amount || 0)
      grossComm += amt
      const typeStr = (c.commissionType || '').toLowerCase()
      if (c.compression || c.compressionReason?.includes('Vacant')) {
        gapComm += amt
      } else if (typeStr === 'direct' || typeStr === 'direct_own') {
        directComm += amt
      } else {
        uplineComm += amt
      }
    })

    const tds = grossComm * 0.05
    const adminCharge = grossComm * 0.05
    const netComm = grossComm - tds - adminCharge

    // 3. Activity Summary
    const monthCustomers = enrolledCustomers.data.filter(c => matchMonthYear(c.createdAt))
    const monthPayments = payments.data.filter(p => matchMonthYear(p.paidDate || p.createdAt))

    // 4. Policy Details for selected month
    const policyDetails = monthPlans.map(p => {
      const isRD = (p.planType || p.type || '').toUpperCase().startsWith('RD')
      const busAmt = isRD ? Number(p.monthlyAmount || 0) : Number(p.fdAmount || 0)
      const payAmt = Number(p.totalPaid || p.monthlyAmount || p.fdAmount || 0)

      // Find matched commission for this policy
      const matchedComms = monthComms.filter(c => c.policyNumber === p.policyNumber || c.policyId === p.id)
      const earned = matchedComms.reduce((sum, c) => sum + Number(c.amount || 0), 0)
      const commStatus = matchedComms.length > 0 ? matchedComms[0].status : (p.status || 'unpaid')

      return {
        id: p.id,
        policyNumber: p.policyNumber || p.planAccountNumber || '—',
        customerName: p.customerName || '—',
        planCode: p.type || p.planCode || '—',
        planType: p.planType || (isRD ? 'RD' : 'FD'),
        startDate: p.startDate ? fmtDate(p.startDate) : '—',
        businessAmount: busAmt,
        paymentAmount: payAmt,
        commissionEarned: earned,
        commissionStatus: commStatus
      }
    })

    return {
      rdCount, fdCount, pensionCount, totalPolicies,
      rdBusiness, fdBusiness, pensionBusiness, totalBusiness,
      directComm, gapComm, uplineComm, grossComm, tds, adminCharge, netComm,
      customersAddedCount: monthCustomers.length,
      policiesCreatedCount: totalPolicies,
      paymentsCount: monthPayments.length,
      policyDetails
    }
  }, [ownPlans.data, commissions.data, enrolledCustomers.data, payments.data, perfMonth, perfYear, loading])

  // ── EXPORT PAYOUT EXCEL FOR AGENT ──────────────────────────────────────────────
  const handleExportAgentPayoutExcel = () => {
    if (!payouts.data || payouts.data.length === 0) {
      toast.error('No payout history available for export.')
      return
    }

    setExportingExcel(true)
    const toastId = toast.loading('Generating Agent Payout Excel...')

    try {
      const bank = profile?.bankDetails || {}
      const hasBankDetails = Boolean(bank.bankName?.trim() && bank.accountNumber?.trim() && bank.ifscCode?.trim())

      const exportRows = payouts.data.map((p, idx) => ({
        'Sr. No.': idx + 1,
        'Agent Code': profile?.sponsorCode || profile?.agentCode || '—',
        'Agent Name': profile?.name || '—',
        'PAN Number': profile?.pan || profile?.panNumber || '—',
        'Account Holder Name': bank.accountHolderName?.trim() || profile?.name || (hasBankDetails ? '—' : 'Bank Details Pending'),
        'Bank Name': bank.bankName?.trim() || (hasBankDetails ? '—' : 'Bank Details Pending'),
        'Account Number': bank.accountNumber?.trim() || (hasBankDetails ? '—' : 'Bank Details Pending'),
        'IFSC Code': bank.ifscCode?.trim() || (hasBankDetails ? '—' : 'Bank Details Pending'),
        'Bank Branch': bank.branch?.trim() || (hasBankDetails ? '—' : 'Bank Details Pending'),
        'Gross Commission (₹)': p.grossCommission || 0,
        'TDS 5% (₹)': p.tds || 0,
        'Admin Charge 5% (₹)': p.adminCharge || 0,
        'Other Deductions (₹)': p.otherDeductions || 0,
        'Net Payable (₹)': p.netPayable || 0,
        'Payout ID': p.id || '—',
        'Payout Period': `${p.month}/${p.year}`,
        'Status': p.status || 'generated'
      }))

      const ws = xlsx.utils.json_to_sheet(exportRows)
      const wb = xlsx.utils.book_new()
      xlsx.utils.book_append_sheet(wb, ws, 'Agent Payout Statement')

      const fileName = `AGENT_PAYOUT_STATEMENT_${profile?.sponsorCode || 'MY_ACCOUNT'}.xlsx`
      xlsx.writeFile(wb, fileName)

      toast.success('Agent Payout Excel exported successfully!', { id: toastId })
    } catch (err) {
      console.error('Error exporting Agent Payout Excel:', err)
      toast.error(`Export failed: ${err.message}`, { id: toastId })
    } finally {
      setExportingExcel(false)
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

  const companyName = settings?.companyName || 'Apex Multisolutions'
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
                {formatINR(stats.lifetimeBusinessVolume)} / {formatINR(next.promoTarget || 0)}
              </span>
            </div>
            <div className="w-full bg-navy-2 rounded-full h-2 overflow-hidden border border-navy-4">
              <div 
                className="bg-gold h-2 rounded-full transition-all duration-300" 
                style={{ width: `${Math.min(100, next.promoTarget ? (stats.lifetimeBusinessVolume / next.promoTarget) * 100 : 100)}%` }} 
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
                    const isRD = (p.planType || p.type || '').toLowerCase().startsWith('rd')
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
        {/* Payout Statements List & Excel Export */}
        <div className="card p-5 space-y-4 md:col-span-1">
          <div className="flex items-center justify-between border-b border-navy-4/50 pb-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan">
              Monthly Payout History
            </h3>
            <button
              onClick={handleExportAgentPayoutExcel}
              disabled={exportingExcel || !stats.sortedPayouts.length}
              className="btn-gold px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold flex items-center gap-1 disabled:opacity-50"
            >
              <IDoc size={12} />
              {exportingExcel ? 'Exporting...' : 'Export Payout Excel'}
            </button>
          </div>
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
                    <span className="font-bold text-ink-1 font-mono">{formatINR(p.netPayable || p.totalPayable)}</span>
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
                    <span className="text-[10px] text-ink-2 uppercase block">Gross Commission</span>
                    <span className="text-sm font-bold text-ink-1">{formatINR(selectedPayout.grossCommission || selectedPayout.totalCommission)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-ink-2 uppercase block">TDS (5%)</span>
                    <span className="text-sm font-bold text-red-400">-{formatINR(selectedPayout.tds || 0)}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div>
                    <span className="text-[10px] text-ink-2 uppercase block">Admin Charge (5%)</span>
                    <span className="text-sm font-bold text-red-400">-{formatINR(selectedPayout.adminCharge || 0)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-ink-2 uppercase block">Other Deductions</span>
                    <span className="text-sm font-bold text-ink-1">{formatINR(selectedPayout.otherDeductions || 0)}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center border-t border-navy-4 pt-3">
                <span className="text-sm font-bold text-ink-1 font-serif">Total Net Payable</span>
                <span className="text-lg font-bold text-gold font-serif">{formatINR(selectedPayout.netPayable || selectedPayout.totalPayable)}</span>
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

      {/* ── MY MONTHLY PERFORMANCE SECTION ───────────────────────────────────── */}
      {monthlyPerformance && (
        <div className="card p-6 space-y-6 bg-navy-3/80 border border-gold-1/30">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-navy-4 pb-4">
            <div>
              <h2 className="text-lg font-bold text-gold font-serif uppercase tracking-wider">
                MY MONTHLY PERFORMANCE
              </h2>
              <p className="text-xs text-ink-2">Personal performance summary for the selected period.</p>
            </div>
            <div className="flex items-center gap-3">
              <div>
                <label className="text-[10px] text-ink-2 uppercase font-bold block mb-1">Month</label>
                <select
                  value={perfMonth}
                  onChange={e => setPerfMonth(Number(e.target.value))}
                  className="bg-navy-2 border border-navy-4 rounded text-xs px-3 py-1.5 font-semibold text-ink-1 focus:border-gold"
                >
                  {[
                    'January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'
                  ].map((m, idx) => (
                    <option key={idx + 1} value={idx + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-ink-2 uppercase font-bold block mb-1">Year</label>
                <select
                  value={perfYear}
                  onChange={e => setPerfYear(Number(e.target.value))}
                  className="bg-navy-2 border border-navy-4 rounded text-xs px-3 py-1.5 font-semibold text-ink-1 focus:border-gold"
                >
                  {[2024, 2025, 2026, 2027, 2028].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 1. POLICY / BUSINESS SUMMARY */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan">
              Policy / Business Summary
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-3 bg-navy-2/60 rounded border border-navy-4">
                <span className="text-[10px] text-ink-2 uppercase block">RD Policies / Business</span>
                <span className="text-xs font-bold text-ink-1 block mt-0.5">{monthlyPerformance.rdCount} Policies</span>
                <span className="text-sm font-extrabold text-gold font-mono">{formatINR(monthlyPerformance.rdBusiness)}</span>
              </div>
              <div className="p-3 bg-navy-2/60 rounded border border-navy-4">
                <span className="text-[10px] text-ink-2 uppercase block">FD Policies / Business</span>
                <span className="text-xs font-bold text-ink-1 block mt-0.5">{monthlyPerformance.fdCount} Policies</span>
                <span className="text-sm font-extrabold text-gold font-mono">{formatINR(monthlyPerformance.fdBusiness)}</span>
              </div>
              <div className="p-3 bg-navy-2/60 rounded border border-navy-4">
                <span className="text-[10px] text-ink-2 uppercase block">Pension Policies / Business</span>
                <span className="text-xs font-bold text-ink-1 block mt-0.5">{monthlyPerformance.pensionCount} Policies</span>
                <span className="text-sm font-extrabold text-gold font-mono">{formatINR(monthlyPerformance.pensionBusiness)}</span>
              </div>
              <div className="p-3 bg-navy-2/60 rounded border border-navy-4 border-l-2 border-l-gold">
                <span className="text-[10px] text-ink-2 uppercase block font-bold">Total Policies / Business</span>
                <span className="text-xs font-bold text-ink-1 block mt-0.5">{monthlyPerformance.totalPolicies} Policies</span>
                <span className="text-sm font-extrabold text-gold font-mono">{formatINR(monthlyPerformance.totalBusiness)}</span>
              </div>
            </div>
          </div>

          {/* 2. COMMISSION SUMMARY */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan">
              Commission Summary
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div className="p-3 bg-navy-2/60 rounded border border-navy-4">
                <span className="text-[10px] text-ink-2 uppercase block">Direct Commission</span>
                <span className="text-sm font-bold text-ink-1 font-mono">{formatINR(monthlyPerformance.directComm)}</span>
              </div>
              <div className="p-3 bg-navy-2/60 rounded border border-navy-4">
                <span className="text-[10px] text-ink-2 uppercase block">Gap / Compression</span>
                <span className="text-sm font-bold text-ink-1 font-mono">{formatINR(monthlyPerformance.gapComm)}</span>
              </div>
              <div className="p-3 bg-navy-2/60 rounded border border-navy-4">
                <span className="text-[10px] text-ink-2 uppercase block">Upline Commission</span>
                <span className="text-sm font-bold text-ink-1 font-mono">{formatINR(monthlyPerformance.uplineComm)}</span>
              </div>
              <div className="p-3 bg-navy-2/60 rounded border border-navy-4">
                <span className="text-[10px] text-ink-2 uppercase block">Gross Commission</span>
                <span className="text-sm font-bold text-gold font-mono">{formatINR(monthlyPerformance.grossComm)}</span>
              </div>
              <div className="p-3 bg-navy-2/60 rounded border border-navy-4">
                <span className="text-[10px] text-ink-2 uppercase block">TDS (5%)</span>
                <span className="text-sm font-bold text-red-400 font-mono">-{formatINR(monthlyPerformance.tds)}</span>
              </div>
              <div className="p-3 bg-navy-2/60 rounded border border-navy-4">
                <span className="text-[10px] text-ink-2 uppercase block">Admin Charge (5%)</span>
                <span className="text-sm font-bold text-red-400 font-mono">-{formatINR(monthlyPerformance.adminCharge)}</span>
              </div>
              <div className="p-3 bg-navy-2/60 rounded border border-navy-4 border-l-2 border-l-ok col-span-2">
                <span className="text-[10px] text-ink-2 uppercase block font-bold">Net Commission</span>
                <span className="text-base font-extrabold text-ok font-mono">{formatINR(monthlyPerformance.netComm)}</span>
              </div>
            </div>
          </div>

          {/* 3. ACTIVITY SUMMARY */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan">
              Activity Summary
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-center text-xs">
              <div className="p-2.5 bg-navy-2/60 rounded border border-navy-4">
                <span className="text-[9px] text-ink-2 uppercase block">Customers Added</span>
                <span className="text-base font-bold text-ink-1 mt-0.5 block">{monthlyPerformance.customersAddedCount}</span>
              </div>
              <div className="p-2.5 bg-navy-2/60 rounded border border-navy-4">
                <span className="text-[9px] text-ink-2 uppercase block">Policies Created</span>
                <span className="text-base font-bold text-ink-1 mt-0.5 block">{monthlyPerformance.policiesCreatedCount}</span>
              </div>
              <div className="p-2.5 bg-navy-2/60 rounded border border-navy-4">
                <span className="text-[9px] text-ink-2 uppercase block">Payments / Installments</span>
                <span className="text-base font-bold text-ink-1 mt-0.5 block">{monthlyPerformance.paymentsCount}</span>
              </div>
              <div className="p-2.5 bg-navy-2/60 rounded border border-navy-4">
                <span className="text-[9px] text-ink-2 uppercase block">RD Count</span>
                <span className="text-base font-bold text-ink-1 mt-0.5 block">{monthlyPerformance.rdCount}</span>
              </div>
              <div className="p-2.5 bg-navy-2/60 rounded border border-navy-4">
                <span className="text-[9px] text-ink-2 uppercase block">FD Count</span>
                <span className="text-base font-bold text-ink-1 mt-0.5 block">{monthlyPerformance.fdCount}</span>
              </div>
              <div className="p-2.5 bg-navy-2/60 rounded border border-navy-4">
                <span className="text-[9px] text-ink-2 uppercase block">Pension Count</span>
                <span className="text-base font-bold text-ink-1 mt-0.5 block">{monthlyPerformance.pensionCount}</span>
              </div>
            </div>
          </div>

          {/* 4. POLICY DETAILS */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gold-tan">
              Policy Details ({monthlyPerformance.policyDetails.length})
            </h3>
            {monthlyPerformance.policyDetails.length ? (
              <div className="table-wrap">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th>Policy Number</th>
                      <th>Customer Name</th>
                      <th>Plan Code</th>
                      <th>Plan Type</th>
                      <th>Start Date</th>
                      <th className="text-right">Business Amount</th>
                      <th className="text-right">Payment Amount</th>
                      <th className="text-right">Commission Earned</th>
                      <th className="text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyPerformance.policyDetails.map(p => (
                      <tr key={p.id}>
                        <td className="font-mono text-gold font-semibold">{p.policyNumber}</td>
                        <td className="font-semibold text-ink-1">{p.customerName}</td>
                        <td className="uppercase font-semibold text-ink-2">{p.planCode}</td>
                        <td className="uppercase font-semibold text-ink-2">{p.planType}</td>
                        <td className="font-mono text-ink-2">{p.startDate}</td>
                        <td className="text-right font-mono font-semibold text-ink-1">{formatINR(p.businessAmount)}</td>
                        <td className="text-right font-mono font-semibold text-ink-1">{formatINR(p.paymentAmount)}</td>
                        <td className="text-right font-mono font-bold text-gold">{formatINR(p.commissionEarned)}</td>
                        <td className="text-center">
                          <StatusBadge status={p.commissionStatus} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-ink-2 italic py-4 text-center">No policies created in the selected month/year.</p>
            )}
          </div>
        </div>
      )}

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

        {commissions.data.length ? (
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
                {commissions.data.map(log => (
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
                    <td className="text-ink-2 font-mono">{log.percentage ? `${Number(log.percentage).toFixed(2)}%` : '—'}</td>
                    <td className="text-right font-bold text-gold">{formatINR(log.amount)}</td>
                    <td className="text-center">
                      <button
                        type="button"
                        onClick={() => setSelectedComm(log)}
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
          <p className="text-xs text-ink-2 italic py-4 text-center">No personal commission ledger logs recorded under your account yet.</p>
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
                onClick={() => setSelectedComm(null)}
                className="text-gray-400 hover:text-gray-600 font-bold text-lg p-1"
              >
                ✕
              </button>
            </div>

            {/* Modal Scrollable Content */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
              {/* Printable Container */}
              <div id="commission-statement-pdf" className="bg-white text-black p-8 font-sans space-y-6">
                
                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-gray-200 pb-6 gap-4">
                  <div className="flex items-center gap-4">
                    <Logo size={46} showText={false} />
                    <div>
                      <h1 className="text-2xl font-serif font-black tracking-tight">{companyName}</h1>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Apex Multisolutions Branch Operations Portal</p>
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
                      <span className="font-bold text-gray-800 text-xs block mt-0.5">{Number(selectedComm.percentage || 0).toFixed(2)}%</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block uppercase">Commission Earned</span>
                      <span className="font-bold text-gold text-xs block mt-0.5">{formatINR(selectedComm.amount)}</span>
                    </div>
                  </div>
                </div>

                {/* Payment Details */}
                <div className="border-t border-gray-100 pt-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Statement Breakdown</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 p-3 rounded-lg border border-gray-100 text-[10px]">
                    <div>
                      <span className="text-gray-500 block">Gross Commission</span>
                      <span className="font-bold text-gray-800 text-xs">{formatINR(selectedComm.amount || 0)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">TDS Deduction (5%)</span>
                      <span className="font-bold text-red-600 text-xs">-{formatINR((selectedComm.amount || 0) * 0.05)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Admin Charge (5%)</span>
                      <span className="font-bold text-red-600 text-xs">-{formatINR((selectedComm.amount || 0) * 0.05)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Net Commission</span>
                      <span className="font-bold text-green-600 text-xs">{formatINR((selectedComm.amount || 0) * 0.9)}</span>
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
            </div>

            {/* Modal Action Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl print:hidden">
              <button 
                type="button"
                onClick={() => window.print()}
                className="btn-dark px-4 py-2 text-xs uppercase font-bold tracking-wide flex items-center gap-1.5"
              >
                <IPrint size={14} /> Print Statement
              </button>
              <button 
                type="button" 
                onClick={() => setSelectedComm(null)}
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
